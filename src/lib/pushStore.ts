import prisma from "@/lib/prisma";

/**
 * ============================================================================
 * PUSH SUBSCRIPTION STORE
 *
 * Persistence for Web Push registrations. This module used to be a
 * process-global `Map` marked "prototype only" — which is why push has never
 * worked in this app: on Vercel every server action can land on a cold lambda,
 * so the Map was empty far more often than not and `sendPushTo*` had nothing
 * to send to. Registrations now live in the `PushSubscription` table.
 *
 * Ownership is always derived from the caller's session by the action layer
 * (src/actions/push.ts) and passed in here as an already-resolved owner. This
 * module never reads the session, so it can also be used by the cron job,
 * which has no session at all.
 * ============================================================================
 */

/** The shape the browser's PushManager hands back, flattened for transport. */
export type PushSubscriptionData = {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
};

/** Resolved owner of a subscription. Exactly one role, never client-supplied. */
export type PushOwner =
    | { kind: "driver"; id: number }
    | { kind: "admin"; id: number };

/** A stored row, in the shape `web-push` wants. */
export type StoredSubscription = {
    id: number;
    endpoint: string;
    keys: { p256dh: string; auth: string };
};

function toStored(row: {
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
}): StoredSubscription {
    return {
        id: row.id,
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
    };
}

/**
 * Registers (or re-registers) a device.
 *
 * Upserts on `endpoint` rather than inserting: the browser returns the same
 * endpoint URL for the same registration, so a driver who signs out and back
 * in, or simply reloads, must not accumulate duplicate rows that would each
 * fire the same notification. The upsert also re-points the row at the current
 * owner, which is what makes a shared depot phone behave: whoever is signed in
 * now owns that device's notifications, and the previous driver stops
 * receiving them.
 */
export async function saveSubscription(
    owner: PushOwner,
    sub: PushSubscriptionData,
    userAgent?: string | null
): Promise<{ created: boolean }> {
    const ownerFields = {
        driverId: owner.kind === "driver" ? owner.id : null,
        adminId: owner.kind === "admin" ? owner.id : null,
    };

    // Read before write purely so the caller can tell a genuinely new device
    // from the re-sync that runs on every app mount. Without it the audit trail
    // would gain a row every time a driver opens the portal.
    const existing = await prisma.pushSubscription.findUnique({
        where: { endpoint: sub.endpoint },
        select: { id: true },
    });

    await prisma.pushSubscription.upsert({
        where: { endpoint: sub.endpoint },
        create: {
            endpoint: sub.endpoint,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
            userAgent: userAgent ?? undefined,
            ...ownerFields,
        },
        update: {
            // The keys rotate when the browser refreshes a subscription, so
            // they are part of the update, not just the create.
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
            userAgent: userAgent ?? undefined,
            lastSeenAt: new Date(),
            failureCount: 0,
            ...ownerFields,
        },
    });

    return { created: !existing };
}

/**
 * Unregisters one device. Scoped to the owner so a caller can only ever delete
 * their own endpoint, even though `endpoint` is globally unique.
 */
export async function deleteSubscription(
    owner: PushOwner,
    endpoint: string
): Promise<number> {
    const { count } = await prisma.pushSubscription.deleteMany({
        where: {
            endpoint,
            ...(owner.kind === "driver" ? { driverId: owner.id } : { adminId: owner.id }),
        },
    });
    return count;
}

/** Drops an endpoint the push service has told us is permanently gone. */
export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

/** How many devices this owner currently has registered. Drives the UI toggle. */
export async function countSubscriptions(owner: PushOwner): Promise<number> {
    return prisma.pushSubscription.count({
        where: owner.kind === "driver" ? { driverId: owner.id } : { adminId: owner.id },
    });
}

/** Every device belonging to one driver. */
export async function getDriverSubscriptions(driverId: number): Promise<StoredSubscription[]> {
    const rows = await prisma.pushSubscription.findMany({
        where: { driverId },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    return rows.map(toStored);
}

/**
 * Every device belonging to any admin or super-admin — the "ops" audience for
 * disputes and stock alerts. Deliberately not filtered by role: a super-admin
 * who opted in wants the alert too.
 */
export async function getAdminSubscriptions(): Promise<StoredSubscription[]> {
    const rows = await prisma.pushSubscription.findMany({
        where: { adminId: { not: null } },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    return rows.map(toStored);
}

/** Every device belonging to one owner. Used by the "send test" action. */
export async function getOwnerSubscriptions(owner: PushOwner): Promise<StoredSubscription[]> {
    const rows = await prisma.pushSubscription.findMany({
        where: owner.kind === "driver" ? { driverId: owner.id } : { adminId: owner.id },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    return rows.map(toStored);
}

/** Marks a successful delivery. Clears any accumulated soft-failure count. */
export async function markDelivered(endpoints: string[]): Promise<void> {
    if (!endpoints.length) return;
    await prisma.pushSubscription.updateMany({
        where: { endpoint: { in: endpoints } },
        data: { lastSeenAt: new Date(), failureCount: 0 },
    });
}

/**
 * Records a retryable failure. After `maxFailures` consecutive ones the row is
 * dropped: the push service never returned a hard 404/410 but has stopped
 * accepting deliveries, and a row we can't reach is only a source of latency
 * on every future send.
 */
export async function markFailed(endpoints: string[], maxFailures = 5): Promise<void> {
    if (!endpoints.length) return;
    await prisma.pushSubscription.updateMany({
        where: { endpoint: { in: endpoints } },
        data: { failureCount: { increment: 1 } },
    });
    await prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: endpoints }, failureCount: { gte: maxFailures } },
    });
}
