# CLAUDE.md

NexGen Vending Management System — Next.js 16 (App Router, React 19, Turbopack) + Prisma/Postgres (Supabase) + NextAuth v5. Roles: `super_admin | admin | driver`.

## Commands

- `npm run dev` / `build` / `lint` / `test` (Vitest, see [TESTING.md](TESTING.md)).
- Schema: edit `prisma/schema.prisma` → `npx prisma db push` → `npx prisma generate`. **No migrations folder** — this repo uses `db push`.
- Seeding: `npm run db:seed:dev` and variants. `db:reset:dev` is destructive. `:prod` variants exist — be deliberate.

## Server Actions are the backend

All mutations live in `src/actions/*` by domain. Only real REST routes are `api/auth/[...nextauth]` and `api/export-zatca` (stubbed 503 — don't extend). Every action:

1. RBAC guard from `src/lib/auth-utils.ts` — `requireAdmin()`, `requireSuperAdmin()`, `requireDriver()`, or `requireAdminOrDriverOwner(driverId)`. **Mandatory first line.**
2. Prisma transaction for multi-write changes.
3. Audit row: `RefillLog` / `InventoryAdjustment` for inventory mutations (snapshot prices/costs at write time — never re-derive from live `Item`); `writeAuditLog()` from `src/lib/audit-utils.ts` for admin state changes.
4. `notifyClients(eventTag)` then `revalidatePath()` where applicable.

Routing guard lives in `src/proxy.ts` (NextAuth edge middleware).

## Realtime

`notifyClients()` in `src/lib/notify.ts` bumps a single-row `SystemMeta`; browsers subscribe over Supabase Realtime WS and `router.refresh()` on change. Mounted **once at the root** via `<RealtimeRefresher />` in `src/app/layout.tsx` — do NOT call `useRealtimeRefresh()` in pages (opens a 2nd WS).

Per-environment setup gotcha: `SystemMeta` must be in the `supabase_realtime` publication AND `anon` must have `SELECT` on it (RLS disabled, or an explicit `SELECT TO anon USING (true)` policy). Without the latter, WS connects but no events arrive — silent failure. `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are baked at build time, so changing them in Vercel needs a redeploy.

## Domain notes (non-obvious)

- WAC: recomputes on PO receipt. Supplier shortages stack into `WarehouseStock.pending_deficit`, never negative inventory. `Item.cost` = running WAC; `last_purchase_cost` = latest.
- Three price tiers on `Item` (`price_standard`/`hospital`/`hotel`); `Machine.tier` selects which applies at refill.
- `Item.default_assignment_qty` (batch size) renders a separate `+N` button in `DriverStockManager` next to the `+1` stepper. Each click adds one batch; the button is hidden when the value is 0. Editable per-item from `/admin/manage` → Items tab (capped 0–100, validated server-side in `updateItem`).
- `Dispatch`/`DispatchItem` are frozen historical records — never deleted. New flows write `dispatchId: null` and use denormalized `driverId` on `RefillLog`/`ReturnVerification`.
- `Admin.role` is `ADMIN`/`SUPER_ADMIN` in DB, lowercase in session (mapped in `src/auth.ts`).

## Dispatchless driver stock (Phase B, dual-run)

Behind `NEXT_PUBLIC_USE_DISPATCHLESS` (`src/lib/feature-flags.ts`). New path: `src/actions/driver-stock.ts` (`assignToDriver`, `acknowledgeAssignment`, `disputeAssignment`, `submitDriverReturn`, `getDriverBag`). Legacy: `src/actions/inventory.ts` (`dispatchToDriver`, `returnDispatch`). `logBatchRefills` is **still dispatch-required** until B2b. Dispute writes `InventoryAdjustment` reason `ASSIGNMENT_DISCREPANCY`. `approveReturn` works on both rows.

## Warehouse calibration & audit

Correct warehouse stock/cost **without fake POs** (a PO at the wrong `costPerUnit` silently corrupts WAC, and WAC flows into P&L via `RefillLog.cost_at_refill` snapshots + live shrinkage). Both actions in `src/actions/inventory.ts` write `InventoryAdjustment` + `SystemAuditLog` **inside the tx**:
- `calibrateWarehouseStock(warehouseId, items[{itemId, physicalCount, foundUnitCost?}], note?)` — recount to an absolute qty (`requireAdmin`). WAC is left unchanged for shortages and for found units valued at current WAC; a `foundUnitCost` re-blends WAC via `computeWeightedCost` (same W+M+D aggregation as `completePurchaseOrder`). Never emits `RefillLog` (warehouse stock leaving is not a sale).
- `correctItemCost(itemId, correctedCost, note)` — direct WAC revaluation (`requireSuperAdmin`). SETs `Item.cost`; **never** rewrites frozen `RefillLog` history (post a correcting entry, don't edit the ledger).

UI: "Recount" / "Correct Cost" buttons on `/admin/warehouse` (`WarehouseAuditModal`, `CostCorrectionModal`); Correct Cost is super-admin-gated (page passes `isSuperAdmin`). Detection heuristic for bad costs: `cost > price_standard` (see `scripts/find-suspect-costs.ts`).

## Super-admin console

The `/super/*` zone (super-admin only via `src/proxy.ts`) is a provider oversight console — theme-aware Neo-Design. `SuperSidebar` nav: Overview `/super`, Oversight `/super/oversight`, Audit Trail `/super/audit`, Integrity `/super/integrity`, System Health `/super/system`, Admin Accounts `/super/admins`. Read-only insight actions live in `src/actions/super-insights.ts` — all `requireSuperAdmin`, **no mutations / no audit rows**:
- `getSystemHealth()` — real DB ping+latency, realtime heartbeat (last `SystemMeta` bump, key `realtime_version`), env-presence flags, exact row counts.
- `getExecutiveKpis(range)` — P&L totals + active counts + warehouse inventory value + 14-day revenue trend.
- `getIntegrityAlerts()` — categorised actionable anomalies (suspect costs `cost>price_standard`, pricing gaps, supplier deficits, stale machines, aging queues), each with a drill-in href to the admin page that fixes it.
- `getOversightSummary()` — actor leaderboard + action-type distribution + sensitive-action feed (`SENSITIVE_ACTIONS`) over `SystemAuditLog`.

P&L math is shared in `src/lib/pnl.ts` (`computePnLTotals`/`refillRevenueAndCogs`) — used by both `/admin/financials` and `getExecutiveKpis`; reads `RefillLog` snapshots, never live `Item`. `KpiCard` is shared at `src/components/KpiCard.tsx`; super-only presentational/chart components live in `src/components/super/`. Audit viewer: `getAuditLogsPaginated` in `history.ts`.

## AI Lab (experimental, super-admin only)

`/super/lab` — gated behind `ENABLE_AI_LAB` (`NEXT_PUBLIC_ENABLE_AI_LAB`, off by default; build-time so restart+hard-refresh after flipping). Nav entry is conditionally added to `SuperSidebar`. Two pure-statistics, **read-only / advisory** features (no LLM, no writes, no audit rows) in `src/actions/ai-lab.ts` (`requireSuperAdmin`):
- `getStockoutForecast()` — per-machine-item demand forecast + replenishment recommendation. Each closed refill interval is one observation of daily sales rate (`items_sold_since_last_refill ÷ interval days`); EWMA-weights recency, estimates days-until-empty vs `MachineStock.estimated_stock`, recommends assign qty = lead-time demand + safety stock (`z·σ·√leadDays`), lead time = the machine-item's own measured visit cadence. Surfaces a confidence band.
- `getSilentFailureAlerts()` — anomalies vs each machine's **own** baseline: demand collapse / spike (z-score on the latest interval), cadence-relative overdue-service (per-machine), abnormal damage/expiry (`ReturnVerification` recent vs window baseline).

Statistics are pure functions in `src/lib/forecast.ts` (no Prisma/IO → unit-tested in `tests/lib/forecast.test.ts`); the action only reconstructs series + classifies. Caveats baked into the UI: demand is refilled-minus-returns (not POS telemetry) and stock is estimated — figures are guidance, weighted by confidence. Types `StockoutForecast`/`SilentFailureAlert` in `src/types/index.ts`; boards `StockoutRadar`/`SilentFailureBoard` in `src/components/super/`.

## Conventions

- **Vertical slices**: schema changes land end-to-end in one PR (Prisma, actions, `src/types/index.ts`, all UI).
- **Shared types** in `src/types/index.ts`, mostly `Prisma.<Model>GetPayload<...>` aliases. Don't lean on `any` even though lint allows it.
- **Server-side pagination**: archive feeds MUST return `PaginatedResult<T>`. Pattern: `getRefillLogsPaginated` in `src/actions/history.ts`. Never ship unbounded `findMany()` to the client.
- **Pagination UI**: use the shared `<Pagination>` component in `src/components/Pagination.tsx`. Sliding window of consecutive pages (default 3) with first/prev/next/last arrows — no ellipses, no jump-by-N. Don't reimplement.
- **Image uploads**: `@vercel/blob` `put()` inside server actions. The `writeFile`/`mkdir` imports in `inventory.ts` are legacy local-dev fallbacks.
- **Mobile numeric input**: `<input type="text" inputMode="numeric" pattern="[0-9]*">`. Avoid `type="number"` and `onFocus={e.target.select()}` (mobile re-fires focus between keystrokes).

## UI

Neo-Design System: glassmorphism + slate. Use project tokens (`accent-blue`, `accent-green`, `neo-bg`) — never raw `bg-blue-500`. Reuse modal/dropdown/card primitives in `src/components/`. Dark mode primary (`next-themes`); always provide light variants.

Timestamps: `formatSaudiDate`/`formatSaudiTime` from `src/lib/utils.ts`, never `toLocaleString()`. Day/year boundaries: `startOfRiyadhDay()`/`endOfRiyadhDay()`/`startOfRiyadhYear()` — never `setHours(0,0,0,0)` or `new Date(y, 0, 1)`. Rolling-window math (`now - 7*24*60*60*1000`) is timezone-agnostic and fine.

## Domain skills

`.agents/skills/*/SKILL.md` — read before non-trivial changes: `vms-accounting-wac`, `vms-audit-trail`, `vms-security-rbac`, `vms-neo-design`, `supabase-postgres-best-practices`.
