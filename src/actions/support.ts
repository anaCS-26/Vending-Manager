"use server"

import { put } from "@vercel/blob"
import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { requireDriver, requireSuperAdmin } from "@/lib/auth-utils"
import { writeAuditLog } from "@/lib/audit-utils"
import { actionFailure, currentActor, recordErrorEvent } from "@/lib/action-error"
import { makeReferenceCode } from "@/lib/error-codes"
import { clientErrorRateLimit, problemReportRateLimit } from "@/lib/rate-limit"
import { sendPushToSuperAdmins } from "@/lib/push"
import { sendProblemReportEmail } from "@/lib/email"
import { audienceForRole, validEntryIds } from "@/lib/whats-new"
import type { ActionResult } from "@/types"

/**
 * ============================================================================
 * SUPPORT: problem reports, browser crash beacons, What's New receipts.
 *
 * The three user-facing actions here share one property with src/actions/push.ts:
 * the actor is ALWAYS derived from the session and is never a parameter. A
 * report filed "as" another driver, or a release note marked seen on someone
 * else's behalf, would make the two things this file exists for — knowing who
 * hit a problem, and knowing who has been told about a feature — worthless.
 *
 * Guard is requireDriver(), i.e. any authenticated user (driver | admin |
 * super_admin). Nothing here is reachable without a session.
 * ============================================================================
 */

const MAX_NOTE = 2000
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
/** Keys the client may set in `device`. Anything else is dropped, not stored. */
const DEVICE_KEYS = ["viewport", "dpr", "standalone", "online", "language", "theme", "timezone"] as const

type SessionActor = { id: number; role: string; name: string | null }

function actorFrom(session: { user?: unknown }): SessionActor {
    const user = session.user as { id?: string; role?: string; name?: string | null }
    const id = parseInt(user.id ?? "", 10)
    if (!Number.isFinite(id) || !user.role) throw new Error("UNAUTHORIZED: Invalid session.")
    return { id, role: user.role, name: user.name ?? null }
}

function cleanDevice(raw: FormDataEntryValue | null): Record<string, string | number | boolean> | undefined {
    if (typeof raw !== "string" || raw.length > 1000) return undefined
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const out: Record<string, string | number | boolean> = {}
        for (const key of DEVICE_KEYS) {
            const v = parsed?.[key]
            if (typeof v === "string") out[key] = v.slice(0, 100)
            else if (typeof v === "number" || typeof v === "boolean") out[key] = v
        }
        return out
    } catch {
        return undefined
    }
}

/**
 * Files a problem report. Takes FormData (not an object) because it may carry
 * a screenshot File — the same shape as uploadItemImage.
 *
 * Only `note` and `screenshot` are things the reporter chose to say; the page,
 * device, user-agent and identity are attached for them. That asymmetry is the
 * point: those are exactly the facts that don't survive a language barrier.
 */
export async function submitProblemReport(formData: FormData): Promise<ActionResult<{ code: string }>> {
    const session = await requireDriver()
    try {
        const actor = actorFrom(session)

        const { success } = await problemReportRateLimit.limit(`${actor.role}:${actor.id}`)
        if (!success) {
            return { success: false, error: "Too many reports in a short time. Please try again in a few minutes.\nعدد كبير من البلاغات في وقت قصير. يرجى المحاولة بعد بضع دقائق." }
        }

        const rawNote = formData.get("note")
        const note = typeof rawNote === "string" ? rawNote.trim().slice(0, MAX_NOTE) : ""
        const rawPath = formData.get("path")
        const path = typeof rawPath === "string" && rawPath.startsWith("/") ? rawPath.slice(0, 300) : null
        const rawErrorCode = formData.get("errorCode")
        const errorCode =
            typeof rawErrorCode === "string" && /^[A-Za-z0-9-]{1,64}$/.test(rawErrorCode) ? rawErrorCode : null

        const rawFile = formData.get("screenshot")
        const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null
        if (file && !file.type.startsWith("image/")) throw new Error("The attachment must be an image.")
        if (file && file.size > MAX_SCREENSHOT_BYTES) throw new Error("The screenshot is too large (5 MB max).")

        if (!note && !file && !errorCode) {
            throw new Error("Write a few words or attach a screenshot.\nاكتب بضع كلمات أو أرفق لقطة شاشة.")
        }

        const code = makeReferenceCode("R")

        // A failed upload must not lose the report — the words matter more than
        // the picture, and the person filing it cannot be asked to try twice.
        let screenshotUrl: string | null = null
        if (file) {
            try {
                const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
                // Random suffix ON (unlike item images): the URL is public, and
                // a screenshot of an admin screen shows stock and money.
                const blob = await put(`problem-reports/${code}.${ext}`, file, { access: "public", addRandomSuffix: true })
                screenshotUrl = blob.url
            } catch (err) {
                console.error(`[support] screenshot upload failed for ${code}:`, err)
            }
        }

        const { userAgent } = await currentActor()
        await prisma.problemReport.create({
            data: {
                code,
                actorId: actor.id,
                actorRole: actor.role,
                actorName: actor.name,
                path,
                note: note || null,
                errorCode,
                screenshotUrl,
                userAgent: userAgent?.slice(0, 400) ?? null,
                device: cleanDevice(formData.get("device")),
            },
        })

        // Both sends are awaited (Vercel freezes the lambda on response) and
        // neither can throw: the report is saved, which is what was promised.
        const who = `${actor.name ?? "Unknown"} (${actor.role})`
        await Promise.all([
            sendPushToSuperAdmins(
                {
                    title: `Problem report ${code}`,
                    body: `${who}${path ? ` on ${path}` : ""}${note ? `: ${note.slice(0, 120)}` : ""}`,
                    url: "/super/support",
                    tag: `problem-report-${code}`,
                },
                { urgency: "high" }
            ),
            sendProblemReportEmail({ code, who, path, note: note || null, errorCode, screenshotUrl }).then((r) => {
                if (!r.ok) console.warn(`[support] report email not sent for ${code}: ${r.error}`)
            }).catch(() => undefined),
        ])

        revalidatePath("/super/support")
        return { success: true, data: { code } }
    } catch (error) {
        return actionFailure(error, "submitProblemReport", "Failed to send the report")
    }
}

export type ClientErrorInput = {
    source: "client" | "boundary"
    message: string
    stack?: string
    path?: string
    /** Next's error digest, when the boundary has one. It becomes the code. */
    digest?: string
}

/**
 * Crash beacon from the browser (window.onerror, unhandledrejection, and the
 * route error boundaries). Returns the code the UI should display.
 *
 * When the boundary supplies a `digest` that IS the code: it is already on the
 * user's screen and already in the Vercel log, so a second identifier would
 * only give the same failure two names.
 */
export async function reportClientError(input: ClientErrorInput): Promise<ActionResult<{ code: string }>> {
    const session = await requireDriver()
    try {
        const actor = actorFrom(session)
        const { success } = await clientErrorRateLimit.limit(`${actor.role}:${actor.id}`)
        if (!success) return { success: false, error: "Rate limited." }

        const digest = typeof input?.digest === "string" && /^[A-Za-z0-9-]{1,64}$/.test(input.digest) ? input.digest : null
        const code = digest ?? makeReferenceCode("E")
        const { userAgent } = await currentActor()

        await recordErrorEvent({
            code,
            source: input?.source === "boundary" ? "boundary" : "client",
            action: null,
            kind: "UNEXPECTED",
            expected: false,
            message: typeof input?.message === "string" && input.message ? input.message : "(no message)",
            stack: typeof input?.stack === "string" ? input.stack : null,
            actorId: actor.id,
            actorRole: actor.role,
            path: typeof input?.path === "string" && input.path.startsWith("/") ? input.path : null,
            userAgent,
        })
        return { success: true, data: { code } }
    } catch {
        // Deliberately NOT actionFailure(): a beacon that fails must not mint
        // another error event about itself.
        return { success: false, error: "Could not record the error." }
    }
}

/**
 * Records that the caller dismissed these What's New entries. Ids are filtered
 * against the repo's entry list for the caller's own audience, so this cannot
 * be used to write arbitrary rows. Idempotent (skipDuplicates on the unique).
 */
export async function markAnnouncementsSeen(entryIds: string[]): Promise<ActionResult<{ marked: number }>> {
    const session = await requireDriver()
    try {
        const actor = actorFrom(session)
        const audience = audienceForRole(actor.role)
        if (!audience || !Array.isArray(entryIds)) return { success: true, data: { marked: 0 } }

        const ids = validEntryIds(audience, entryIds)
        if (!ids.length) return { success: true, data: { marked: 0 } }

        const owner = actor.role === "driver" ? { driverId: actor.id } : { adminId: actor.id }
        const result = await prisma.announcementSeen.createMany({
            data: ids.map((entryId) => ({ entryId, ...owner })),
            skipDuplicates: true,
        })
        return { success: true, data: { marked: result.count } }
    } catch (error) {
        return actionFailure(error, "markAnnouncementsSeen", "Failed to save")
    }
}

/** Super-admin: close (or reopen) a report once it has been dealt with. */
export async function setProblemReportResolved(id: number, resolved: boolean): Promise<ActionResult> {
    const session = await requireSuperAdmin()
    try {
        const before = await prisma.problemReport.findUnique({ where: { id }, select: { status: true, code: true } })
        if (!before) throw new Error("Report not found.")

        const status = resolved ? "RESOLVED" : "OPEN"
        await prisma.problemReport.update({
            where: { id },
            data: { status, resolvedAt: resolved ? new Date() : null },
        })
        await writeAuditLog(
            session,
            resolved ? "RESOLVE_PROBLEM_REPORT" : "REOPEN_PROBLEM_REPORT",
            "ProblemReport",
            id,
            { status: before.status },
            { status },
            `Problem report ${before.code} marked ${status}.`
        )
        revalidatePath("/super/support")
        return { success: true, data: undefined }
    } catch (error) {
        return actionFailure(error, "setProblemReportResolved", "Failed to update the report")
    }
}
