import prisma from "@/lib/prisma";

/**
 * ============================================================================
 * REAL-TIME REFRESH SYSTEM (Supabase Realtime, push-based)
 * Synchronizes client UI with server-side mutations by bumping a single
 * version row. Browsers subscribe to that row over Supabase Realtime
 * (WebSocket) and refresh themselves when it changes — no polling.
 * ============================================================================
 */

const VERSION_KEY = "realtime_version";

/**
 * Signals a data mutation by incrementing the shared version counter.
 * Fire-and-forget: errors are swallowed so a transient DB hiccup never
 * breaks the user-facing action that triggered the mutation. Subscribed
 * clients pick up the next successful bump.
 *
 * The eventType arg is currently informational only (logged on failure)
 * but kept in the signature so future per-event channels are non-breaking.
 */
export function notifyClients(eventType: string): void {
    prisma.systemMeta
        .upsert({
            where: { key: VERSION_KEY },
            update: { version: { increment: BigInt(1) } },
            create: { key: VERSION_KEY, version: BigInt(1) },
        })
        .catch((err) => {
            console.error(`[notify:${eventType}] failed to bump version row:`, err);
        });
}

/**
 * Reads the current version. Retained for back-compat with the
 * `getVersion` server action, but no longer the primary path —
 * subscribed clients learn of changes via push, not poll.
 */
export async function getDataVersion(): Promise<number> {
    try {
        const row = await prisma.systemMeta.findUnique({
            where: { key: VERSION_KEY },
            select: { version: true },
        });
        return row ? Number(row.version) : 0;
    } catch (err) {
        console.error("[notify] failed to read version:", err);
        return 0;
    }
}
