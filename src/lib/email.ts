import { Resend } from "resend";

/**
 * ============================================================================
 * TRANSACTIONAL EMAIL
 * Thin wrapper over Resend. The only transport in the app — Vercel blocks
 * outbound SMTP, so there is no self-hosted fallback by design.
 * ============================================================================
 */

const FROM = process.env.RESEND_FROM || "NexGen Vending <onboarding@resend.dev>";

/**
 * Origin used to build links inside emails.
 *
 * Deliberately reads env only and NEVER the request's Host header: an attacker
 * who can set `Host:` on the reset request would otherwise receive a valid
 * reset link pointed at their own domain (host-header injection). Set `APP_URL`
 * in every deployed environment.
 */
export function getAppOrigin(): string {
    const explicit = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (explicit) return explicit.replace(/\/+$/, "");

    // Vercel injects this without a protocol.
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (vercel) return `https://${vercel}`;

    return "http://localhost:3000";
}

/** True when the transport is configured. Checked before any account lookup. */
export function isEmailConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
}

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Sends the password-reset link. The caller must treat a failure as
 * non-enumerating: log it server-side, tell the user the generic message.
 */
export async function sendPasswordResetEmail(to: string, token: string): Promise<SendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        // Local dev without a key: surface the link in the server console so the
        // flow is testable end-to-end. Never reachable in a deployed env because
        // the action checks isEmailConfigured() first.
        console.warn(
            `[email] RESEND_API_KEY unset — reset link for ${to}:\n${getAppOrigin()}/reset-password?token=${token}`
        );
        return { ok: true };
    }

    const url = `${getAppOrigin()}/reset-password?token=${encodeURIComponent(token)}`;

    try {
        const { error } = await new Resend(apiKey).emails.send({
            from: FROM,
            to,
            subject: "Reset your NexGen Vending password",
            text: [
                "A password reset was requested for this admin account.",
                "",
                `Open this link to choose a new password (valid for 30 minutes):`,
                url,
                "",
                "If you did not request this, you can ignore this email — your password has not changed.",
            ].join("\n"),
            html: resetEmailHtml(url),
        });

        if (error) return { ok: false, error: error.message };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Unknown transport error" };
    }
}

/** Inline styles only — email clients strip <style> blocks and know nothing of Tailwind. */
function resetEmailHtml(url: string): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 8px;font-size:20px;color:#ffffff;">Reset your password</h1>
        <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#94a3b8;">
          A password reset was requested for this NexGen Vending admin account.
          The link below is valid for 30 minutes and can be used once.
        </p>
        <a href="${url}" style="display:inline-block;padding:14px 28px;border-radius:12px;background:#34d399;color:#04231a;font-weight:700;font-size:14px;text-decoration:none;">
          Choose a new password
        </a>
        <p style="margin:24px 0 0;font-size:12px;line-height:20px;color:#64748b;word-break:break-all;">
          Or paste this into your browser:<br />${url}
        </p>
        <p style="margin:24px 0 0;font-size:12px;line-height:20px;color:#64748b;">
          If you did not request this, ignore this email — your password has not changed.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}
