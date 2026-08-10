"use server"

import crypto from "crypto"
import bcrypt from "bcryptjs"
import { headers } from "next/headers"
import prisma from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit-utils"
import {
    passwordResetRequestRateLimit,
    passwordResetConfirmRateLimit,
} from "@/lib/rate-limit"
import { isEmailConfigured, sendPasswordResetEmail } from "@/lib/email"

/**
 * ============================================================================
 * ADMIN PASSWORD RESET (self-service, unauthenticated)
 * ============================================================================
 *
 * ⚠️ DELIBERATE EXCEPTION to the "RBAC guard on line 1" rule in CLAUDE.md.
 * These two actions are the only unauthenticated mutations in the app —
 * a locked-out admin has no session to guard with. Every guard that would
 * normally come from `auth-utils` is replaced here by a *capability*: the
 * caller must present a 256-bit single-use token that was delivered to the
 * account's registered mailbox. Do not add other unauthenticated exports to
 * this file, and do not relax any of the four invariants below.
 *
 *   1. ENUMERATION-SAFE  — requestPasswordReset returns the identical result
 *      whether or not the email exists. Never branch the response on lookup.
 *   2. HASHED AT REST    — `Admin.resetToken` stores SHA-256(token), not the
 *      token. A leaked DB dump therefore yields no usable reset links.
 *   3. SINGLE USE + TTL  — the row is cleared on redemption, and expires in
 *      30 minutes. Issuing a new token invalidates the previous one.
 *   4. RATE LIMITED      — both entry points, before any DB work.
 *
 * Drivers are out of scope: they authenticate by phone + PIN and have no email
 * on record. Their recovery path is an admin-initiated PIN reset.
 */

const TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 10;
// bcrypt silently truncates at 72 *bytes* — reject above it rather than let a
// user believe the tail of a long passphrase is protecting anything.
const PASSWORD_MAX_BYTES = 72;

/** Shared shape for both `useActionState` forms. */
export type PasswordResetState =
    | { ok: true; message: string }
    | { ok: false; error: string }
    | undefined;

/** The generic response. Identical for "sent" and "no such account". */
const GENERIC_SENT =
    "If that email belongs to an admin account, a reset link is on its way. Check your inbox — the link expires in 30 minutes.";

function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

async function clientIp(): Promise<string> {
    const headersList = await headers();
    return headersList.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
}

// ---------------------------------------------------------------------------
// STEP 1 — request a link
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
    _prevState: PasswordResetState,
    formData: FormData
): Promise<PasswordResetState> {
    const ip = await clientIp();
    const { success: ipOk } = await passwordResetRequestRateLimit.limit(`ip_${ip}`);
    if (!ipOk) {
        return { ok: false, error: "Too many reset requests. Try again later." };
    }

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
        return { ok: false, error: "Enter a valid email address." };
    }

    // Per-mailbox limit, so a single admin can't be spammed from many IPs.
    const { success: emailOk } = await passwordResetRequestRateLimit.limit(`email_${email}`);
    if (!emailOk) {
        return { ok: false, error: "Too many reset requests. Try again later." };
    }

    // Checked BEFORE the account lookup: a missing API key is a deployment
    // fault, independent of whether the account exists, so reporting it leaks
    // nothing. A send failure *after* the lookup is handled the opposite way.
    if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
        console.error("[password-reset] RESEND_API_KEY is not set — cannot send reset links.");
        return { ok: false, error: "Password reset is unavailable right now. Contact your system administrator." };
    }

    const admin = await prisma.admin.findUnique({ where: { email } });

    if (admin) {
        const token = crypto.randomBytes(32).toString("base64url");

        // Overwrites any outstanding token for this account — one live link at a time.
        await prisma.admin.update({
            where: { id: admin.id },
            data: {
                resetToken: hashToken(token),
                resetTokenExpiry: new Date(Date.now() + TOKEN_TTL_MS),
            },
        });

        const sent = await sendPasswordResetEmail(admin.email, token);
        if (!sent.ok) {
            // Loud server-side, generic to the caller: surfacing the transport
            // error here would confirm the account exists (invariant 1).
            console.error(`[password-reset] send failed for admin ${admin.id}: ${sent.error}`);
        }

        await writeAuditLog(
            actorSession(admin.id, admin.role),
            "REQUEST_PASSWORD_RESET",
            "Admin",
            admin.id,
            null,
            null,
            `Reset link requested from ${ip}`
        );
    }

    return { ok: true, message: GENERIC_SENT };
}

// ---------------------------------------------------------------------------
// STEP 2 — redeem the link
// ---------------------------------------------------------------------------

export async function resetPassword(
    _prevState: PasswordResetState,
    formData: FormData
): Promise<PasswordResetState> {
    const ip = await clientIp();
    const { success: notLimited } = await passwordResetConfirmRateLimit.limit(`ip_${ip}`);
    if (!notLimited) {
        return { ok: false, error: "Too many attempts. Try again in a few minutes." };
    }

    const token = String(formData.get("token") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");

    if (!token) {
        return { ok: false, error: "This reset link is invalid. Request a new one." };
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
        return { ok: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
    }
    if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
        return { ok: false, error: `Password must be ${PASSWORD_MAX_BYTES} bytes or fewer.` };
    }
    if (password !== confirm) {
        return { ok: false, error: "Passwords do not match." };
    }

    // Look up by hash — the raw token never touches the database.
    const admin = await prisma.admin.findUnique({ where: { resetToken: hashToken(token) } });

    // One message for "no such token" and "expired" so a probe learns nothing
    // about which tokens were ever real.
    const INVALID = "This reset link is invalid or has expired. Request a new one.";
    if (!admin || !admin.resetTokenExpiry || admin.resetTokenExpiry.getTime() < Date.now()) {
        return { ok: false, error: INVALID };
    }

    if (await bcrypt.compare(password, admin.password)) {
        return { ok: false, error: "New password must be different from your current password." };
    }

    const hashed = await bcrypt.hash(password, 10);

    // Clear the token in the same write that sets the password: the link is
    // spent whether or not the user ever reaches the login page.
    await prisma.admin.update({
        where: { id: admin.id },
        data: { password: hashed, resetToken: null, resetTokenExpiry: null },
    });

    // Audit the event only — never the token or either password value.
    await writeAuditLog(
        actorSession(admin.id, admin.role),
        "RESET_PASSWORD",
        "Admin",
        admin.id,
        null,
        null,
        `Password reset completed from ${ip}`
    );

    return { ok: true, message: "Password updated. You can sign in with your new password." };
}

/**
 * `writeAuditLog` expects a NextAuth session, which by definition does not
 * exist here. The admin is identified by the capability they presented (a
 * mailbox they control, or a valid token), so we attribute the row to them
 * rather than dropping it — an unattributed password change is exactly the
 * event an audit trail is for.
 */
function actorSession(adminId: number, role: string) {
    return {
        user: {
            id: String(adminId),
            role: role === "SUPER_ADMIN" ? "super_admin" : "admin",
        },
    };
}
