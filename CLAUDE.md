# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NexGen Vending Management System (AII) — full-stack inventory/logistics platform for a Saudi vending operation. Goods flow `Supplier -> Warehouse -> Driver (Dispatch) -> Machine`, with reconciliation through verified Returns and Weighted Average Cost (WAC) accounting.

## Commands

- `npm run dev` — Next.js dev server.
- `npm run build` — runs `prisma generate && next build --webpack`.
- `npm run lint` — ESLint (Next core-web-vitals + TS preset; many rules relaxed in `eslint.config.mjs`).
- `npm start` — production server (after build).
- Schema changes: edit `prisma/schema.prisma` then `npx prisma migrate dev --name <change>`; run `npx prisma generate` after.
- Seeding (mirror `:prod` variants exist — be deliberate about which env you target):
  - `npm run db:seed:dev` — base seed (`scripts/seed-dev.ts`, also wired as `prisma.seed`).
  - `npm run db:seed-csv:dev` — bulk import from CSV templates in `prisma/seed-data-templates/`.
  - `npm run db:seed-stock:dev` — stock-level seeding.
  - `npm run db:reset:dev` — destructive reset via `scripts/reset.ts`.

There is no test suite configured.

## Architecture

### Stack
- **Next.js 16 App Router** (Turbopack, React 19), strict TypeScript, Tailwind CSS v4 + Framer Motion.
- **Prisma ORM** against **PostgreSQL only** (Supabase). The datasource in `prisma/schema.prisma` is `postgresql`; the legacy `prisma/dev.db` SQLite file is unused. Local dev points at the same Postgres via `.env`.
- **NextAuth v5 (beta)** with a single `CredentialsProvider` that branches on `credentials.type`: admins log in by email+password (bcrypt), drivers by phone+PIN (bcrypt). Session role is one of `super_admin | admin | driver`.
- **Upstash Redis** for rate limiting (`src/lib/rate-limit.ts`), **`@vercel/blob`** for image uploads, **Resend** for email, **Serwist** for the PWA service worker (`src/app/sw.ts`, registered via `next.config.ts`), **Leaflet/react-leaflet** for maps, **Recharts** for analytics, **Zustand** for the small client store (`src/stores/useDriverStore.ts`).

### Server Actions Are The Backend
All mutations and most reads happen through Server Actions in `src/actions/*`, grouped by domain (`inventory`, `orders`, `returns`, `history`, `warehouses`, `predictions`, `settings`, `super`, `auth`). The only real REST routes are `src/app/api/auth/[...nextauth]` and `src/app/api/export-zatca` (the ZATCA route is intentionally stubbed to return 503 — feature not yet implemented; do not extend it without scoping the real ZATCA spec first). Every action follows this template:

1. RBAC guard from `src/lib/auth-utils.ts` (mandatory — see below).
2. Prisma transaction(s) for any multi-write change.
3. Audit footprint (`writeAuditLog`, `RefillLog`, or `InventoryAdjustment` depending on category).
4. `notifyClients()` to bump the realtime version, then `revalidatePath()` where applicable.

### Auth & Routing Guards
`src/proxy.ts` is the NextAuth edge middleware. It enforces:
- `/super` → `super_admin` only.
- `/admin` → `admin` or `super_admin` (drivers redirect to `/driver`).
- `/driver` → any logged-in role (admins can shadow the driver portal).
- `/` and `/login` → if logged in, redirect by role; otherwise route `/` → `/login`.

Inside actions, the guards in `src/lib/auth-utils.ts` are the second line:
- `requireAdmin()` — admin or super_admin.
- `requireSuperAdmin()` — super_admin only.
- `requireDriver()` — driver or above (admins allowed for supervisory edits).
- `requireAdminOrDriverOwner(driverId)` — drivers may only mutate their own records; admins bypass.

Every server action MUST start with one of these. Driver-scoped writes use the ownership variant.

### Realtime: Upstash-backed version polling, not SSE
Despite the README and the legacy `.sse/` directory name, the system does NOT use SSE. `src/lib/notify.ts` increments a counter at the Upstash Redis key `vms:realtime:version` on every `notifyClients()` call (Upstash is shared across all Vercel instances; the previous filesystem implementation silently no-op'd in production because Vercel disks are read-only). The `useRealtimeRefresh` hook (`src/hooks/useRealtimeRefresh.ts`) polls `getVersion()` every 3 seconds and calls `router.refresh()` only when the value changes.

The hook is mounted **once per page tree** via `<RealtimeRefresher />` in `src/app/admin/layout.tsx` and `src/app/super/layout.tsx` — every page underneath inherits auto-refresh from a single shared poll. Do NOT add `useRealtimeRefresh()` calls inside individual page/component bodies; that would double-poll. The driver portal is intentionally NOT subscribed (offline-first Zustand state would be clobbered by forced refreshes).

Always call `notifyClients(eventTag)` after mutating actions, otherwise other tabs won't update. `notifyClients` is fire-and-forget — Redis errors are caught and logged, never propagated.

### Audit Trail
Two complementary mechanisms — use both where they apply:
- **Inventory mutations** must produce a `RefillLog` (driver→machine flow) or `InventoryAdjustment` (manual stock change) row, capturing price/quantity at the moment of the event. Never re-derive prices from the live `Item` row — store `price_at_dispatch`, `price_at_refill`, `cost_at_refill` at write time.
- **Administrative state changes** call `writeAuditLog(session, actionType, entityType, entityId, oldState, newState, message)` from `src/lib/audit-utils.ts`, which writes `SystemAuditLog`. The helper swallows errors so audit failures never block the user action.

### Financial Logic (WAC)
Weighted Average Cost is recomputed when Purchase Orders are received. Supplier shortages stack into `WarehouseStock.pending_deficit` rather than negative inventory. `Item.last_purchase_cost` records the latest unit cost; `Item.cost` is the running WAC.

### Domain Model Highlights (`prisma/schema.prisma`)
- `Item` carries three pricing tiers (`price_standard`, `price_hospital`, `price_hotel`) plus `cost` (WAC) and `last_purchase_cost`. `Machine.tier` selects which price applies at refill.
- `Dispatch` has status `OPEN | CLOSED`; `DispatchItem` snapshots `price_at_dispatch`. `RefillLog` links back to the dispatch and snapshots both price and cost. `ReturnVerification` is the admin-approval queue (`PENDING | VERIFIED`, with reason `DAMAGED | EXPIRED | SURPLUS`).
- `DriverStock` tracks "in-vehicle" inventory between shifts (back-stock).
- `PurchaseOrder` (status `PENDING | COMPLETED`) is the only path for new stock into a warehouse.
- `Admin.role` stores `ADMIN` or `SUPER_ADMIN` (uppercase in DB; lowercase in session — see the mapping in `src/auth.ts`).

### UI Conventions (Neo-Design System)
- Glassmorphism + slate base. Use the project tokens (`accent-blue`, `accent-green`, `neo-bg`, etc.) — never raw Tailwind color names like `bg-blue-500`.
- Reuse the existing modal/dropdown/card primitives in `src/components/`. Don't introduce parallel implementations.
- Dark mode is the primary target via `next-themes`; provide light variants alongside.
- All UI timestamps render in `Asia/Riyadh` via `formatSaudiDate` / `formatSaudiTime` from `src/lib/utils.ts` — do not call `toLocaleString()` directly.

## Conventions Worth Knowing

- **Vertical slices**: data-model changes are expected to land end-to-end in one PR — Prisma schema, affected actions, `src/types/index.ts`, and every UI surface (form, table, detail/edit modal).
- **Shared types** live in `src/types/index.ts` and are mostly `Prisma.<Model>GetPayload<...>` aliases — extend here rather than redefining.
- **JSDoc**: server actions use a boxed-comment header for groups and a single-line JSDoc per export. Match the surrounding style.
- **Lint posture**: `@typescript-eslint/no-explicit-any` and `no-unused-vars` are off; the convention is still to type things — don't lean on `any` casually.
- **Image uploads** go through `@vercel/blob` (`put`) inside server actions, not raw filesystem writes (the `writeFile`/`mkdir` imports in `inventory.ts` are legacy local-dev fallbacks).

## Domain Skills

`.agents/skills/` contains the long-form playbooks Gemini agents consult; they are equally useful for Claude when working in those areas:

- `vms-accounting-wac` — WAC math, deficit handling, COGS.
- `vms-audit-trail` — when to use `RefillLog` vs `InventoryAdjustment` vs `writeAuditLog`.
- `vms-security-rbac` — guard-selection rules.
- `vms-neo-design` — design tokens and component reuse rules.
- `supabase-postgres-best-practices` — query/index hygiene against the production DB.

Read the relevant `SKILL.md` before any non-trivial change in that domain.
