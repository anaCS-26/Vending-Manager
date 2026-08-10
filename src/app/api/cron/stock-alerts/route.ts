import { timingSafeEqual } from "node:crypto";
import { runStockAlerts } from "@/lib/stock-alerts";

/**
 * ============================================================================
 * SCHEDULED STOCK-OUT ALERTS — CRON ENTRYPOINT
 *
 * A DELIBERATE EXCEPTION to the project rule that `api/auth/[...nextauth]` is
 * the only REST route. Server actions cannot be invoked on a schedule; Vercel
 * Cron dispatches an HTTP GET and nothing else, so a route handler is the only
 * way to run anything on a timer. This is the exception, not a precedent —
 * every mutation still belongs in src/actions/*.
 *
 * All the logic lives in src/lib/stock-alerts.ts. This file is the trigger and
 * the doorman, nothing more.
 *
 * AUTHORIZATION: src/proxy.ts's matcher excludes `api`, so the NextAuth
 * middleware never sees this path — it is publicly routable and must guard
 * itself. There is no session to check (cron has no user), so the guard is a
 * shared secret: Vercel sends `Authorization: Bearer $CRON_SECRET` on every
 * scheduled invocation once that env var is set. Without CRON_SECRET the route
 * refuses to run at all rather than defaulting to open — an unauthenticated
 * endpoint that fans notifications out to every admin device is a spam vector.
 * ============================================================================
 */

// Reads live data and sends push; must never be prerendered or cached.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Constant-time comparison, so the secret can't be recovered byte-by-byte. */
function secretMatches(provided: string, expected: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    // timingSafeEqual throws on a length mismatch, which would itself leak the
    // length; compare lengths separately and still run the safe compare.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
        console.error("[cron:stock-alerts] CRON_SECRET is unset — refusing to run.");
        return Response.json({ error: "Cron is not configured." }, { status: 503 });
    }

    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || !secretMatches(token, expected)) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await runStockAlerts();
        console.log("[cron:stock-alerts]", JSON.stringify(result));
        return Response.json({ ok: true, ...result });
    } catch (error) {
        // Log the detail, return a digest-free generic message: the response is
        // reachable by anyone holding the secret, and Prisma errors carry
        // column and constraint names.
        console.error("[cron:stock-alerts] run failed:", error);
        return Response.json({ ok: false, error: "Stock alert run failed." }, { status: 500 });
    }
}
