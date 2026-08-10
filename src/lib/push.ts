import webpush, { WebPushError } from "web-push";
import {
    deleteSubscriptionByEndpoint,
    getAdminSubscriptions,
    getDriverSubscriptions,
    markDelivered,
    markFailed,
    type StoredSubscription,
} from "@/lib/pushStore";

/**
 * ============================================================================
 * WEB PUSH TRANSPORT
 *
 * Encrypts and delivers notifications to registered devices (see
 * src/lib/pushStore.ts for the registry). Sibling of src/lib/email.ts: one
 * transport, configured by env, with an explicit "not configured" state so a
 * missing key degrades to a server-side log rather than a user-facing crash.
 *
 * WHY THESE SENDS ARE AWAITED, not fire-and-forget like notifyClients():
 * notifyClients writes to Postgres over a pool that flushes on its own; an
 * un-awaited push is an outbound HTTPS request, and Vercel freezes the lambda
 * the instant the action's response is sent. An un-awaited push therefore
 * delivers only when the runtime happens not to have frozen yet — the exact
 * kind of intermittent failure this feature already suffered from. Every send
 * is instead awaited, fanned out in parallel (so N devices cost one round
 * trip), bounded by SEND_TIMEOUT_MS, and can never throw into the caller.
 * ============================================================================
 */

/** Ceiling on a whole fan-out, so a wedged push service can't stall an action. */
const SEND_TIMEOUT_MS = 4_000;

/** Default push-service retention: hold the message for a day if the phone is off. */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/**
 * What the service worker's `push` handler receives, verbatim. Keep it small —
 * the encrypted payload budget is ~4KB and every field here is shipped to
 * every device.
 */
export type PushPayload = {
    title: string;
    body: string;
    /** Same-origin path opened when the notification is tapped. */
    url?: string;
    /**
     * Collapse key. A new notification with the same tag REPLACES the one on
     * screen instead of stacking, which is what keeps a driver's lock screen
     * from filling up with five near-identical assignment alerts.
     */
    tag?: string;
    /** Keeps the notification on screen until explicitly dismissed. */
    requireInteraction?: boolean;
};

export type PushSendResult = {
    /** Devices the push service accepted the message for. */
    sent: number;
    /** Devices that failed for any reason (including ones we then pruned). */
    failed: number;
    /** Rows deleted because the endpoint is permanently gone (404/410). */
    pruned: number;
    /** Set when nothing was attempted; distinguishes "off" from "no devices". */
    skipped?: "not-configured" | "no-subscriptions";
};

const EMPTY: PushSendResult = { sent: 0, failed: 0, pruned: 0 };

type VapidDetails = { subject: string; publicKey: string; privateKey: string };

/**
 * Reads VAPID config from env.
 *
 * Note there is deliberately NO `NEXT_PUBLIC_` copy of the public key. The
 * browser needs it to call `pushManager.subscribe()`, but a NEXT_PUBLIC_ var is
 * inlined at build time — the same trap already documented for the Supabase
 * keys, where rotating a value in Vercel silently does nothing until a
 * redeploy. The client fetches it at runtime instead, via the
 * `getVapidPublicKey` server action.
 */
function readVapid(): VapidDetails | null {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) return null;

    // The push service requires a contact for the application server. Falls
    // back to the deployment origin, which is always a valid `https:` subject.
    const subject =
        process.env.VAPID_SUBJECT ||
        process.env.APP_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "mailto:ops@example.com";

    return { subject, publicKey, privateKey };
}

/** True when VAPID keys are present. Check before promising a user anything. */
export function isPushConfigured(): boolean {
    return readVapid() !== null;
}

/** The application-server public key the browser needs to subscribe. */
export function getVapidPublicKeyOrNull(): string | null {
    return readVapid()?.publicKey ?? null;
}

/**
 * Delivers one payload to an explicit set of devices.
 *
 * Failure handling is the interesting part. A 404 or 410 from the push service
 * means the subscription is permanently dead (app uninstalled, browser data
 * cleared, endpoint expired) — those rows are deleted immediately, because
 * they will never work again and would otherwise slow down every future send.
 * Anything else (429, 5xx, network) is retryable, so the row survives with an
 * incremented failure count and is pruned only after repeated failures.
 */
export async function sendToSubscriptions(
    subs: StoredSubscription[],
    payload: PushPayload,
    opts?: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high" }
): Promise<PushSendResult> {
    const vapid = readVapid();
    if (!vapid) {
        console.warn(
            `[push] VAPID keys unset — would have sent "${payload.title}" to ${subs.length} device(s). ` +
                `Run \`npx web-push generate-vapid-keys\` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.`
        );
        return { ...EMPTY, skipped: "not-configured" };
    }
    if (!subs.length) return { ...EMPTY, skipped: "no-subscriptions" };

    const body = JSON.stringify(payload);
    const delivered: string[] = [];
    const softFailed: string[] = [];
    const dead: string[] = [];

    const fanOut = Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: sub.keys },
                    body,
                    {
                        vapidDetails: vapid,
                        TTL: opts?.ttlSeconds ?? DEFAULT_TTL_SECONDS,
                        urgency: opts?.urgency ?? "normal",
                    }
                );
                delivered.push(sub.endpoint);
            } catch (err) {
                const status = err instanceof WebPushError ? err.statusCode : 0;
                if (status === 404 || status === 410) {
                    dead.push(sub.endpoint);
                } else {
                    softFailed.push(sub.endpoint);
                    console.error(`[push] delivery failed (${status || "network"}) for one endpoint:`, err);
                }
            }
        })
    );

    // A wedged push service must not hold an admin's "Push stock" button
    // hostage. Anything still in flight past the ceiling is abandoned; the
    // bookkeeping below just records what had resolved by then.
    await Promise.race([
        fanOut,
        new Promise((resolve) => setTimeout(resolve, SEND_TIMEOUT_MS)),
    ]);

    try {
        await Promise.all([
            markDelivered(delivered),
            markFailed(softFailed),
            ...dead.map((endpoint) => deleteSubscriptionByEndpoint(endpoint)),
        ]);
    } catch (err) {
        // Bookkeeping is best-effort; the notifications already went out.
        console.error("[push] failed to record delivery outcomes:", err);
    }

    return {
        sent: delivered.length,
        failed: softFailed.length + dead.length,
        pruned: dead.length,
    };
}

/** Notifies every device belonging to one driver. Never throws. */
export async function sendPushToDriver(
    driverId: number,
    payload: PushPayload,
    opts?: { urgency?: "very-low" | "low" | "normal" | "high" }
): Promise<PushSendResult> {
    try {
        const subs = await getDriverSubscriptions(driverId);
        return await sendToSubscriptions(subs, payload, opts);
    } catch (err) {
        console.error(`[push] sendPushToDriver(${driverId}) failed:`, err);
        return { ...EMPTY, failed: 1 };
    }
}

/** Notifies every admin/super-admin device — the "ops" audience. Never throws. */
export async function sendPushToAdmins(
    payload: PushPayload,
    opts?: { urgency?: "very-low" | "low" | "normal" | "high" }
): Promise<PushSendResult> {
    try {
        const subs = await getAdminSubscriptions();
        return await sendToSubscriptions(subs, payload, opts);
    } catch (err) {
        console.error("[push] sendPushToAdmins failed:", err);
        return { ...EMPTY, failed: 1 };
    }
}
