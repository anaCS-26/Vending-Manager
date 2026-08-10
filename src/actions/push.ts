"use server"

import { headers } from "next/headers"
import { requireDriver } from "@/lib/auth-utils"
import { writeAuditLog } from "@/lib/audit-utils"
import { pushTestRateLimit } from "@/lib/rate-limit"
import { getVapidPublicKeyOrNull, isPushConfigured, sendToSubscriptions } from "@/lib/push"
import {
    countSubscriptions,
    deleteSubscription,
    getOwnerSubscriptions,
    saveSubscription,
    type PushOwner,
    type PushSubscriptionData,
} from "@/lib/pushStore"
import type { ActionResult, PushRegistrationStatus } from "@/types"

/**
 * ============================================================================
 * PUSH NOTIFICATION REGISTRATION
 *
 * Device registration for Web Push. Every action here is a "manage my own
 * devices" operation — a driver and an admin have identical rights over their
 * own subscriptions and none at all over anyone else's.
 *
 * That property is enforced structurally: the owner is ALWAYS derived from the
 * session by resolvePushOwner() and is never a parameter. There is deliberately
 * no way for a caller to name a driverId, so no amount of tampering with the
 * client bundle lets one driver register a device against another's account and
 * start receiving their assignment alerts.
 * ============================================================================
 */

/** Hard cap on devices per user. A phone, a tablet, a desktop — ten is generous. */
const MAX_DEVICES_PER_OWNER = 10

/**
 * Mandatory guard, then owner resolution.
 *
 * requireDriver() is the shared guard that admits driver | admin | super_admin,
 * i.e. "any authenticated user of this app" — which is exactly the audience for
 * notifications. It's used here rather than an inline `auth()` check because
 * three competing auth idioms is how the two missing-guard bugs in
 * inventory.ts went unnoticed.
 */
async function resolvePushOwner(): Promise<PushOwner> {
    const session = await requireDriver()
    const role = (session.user as any).role
    const id = parseInt((session.user as any).id, 10)
    if (!Number.isFinite(id)) throw new Error("UNAUTHORIZED: Invalid session.")
    return role === "driver" ? { kind: "driver", id } : { kind: "admin", id }
}

/** Same, but also hands back the session for audit attribution. */
async function resolvePushOwnerWithSession() {
    const session = await requireDriver()
    const role = (session.user as any).role
    const id = parseInt((session.user as any).id, 10)
    if (!Number.isFinite(id)) throw new Error("UNAUTHORIZED: Invalid session.")
    const owner: PushOwner = role === "driver" ? { kind: "driver", id } : { kind: "admin", id }
    return { session, owner }
}

/**
 * Everything the client needs to decide what to render, in one round trip.
 *
 * `publicKey` is served at runtime rather than baked into the bundle as a
 * NEXT_PUBLIC_ var. Same reasoning as the note in src/lib/push.ts: the Supabase
 * keys already demonstrate how a build-time value turns a config change into a
 * silent no-op until someone remembers to redeploy.
 */
export async function getPushRegistrationStatus(): Promise<PushRegistrationStatus> {
    const owner = await resolvePushOwner()
    return {
        configured: isPushConfigured(),
        publicKey: getVapidPublicKeyOrNull(),
        deviceCount: await countSubscriptions(owner),
        maxDevices: MAX_DEVICES_PER_OWNER,
    }
}

/**
 * Registers this browser for notifications, or refreshes an existing
 * registration. Idempotent by endpoint, so the client can (and does) call it on
 * every mount to repair a subscription the browser rotated while the app was
 * closed — see the pushsubscriptionchange note in src/app/sw.ts.
 */
export async function savePushSubscription(
    sub: PushSubscriptionData
): Promise<ActionResult<{ deviceCount: number }>> {
    const { session, owner } = await resolvePushOwnerWithSession()
    try {
        // The endpoint is a URL minted by the browser's push service, but it
        // arrives from the client, so treat it as untrusted input: anything
        // that isn't an https URL cannot be a real endpoint and has no business
        // in a table we later feed to an HTTP client.
        if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
            return { success: false, error: "Incomplete push subscription." }
        }
        let parsed: URL
        try {
            parsed = new URL(sub.endpoint)
        } catch {
            return { success: false, error: "Malformed push endpoint." }
        }
        if (parsed.protocol !== "https:") {
            return { success: false, error: "Push endpoint must be https." }
        }
        if (sub.endpoint.length > 2048 || sub.keys.p256dh.length > 512 || sub.keys.auth.length > 512) {
            return { success: false, error: "Push subscription fields are implausibly long." }
        }

        // Cap devices per owner. Checked before the upsert so re-registering an
        // existing device at the cap still succeeds (it consumes no new slot).
        const existingCount = await countSubscriptions(owner)
        if (existingCount >= MAX_DEVICES_PER_OWNER) {
            const mine = await getOwnerSubscriptions(owner)
            if (!mine.some((s) => s.endpoint === sub.endpoint)) {
                return {
                    success: false,
                    error: `Device limit reached (${MAX_DEVICES_PER_OWNER}). Turn notifications off on an old device first.`,
                }
            }
        }

        const ua = (await headers()).get("user-agent")
        const { created } = await saveSubscription(owner, sub, ua)

        // Only genuinely new devices are audited. The client re-syncs on every
        // mount, so auditing updates too would bury the trail in noise.
        if (created) {
            await writeAuditLog(
                session,
                "PUSH_SUBSCRIBE",
                owner.kind === "driver" ? "Driver" : "Admin",
                owner.id,
                null,
                { userAgent: ua ?? null },
                "Registered a device for push notifications."
            )
        }

        return { success: true, data: { deviceCount: await countSubscriptions(owner) } }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to save push subscription",
        }
    }
}

/** Unregisters this browser. Scoped to the caller's own endpoints. */
export async function deletePushSubscription(
    endpoint: string
): Promise<ActionResult<{ deviceCount: number }>> {
    const { session, owner } = await resolvePushOwnerWithSession()
    try {
        if (!endpoint) return { success: false, error: "No endpoint supplied." }

        const removed = await deleteSubscription(owner, endpoint)
        if (removed > 0) {
            await writeAuditLog(
                session,
                "PUSH_UNSUBSCRIBE",
                owner.kind === "driver" ? "Driver" : "Admin",
                owner.id,
                null,
                null,
                "Unregistered a device from push notifications."
            )
        }

        return { success: true, data: { deviceCount: await countSubscriptions(owner) } }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to remove push subscription",
        }
    }
}

/**
 * Fires a notification at the caller's own devices.
 *
 * Worth its own action: "did I actually enable this correctly?" is otherwise
 * unanswerable until the next real event, and on iOS in particular the
 * install-to-home-screen requirement means a driver can grant permission in a
 * browser tab and receive nothing, with no feedback that anything is wrong.
 */
export async function sendTestPush(): Promise<ActionResult<{ sent: number }>> {
    const owner = await resolvePushOwner()
    try {
        const { success } = await pushTestRateLimit.limit(`${owner.kind}:${owner.id}`)
        if (!success) {
            return { success: false, error: "Too many test notifications. Try again in a few minutes." }
        }

        if (!isPushConfigured()) {
            return { success: false, error: "Push is not configured on the server (VAPID keys missing)." }
        }

        const subs = await getOwnerSubscriptions(owner)
        if (!subs.length) {
            return { success: false, error: "No devices registered. Turn notifications on first." }
        }

        const result = await sendToSubscriptions(
            subs,
            {
                title: "Notifications are working",
                body: "This is a test from NexGen Vending. You'll get alerts like this one.",
                url: owner.kind === "driver" ? "/driver" : "/admin",
                tag: "test",
            },
            { urgency: "high" }
        )

        if (result.sent === 0) {
            return {
                success: false,
                error: "The push service rejected every device. Try turning notifications off and on again.",
            }
        }
        return { success: true, data: { sent: result.sent } }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to send test notification",
        }
    }
}
