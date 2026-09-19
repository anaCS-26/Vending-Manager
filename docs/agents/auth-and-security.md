# Auth and security

Read before touching `src/lib/auth-utils.ts`, `src/auth.ts`, `src/proxy.ts`, `src/actions/password-reset.ts`, the auth pages, or when adding a server action. Also read the skill `.agents/skills/vms-security-rbac`.

## Server action guards

The routing guard lives in `src/proxy.ts` (NextAuth edge middleware) and covers only the `/admin`, `/driver` and `/super` prefixes. Middleware does **not** protect server actions. Every export in a `"use server"` file is a publicly routable RPC endpoint, and its action id ships in the client bundle. So the guard on the action's first line is the *only* authorization layer.

`createItem` and `getMachineInventoryDetails` both shipped without a guard. `tests/actions/inventory.test.ts` now asserts `rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/)` per action. Add that assertion for any new action.

`requireDriver()` admits driver | admin | super_admin, meaning "any signed-in user".

A few actions guard inline (`auth()` + role + ownership) instead of calling `auth-utils`: `changeDriverPin`, `updateMyProfile`, `acknowledgeAssignment`/`denyAssignment`, and `super.ts`'s private `verifySuperAdmin()`. They're correct, but prefer the shared guards. Having three idioms is how the two missing guards above went unnoticed.

**Ownership always comes from the session, never from a parameter.** Examples: push subscriptions (`resolvePushOwner()`) and problem reports. Otherwise tampering with the client bundle lets one user act as another.

## `Driver.pin`

It is a bcrypt hash of a 4-digit PIN, which can be brute-forced offline in seconds. An unqualified `include: { driver: true }` used to put it in the RSC payload of `/admin/history`, `/admin/returns` and the dashboard. It is now omitted at the Prisma client level (`src/lib/prisma.ts`), so leaking it has to be done on purpose. Only two call sites may re-enable it with `omit: { pin: false }`: the credential check in `src/auth.ts` and `changeDriverPin`. Adding a third means you're about to leak it.

## Admin password reset

Self-service reset is for **admins only**. Drivers log in with phone + PIN, have no email on record, and are reset by an admin. `requestPasswordReset` / `resetPassword` in `src/actions/password-reset.ts` are the app's only unauthenticated mutations, by necessity: a locked-out admin has no session. The RBAC guard is replaced by a *capability*: a 256-bit single-use token mailed to the registered address. There are four invariants, and `tests/actions/password-reset.test.ts` pins each one:

1. **Enumeration-safe.** `requestPasswordReset` returns a byte-identical result whether or not the email exists, *including* when the mail transport fails (logged server-side, generic success to the caller). Never branch the response on the lookup.
2. **Hashed at rest.** `Admin.resetToken` holds `SHA-256(token)`, never the token, and redemption looks up by hash. A DB dump yields no usable links.
3. **Single-use + 30-min TTL.** The token and expiry are cleared in the same `update` that sets the password, and issuing a new token overwrites the old one. "Unknown token" and "expired token" return the same string.
4. **Rate limited before any DB work.** Request: per-IP *and* per-email (`passwordResetRequestRateLimit`, 5/hr). Redemption: per-IP (`passwordResetConfirmRateLimit`, 10/15min).

Password policy on reset: ≥10 chars, ≤72 **bytes** (bcrypt silently truncates past that), and it must differ from the current one. Audit rows (`REQUEST_PASSWORD_RESET` / `RESET_PASSWORD`) are attributed to the admin through a synthetic session object. `writeAuditLog` needs a session, there isn't one here, and an unattributed password change is exactly what an audit trail exists to catch.

Email goes through **Resend** (`src/lib/email.ts`) because Vercel blocks outbound SMTP, so there is no self-hosted path. `getAppOrigin()` reads `APP_URL`/`NEXT_PUBLIC_APP_URL`/`VERCEL_PROJECT_PRODUCTION_URL` and **never the request Host header**; otherwise an attacker who could set `Host:` would be mailed a valid link pointing at their own domain. With no `RESEND_API_KEY` the dev server logs the link to the console. In production the missing key is reported as an explicit error *before* the account lookup (a deployment fault has nothing to do with the account, so reporting it leaks nothing).

The token rides in `?token=` on `/reset-password`. `ResetPasswordForm` strips it from the address bar on mount (`history.replaceState`), and `next.config.ts` sets `Referrer-Policy: no-referrer` on that route.

**Known gap:** sessions use JWT with a 30-day `maxAge`, so a stolen session survives a password reset. Closing it needs a `passwordChangedAt` column checked in the `jwt` callback, which means a DB read on every request. Deliberately not done.

## Auth pages

All three unauthenticated routes (`/login`, `/forgot-password`, `/reset-password`) share chrome via `src/components/AuthShell.tsx`; `LoginForm` is only the form. It used to inline its own hand-copied panel, and that copy had already drifted (raw `emerald-*` instead of the `accent-green` token, and `font-black` on a face that caps at 800). Put new auth chrome in `AuthShell`, never in a page.

## Rate limits

`src/lib/rate-limit.ts` (Upstash Redis, free tier, so watch the command quota).
