import { Redis } from "@upstash/redis";

/**
 * ============================================================================
 * REAL-TIME REFRESH SYSTEM (Upstash-backed)
 * Synchronizes client-side UI with server-side mutations using a shared
 * version counter. Stored in Upstash Redis so every Vercel instance sees
 * the same number — the previous filesystem-backed implementation silently
 * no-op'd on Vercel because the disk is read-only.
 * ============================================================================
 */

const VERSION_KEY = "vms:realtime:version";

const redis = Redis.fromEnv();

/**
 * Signals a data mutation by incrementing the shared version counter.
 * Fire-and-forget: errors are swallowed so a Redis hiccup never breaks
 * the user-facing action that triggered the mutation. Clients will pick
 * up the change on the next successful poll either way.
 */
export function notifyClients(_eventType: string): void {
    redis.incr(VERSION_KEY).catch((err) => {
        console.error("[notify] failed to increment version:", err);
    });
}

/**
 * Retrieves the current data version for client-side comparison.
 * Returns 0 if the key is missing or Redis is unreachable, matching the
 * pre-existing fallback semantics so polling clients stay quiet.
 */
export async function getDataVersion(): Promise<number> {
    try {
        const value = await redis.get<number>(VERSION_KEY);
        return typeof value === "number" ? value : 0;
    } catch (err) {
        console.error("[notify] failed to read version:", err);
        return 0;
    }
}
