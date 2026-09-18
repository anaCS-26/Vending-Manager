import { headers } from "next/headers";
import { auth } from "@/proxy";
import prisma from "@/lib/prisma";
import { classifyError, formatUserError, makeReferenceCode } from "@/lib/error-codes";

/**
 * ============================================================================
 * SERVER ACTION FAILURE PATH
 *
 * Every `catch` in src/actions/* ends in `return actionFailure(error, …)`.
 * It replaced ~50 copies of `error instanceof Error ? error.message : "…"`,
 * which handed whatever was thrown straight to the browser — for a Prisma
 * error that is a paragraph of English naming tables and constraints, shown to
 * an Arabic-speaking client who could only forward a photo of it.
 *
 * Now: the failure is recorded in `ErrorEvent` under a short code, and the
 * caller gets either the app's own business message unchanged, or a plain
 * bilingual sentence ending in that code. Look codes up at /super/support.
 * ============================================================================
 */

/** A recording that outlives this is abandoned — the user is waiting on the toast. */
const RECORD_TIMEOUT_MS = 2000;

const MAX_MESSAGE = 2000;
const MAX_STACK = 6000;

export type ErrorEventInput = {
    code: string;
    source: "action" | "client" | "boundary";
    action?: string | null;
    kind: string;
    expected: boolean;
    message: string;
    stack?: string | null;
    prismaCode?: string | null;
    actorId?: number | null;
    actorRole?: string | null;
    path?: string | null;
    userAgent?: string | null;
};

/**
 * Writes one ErrorEvent. Awaited by callers (Vercel freezes the lambda once the
 * response is sent, so fire-and-forget is fire-and-maybe), capped, and — like
 * the push senders — **can never throw into the caller**: this runs inside a
 * catch block, and a failure path that fails has nowhere left to report to.
 */
export async function recordErrorEvent(input: ErrorEventInput): Promise<void> {
    try {
        const write = prisma.errorEvent.create({
            data: {
                code: input.code,
                source: input.source,
                action: input.action?.slice(0, 200) ?? null,
                kind: input.kind,
                expected: input.expected,
                message: input.message.slice(0, MAX_MESSAGE),
                stack: input.stack?.slice(0, MAX_STACK) ?? null,
                prismaCode: input.prismaCode ?? null,
                actorId: input.actorId ?? null,
                actorRole: input.actorRole ?? null,
                path: input.path?.slice(0, 300) ?? null,
                userAgent: input.userAgent?.slice(0, 400) ?? null,
            },
        });
        await Promise.race([
            write,
            new Promise((resolve) => setTimeout(resolve, RECORD_TIMEOUT_MS)),
        ]);
    } catch (err) {
        console.error("[error-event] failed to record:", err);
    }
}

export type Actor = {
    actorId: number | null;
    actorRole: string | null;
    actorName: string | null;
    userAgent: string | null;
    path: string | null;
};

/** Best-effort actor + request context. Never throws. */
export async function currentActor(): Promise<Actor> {
    const actor: Actor = { actorId: null, actorRole: null, actorName: null, userAgent: null, path: null };
    try {
        const session = await auth();
        const user = session?.user as { id?: string; role?: string; name?: string | null } | undefined;
        const id = user?.id ? parseInt(user.id, 10) : NaN;
        actor.actorId = Number.isFinite(id) ? id : null;
        actor.actorRole = user?.role ?? null;
        actor.actorName = user?.name ?? null;
    } catch {
        // No session is a legitimate state here (expired mid-action).
    }
    try {
        const h = await headers();
        actor.userAgent = h.get("user-agent");
        // A server action POSTs to the page it was invoked from, so the
        // Referer is the screen the user was looking at.
        const referer = h.get("referer");
        if (referer) actor.path = new URL(referer).pathname;
    } catch {
        // headers() is unavailable outside a request (cron, scripts).
    }
    return actor;
}

/**
 * The one way an action reports failure.
 *
 * @param action    the exported action's name — what gets searched for later
 * @param fallback  shown only if something that isn't an `Error` was thrown
 */
export async function actionFailure(
    error: unknown,
    action: string,
    fallback: string,
): Promise<{ success: false; error: string; code: string }> {
    const classification = classifyError(error);
    const code = makeReferenceCode("E");

    // Unexpected failures also go to the function log, where the stack is
    // greppable by code even if the database is what just went down.
    if (!classification.expected) console.error(`[action-error] ${code} ${action}:`, error);

    const actor = await currentActor();
    await recordErrorEvent({
        code,
        source: "action",
        action,
        kind: classification.kind,
        expected: classification.expected,
        message: error instanceof Error ? error.message : `${fallback} (non-Error thrown: ${String(error)})`,
        stack: error instanceof Error ? error.stack : null,
        prismaCode: classification.prismaCode,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        path: actor.path,
        userAgent: actor.userAgent,
    });

    return { success: false, error: formatUserError(error, classification, code, fallback), code };
}

/** ErrorEvent rows older than this are deleted by the daily cron. */
export const ERROR_EVENT_RETENTION_DAYS = 90;

/**
 * Drops old error events. A code is only useful while someone might still
 * send it; past 90 days the row is just stacks and user agents being kept for
 * no reason. Problem reports are NOT pruned — they are correspondence.
 */
export async function pruneErrorEvents(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ERROR_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await prisma.errorEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return count;
}
