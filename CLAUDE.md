# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project

NexGen Vending Management System (AII) — full-stack inventory/logistics for a Saudi vending operation. Flow: `Supplier → Warehouse → Driver → Machine`, reconciled through verified Returns and Weighted Average Cost (WAC).

## Commands

- `npm run dev` / `npm run build` (runs `prisma generate` first) / `npm run lint` / `npm start`.
- Schema: edit `prisma/schema.prisma` → `npx prisma migrate dev --name <change>` → `npx prisma generate`.
- Seeding: `npm run db:seed:dev`, `db:seed-csv:dev`, `db:seed-stock:dev`. `db:reset:dev` is destructive. `:prod` variants exist — be deliberate.
- No test suite.

## Stack

Next.js 16 App Router (Turbopack, React 19), strict TS, Tailwind v4, Framer Motion. Prisma → Postgres (Supabase) only — the legacy `prisma/dev.db` SQLite file is unused. NextAuth v5 beta with one `CredentialsProvider` branching on `credentials.type` (admin: email+bcrypt; driver: phone+bcrypt PIN). Session role: `super_admin | admin | driver`. Upstash Redis for rate limiting, `@vercel/blob` for uploads, Resend for email, Serwist PWA, Leaflet, Recharts, Zustand (`src/stores/useDriverStore.ts`).

## Server Actions are the backend

All mutations live in `src/actions/*` by domain. The only real REST routes are `src/app/api/auth/[...nextauth]` and `src/app/api/export-zatca` (intentionally stubbed 503 — do not extend without scoping the real ZATCA spec). Every action:

1. RBAC guard from `src/lib/auth-utils.ts` (mandatory).
2. Prisma transaction for multi-write changes.
3. Audit row (`writeAuditLog`, `RefillLog`, or `InventoryAdjustment`).
4. `notifyClients()` then `revalidatePath()` where applicable.

## Auth & routing

`src/proxy.ts` (NextAuth edge middleware) enforces: `/super` → super_admin only; `/admin` → admin/super_admin (drivers redirect to `/driver`); `/driver` → any logged-in role; `/` and `/login` redirect by role.

Inside actions, use `src/lib/auth-utils.ts`:
- `requireAdmin()`, `requireSuperAdmin()`, `requireDriver()`.
- `requireAdminOrDriverOwner(driverId)` — drivers may only mutate their own rows; admins bypass.

Every server action MUST start with one of these.

## Realtime: Supabase Realtime push (not SSE, not polling)

Despite the legacy `.sse/` directory name, this is push-based.

`src/lib/notify.ts` increments a single-row `SystemMeta` (`key='realtime_version'`). Browser clients subscribe to that row over Supabase Realtime WS and call `router.refresh()` on change. ~50ms latency, zero idle traffic.

Mounted **once per page tree** via `<RealtimeRefresher />` in `src/app/admin/layout.tsx` and `src/app/super/layout.tsx`. Do NOT call `useRealtimeRefresh()` inside individual pages — that opens a second WS. The driver portal is intentionally NOT subscribed (offline-first Zustand state would be clobbered).

Subscription uses no `filter` and `event: "*"` — filtered postgres_changes would require `REPLICA IDENTITY FULL`, which we avoid since the table holds only one row.

Always call `notifyClients(eventTag)` after mutating actions. Fire-and-forget; errors caught and logged.

Setup (per-environment): `SystemMeta` table must exist; Realtime publication toggled on for it in Supabase dashboard; client envs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (restart dev server after changes — `NEXT_PUBLIC_*` is baked at build time).

## Audit trail

Use both where applicable:
- **Inventory mutations** → `RefillLog` (driver→machine) or `InventoryAdjustment` (manual). Snapshot prices/costs at write time (`price_at_dispatch`, `price_at_refill`, `cost_at_refill`). Never re-derive from the live `Item` row.
- **Admin state changes** → `writeAuditLog(...)` from `src/lib/audit-utils.ts` writes `SystemAuditLog`. Errors are swallowed.

## Financial logic (WAC)

WAC recomputes when POs are received. Supplier shortages stack into `WarehouseStock.pending_deficit` rather than negative inventory. `Item.last_purchase_cost` is the latest unit cost; `Item.cost` is the running WAC.

## Domain model highlights

- `Item`: three price tiers (`price_standard`, `price_hospital`, `price_hotel`) plus WAC `cost`; `Machine.tier` selects which applies at refill.
- `Dispatch` (`OPEN | CLOSED`) and `DispatchItem` are frozen historical records — never deleted. New flows write `dispatchId: null` and rely on denormalized `driverId` on `RefillLog`/`ReturnVerification`.
- `DriverStock` is the running per-driver bag; primary allocation surface post-refactor.
- `StockAssignment` is the audit row for an admin→driver push: snapshots `cost_at_assignment` and tracks `PENDING_ACK → ACKNOWLEDGED | DISPUTED`.
- `ReturnVerification` (`PENDING | VERIFIED`; reasons `DAMAGED | EXPIRED | SURPLUS`) — both `dispatchId` and `driverId` nullable.
- `PurchaseOrder` (`PENDING | COMPLETED`) is the only path for new stock.
- `Admin.role`: `ADMIN`/`SUPER_ADMIN` in DB, lowercase in session (mapped in `src/auth.ts`).

## Dispatchless driver stock (Phase B, dual-run)

Both code paths coexist behind `NEXT_PUBLIC_USE_DISPATCHLESS` (read via `src/lib/feature-flags.ts → USE_DISPATCHLESS`):
- New: `src/actions/driver-stock.ts` — `assignToDriver`, `acknowledgeAssignment`, `disputeAssignment`, `submitDriverReturn`, `getDriverBag`, `getDriversWithBagAndPending`.
- Legacy: `src/actions/inventory.ts` keeps `dispatchToDriver`/`returnDispatch`. `logBatchRefills` is **still dispatch-required** until B2b.
- Stock lands in `DriverStock` immediately at assignment; `StockAssignment` sits `PENDING_ACK` until driver accepts or disputes (latter writes `InventoryAdjustment` reason `ASSIGNMENT_DISCREPANCY`).
- Driver returns are item-by-item via `submitDriverReturn` → one `ReturnVerification` per line, decrements `DriverStock` immediately. `approveReturn` works on legacy and dispatchless rows.

Key Phase B UI: [src/app/admin/driver-stock/page.tsx](src/app/admin/driver-stock/page.tsx), [DriverStockManager](src/components/DriverStockManager.tsx), [AssignmentAckBanner](src/components/AssignmentAckBanner.tsx), [DriverReturnSheet](src/components/DriverReturnSheet.tsx). Sidebar swaps `/admin/dispatches` → `/admin/driver-stock` when the flag is on.

## UI conventions (Neo-Design System)

- Glassmorphism + slate base. Use project tokens (`accent-blue`, `accent-green`, `neo-bg`) — never raw Tailwind colors like `bg-blue-500`.
- Reuse modal/dropdown/card primitives in `src/components/`. No parallel implementations.
- Dark mode primary via `next-themes`; provide light variants alongside.
- Timestamps render in `Asia/Riyadh` via `formatSaudiDate`/`formatSaudiTime` from `src/lib/utils.ts` — never `toLocaleString()` directly.

## Conventions

- **Vertical slices**: schema changes land end-to-end in one PR (Prisma, actions, `src/types/index.ts`, all UI surfaces).
- **Shared types**: extend `src/types/index.ts`; mostly `Prisma.<Model>GetPayload<...>` aliases.
- **Lint posture**: `no-explicit-any`/`no-unused-vars` are off but still type things — don't lean on `any`.
- **Image uploads**: `@vercel/blob` `put()` inside server actions. The `writeFile`/`mkdir` imports in `inventory.ts` are legacy local-dev fallbacks.
- **Server-side pagination**: archive feeds MUST return `PaginatedResult<T>` (`src/types/index.ts`). Client refetches via `useTransition` on filter change. Pattern: `getRefillLogsPaginated` in `src/actions/history.ts`. Never ship unbounded `findMany()` to the client.
- **Mobile numeric input**: `<input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off">`. Avoid `type="number"` and `onFocus={e.target.select()}` (mobile re-fires focus between keystrokes).

## Driver portal

Mobile-first, light navigation.
- `/driver` — refill workflow.
- `/driver/settings` — self-service PIN change (driver role only; admins shadowing redirect away). Backed by `changeDriverPin` in `src/actions/auth.ts`, rate-limited via `pinChangeRateLimit` (`src/lib/rate-limit.ts`), writes a `CHANGE_DRIVER_PIN` audit row. Never log PIN values.
- Driver portal is intentionally NOT subscribed to `<RealtimeRefresher />`. New driver pages must follow that rule.

## Domain skills

`.agents/skills/` has long-form playbooks — read the relevant `SKILL.md` before non-trivial changes:

- `vms-accounting-wac` — WAC math, deficit handling, COGS.
- `vms-audit-trail` — `RefillLog` vs `InventoryAdjustment` vs `writeAuditLog`.
- `vms-security-rbac` — guard selection.
- `vms-neo-design` — design tokens and reuse.
- `supabase-postgres-best-practices` — query/index hygiene.
