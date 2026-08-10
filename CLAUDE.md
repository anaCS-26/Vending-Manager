# CLAUDE.md

NexGen Vending Management System — Next.js 16 (App Router, React 19, Turbopack) + Prisma/Postgres (Supabase) + NextAuth v5. Roles: `super_admin | admin | driver`.

## Commands

- `npm run dev` / `build` / `lint` / `test` (Vitest, see [TESTING.md](TESTING.md)).
- **CI** (`.github/workflows/ci.yml`): `tsc --noEmit` + `eslint` + `vitest run` on push to `main` and every PR. All three run with `if: !cancelled()`, so one run reports every failure. Lint fails on **errors only** — the 2 remaining `<img>` warnings need a `next/image` migration. Keep it green; it is the only thing between a commit and a production deploy.
  - Two npm workarounds live in there, both traceable to the lockfile being generated on Windows. **`.npmrc` (`legacy-peer-deps=true`) is committed on purpose** — this dependency set doesn't resolve under strict peer rules, and while that setting sat in the maintainer's `~/.npmrc` the lockfile was valid on exactly one machine. Don't delete it without regenerating the lockfile. The job also runs `npm install` rather than `npm ci`, plus an explicit install of `@rolldown/binding-linux-x64-gnu`, because npm records only the current platform's optional binaries (npm/cli#4828) and vitest 4 needs that binding on Linux. **Generating `package-lock.json` once on Linux (WSL/Docker) retires both hacks.**
  - `prisma generate` must precede `tsc` — `src/types/index.ts` is built on `Prisma.<Model>GetPayload<...>` and nothing generates the client on install. Tests need no DB (`vitest.setup.ts` mocks `@/lib/prisma`).
- **`main` branch protection requires a PR but has `enforce_admins: false`**, so the owner's direct pushes bypass it with a "Bypassed rule violations" warning. The rule currently constrains nobody.
- Schema: edit `prisma/schema.prisma` → `npx prisma db push` → `npx prisma generate`. **No migrations folder** — this repo uses `db push`.
- Seeding: `npm run db:seed:dev` and variants. `db:reset:dev` is destructive. `:prod` variants exist — be deliberate.

## Server Actions are the backend

All mutations live in `src/actions/*` by domain. The only REST route is `api/auth/[...nextauth]` — don't add more. Every action:

1. RBAC guard from `src/lib/auth-utils.ts` — `requireAdmin()`, `requireSuperAdmin()`, `requireDriver()`, or `requireAdminOrDriverOwner(driverId)`. **Mandatory first line.**
2. Prisma transaction for multi-write changes.
3. Audit row: `RefillLog` / `InventoryAdjustment` for inventory mutations (snapshot prices/costs at write time — never re-derive from live `Item`); `writeAuditLog()` from `src/lib/audit-utils.ts` for admin state changes.
4. `notifyClients(eventTag)` then `revalidatePath()` where applicable.

Routing guard lives in `src/proxy.ts` (NextAuth edge middleware). Middleware does **not** protect server actions — every export in a `"use server"` file is a publicly routable RPC endpoint whose action id ships in the client bundle, so rule 1 is the *only* authorization layer. `createItem` and `getMachineInventoryDetails` both shipped without a guard; `tests/actions/inventory.test.ts` now asserts `rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/)` per action. Add that assertion for any new action.

A few actions guard inline (`auth()` + role + ownership) instead of calling `auth-utils`: `changeDriverPin`, `updateMyProfile`, `acknowledgeAssignment`/`denyAssignment`, and `super.ts`'s private `verifySuperAdmin()`. They're correct, but prefer the shared guards — three idioms is how the two gaps above went unnoticed.

## Realtime

`notifyClients()` in `src/lib/notify.ts` bumps a single-row `SystemMeta`; browsers subscribe over Supabase Realtime WS and `router.refresh()` on change. Mounted **once at the root** via `<RealtimeRefresher />` in `src/app/layout.tsx` — do NOT call `useRealtimeRefresh()` in pages (opens a 2nd WS).

Per-environment setup gotcha: `SystemMeta` must be in the `supabase_realtime` publication AND `anon` must have `SELECT` on it (RLS disabled, or an explicit `SELECT TO anon USING (true)` policy). Without the latter, WS connects but no events arrive — silent failure. `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are baked at build time, so changing them in Vercel needs a redeploy.

## Domain notes (non-obvious)

- WAC: recomputes on PO receipt. Supplier shortages stack into `WarehouseStock.pending_deficit`, never negative inventory. `Item.cost` = running WAC; `last_purchase_cost` = latest.
- PO receiving (`OrderManagerUI`, Pending Receipts tab) shows a live **Receipt Summary** (line count, units, subtotal, 15% VAT, grand total; math in `src/lib/receipt-totals.ts`, tested against a real supplier invoice in `tests/lib/receipt-totals.test.ts`) so the receiver can match the paper tax invoice, and the confirm dialog restates the totals. Unit costs are entered **excluding VAT** — they feed WAC, and the subtotal lines up with the invoice's pre-VAT "Total Amount". Suppliers round VAT per line, so grand totals may drift a few halalas from `subtotal × 1.15`; that's a match, not an error. The Create Order tab shows the same five-figure panel as an **Estimated Order Value** (unit cost = `Item.cost`, the WAC snapshot `createPurchaseOrder` locks per line) so the value can be sanity-checked before submitting.
- Three price tiers on `Item` (`price_standard`/`hospital`/`hotel`); `Machine.tier` selects which applies at refill.
- `Item.default_assignment_qty` (batch size) renders a separate `+N` button in `DriverStockManager` next to the `+1` stepper. Each click adds one batch; the button is hidden when the value is 0. Editable per-item from `/admin/manage` → Items tab (capped 0–100, validated server-side in `updateItem`).
- `Dispatch`/`DispatchItem` are frozen historical records — never deleted. New flows write `dispatchId: null` and use denormalized `driverId` on `RefillLog`/`ReturnVerification`.
- `Admin.role` is `ADMIN`/`SUPER_ADMIN` in DB, lowercase in session (mapped in `src/auth.ts`).
- Drivers/machines/items/warehouses soft-delete via `isActive` — **every active-list query must filter `where: { isActive: true }`** (the delete only flips the flag). `deleteDriver` (`inventory.ts`) is conditional: it **hard-deletes** a driver with zero history (no `RefillLog`/`ReturnVerification`/`StockAssignment`/`Dispatch`; `DriverStock` cascades), else soft-deletes to preserve the denormalized `driverId` audit trail — falls back to soft-delete on a P2003 FK error. `/super/admins` deliberately shows inactive drivers with an "Inactive" badge (read-only oversight); all other driver lists (`getDrivers`, `/admin/manage`, `getDriversWithBagAndPending`) hide them.

## Dispatchless driver stock (Phase B, dual-run)

Behind `NEXT_PUBLIC_USE_DISPATCHLESS` (`src/lib/feature-flags.ts`). New path: `src/actions/driver-stock.ts` (`assignToDriver`, `acknowledgeAssignment`, `disputeAssignment`, `submitDriverReturn`, `getDriverBag`). Legacy: `src/actions/inventory.ts` (`dispatchToDriver`, `returnDispatch`). `logBatchRefills` is **still dispatch-required** until B2b. Dispute writes `InventoryAdjustment` reason `ASSIGNMENT_DISCREPANCY`. `approveReturn` works on both rows.

`getDriversWithBagAndPending` fetches open assignments (`PENDING_ACK`/`DISPUTED`) in a **separate unbounded query** and merges them with a newest-100 `ACKNOWLEDGED` history slice. Don't fold them back into one `take: N` window: open rows are a work queue, and old unresolved disputes previously fell out of the window as new pushes arrived (sidebar badge counted them globally; the page couldn't show them).

Disputing an assignment reverts its stock to the warehouse immediately, so a `DISPUTED` row is only a lingering notification — **dismissing it is non-destructive**. `dismissAssignment(id)` clears one (hard-deletes the row, since stock is already reconciled); `dismissAllDisputes(driverId)` bulk-clears a driver's disputes by the exact ids it read (so a dispute arriving mid-operation isn't swept away) and writes one aggregate `DISMISS_ALL_DISPUTES` audit entry. UI: per-card ✕ and a per-driver "Clear all" button (shown when >1) in the Pending/Disputed tab of `DriverStockManager`, gated behind a `ConfirmModal`.

**Dispatch templates** (`DispatchTemplate`/`DispatchTemplateItem`, actions in `src/actions/dispatch-templates.ts`): reusable name+item/qty presets that pre-fill the driver-stock grid. Pure config — no FK from any historical row, hard delete with cascade, warehouse-agnostic quantities. CRUD lives in the Templates tab of `/admin/manage` (`TemplateEditorModal`); `/admin/driver-stock` has a Load Template select (replaces the grid, clamps to the selected warehouse's stock with a warning toast, skips zero-stock items — merge against raw `inventory`, never `filteredInventory` which embeds the search query) and a "Save as Template" popover that captures staged quantities. Loading is client-side only; `assignToDriver` stays the sole push path and never records which template seeded it.

`assignToDriver`, `logBatchRefillsDispatchless`, and `submitDriverReturn` all batch their transactions into **constant set-based statements** (raw `UPDATE…FROM (VALUES…)` decrements with per-row gte guards, `createMany`/`createManyAndReturn` for audit/log rows, raw `INSERT…ON CONFLICT` for the bag credit) + a 15s tx timeout; reference reads (item prices, bag levels, historic `price_at_refill` via `SELECT DISTINCT ON`) happen **before** the tx. Do NOT regress to per-item loops inside `$transaction`: prod runs through the Supavisor pooler (~70-100ms/query from Vercel), so N sequential queries blows Prisma's 5s interactive-tx window on large batches (P2028 "Transaction not found" — surfaced as the driver portal's "Sync Failed" toast). Duplicate item lines are merged before hitting SQL (`UPDATE…FROM VALUES` is undefined for dup join rows). The legacy dispatch-path `logBatchRefills` keeps its loop but got the 15s timeout (retired at B2b). Repro harness: `scripts/repro-assign-timeout.ts` (`SIM_LATENCY_MS=100 ITEMS=25`). Raw SQL in tests: `prismaMock.$queryRaw`/`$executeRaw` in `tests/__helpers__/prisma-mock.ts`.

## Warehouse calibration & audit

Correct warehouse stock/cost **without fake POs** (a PO at the wrong `costPerUnit` silently corrupts WAC, and WAC flows into P&L via `RefillLog.cost_at_refill` snapshots + live shrinkage). Both actions in `src/actions/inventory.ts` write `InventoryAdjustment` + `SystemAuditLog` **inside the tx**:
- `calibrateWarehouseStock(warehouseId, items[{itemId, physicalCount, foundUnitCost?}], note?)` — recount to an absolute qty (`requireAdmin`). WAC is left unchanged for shortages and for found units valued at current WAC; a `foundUnitCost` re-blends WAC via `computeWeightedCost` (same W+M+D aggregation as `completePurchaseOrder`). Never emits `RefillLog` (warehouse stock leaving is not a sale).
- `correctItemCost(itemId, correctedCost, note)` — direct WAC revaluation (`requireSuperAdmin`). SETs `Item.cost`; **never** rewrites frozen `RefillLog` history (post a correcting entry, don't edit the ledger).

UI: "Calibrate Stock" / "Correct Cost" buttons on `/admin/warehouse` (`WarehouseAuditModal`, `CostCorrectionModal`); Correct Cost is super-admin-gated (page passes `isSuperAdmin`). Detection heuristic for bad costs: `cost > price_standard` (see `scripts/find-suspect-costs.ts`).

`/admin/machine-stock` has a **sibling** "Calibrate Stock" button (`MachineInventoryTable` → `MachineAuditModal` → `reconcileMachineAudit`) that shares the warehouse modal's chrome/copy **by design** (same title pattern, explainer, columns, badges, confirm flow). Keep the two modals visually in sync, but **do not flatten the semantics**: a machine **shortage IS a sale** (booked as `RefillLog` revenue + COGS, since product leaves a machine by being vended), whereas a warehouse shortage is neutral. Each modal's explainer/confirm copy states its own financial behavior.

The explainer is `src/components/CalibrationLegend.tsx` — two colour-coded outcome cards (shortage / surplus) plus one optional caveat line. It enforces exactly that split: the **structure** is shared so the pair stays in sync automatically, but every **string** is a prop, so neither modal can inherit the other's financial claim. Card headings deliberately reuse the row badges' vocabulary ("Shortage"/"Found" for warehouse, "Missing"/"Surplus" for machine) so the legend explains the badges the user sees below it. It replaced a ~45-word prose paragraph in each modal — the rules are a two-branch decision and read far faster as two labelled branches. Use `accent-pink`/`accent-green` tokens, never raw `emerald-*` (both modals were quietly using `emerald-500`, which is the same hex as `accent-green` but bypasses the token).

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
- **Never serialize `Driver.pin`**: it's a bcrypt hash of a 4-digit PIN — brute-forceable offline in seconds — and unqualified `include: { driver: true }` used to put it in the RSC payload of `/admin/history`, `/admin/returns` and the dashboard. It's now omitted at the Prisma client level (`src/lib/prisma.ts`), so leaking it is opt-in. The only two call sites that may re-enable it with `omit: { pin: false }` are the credential check in `src/auth.ts` and `changeDriverPin`. Adding a third means you're about to leak it.
- **Offline refills are idempotent**: `RefillLog.clientRequestId` (unique on `(clientRequestId, itemId)`, *not* alone — one batch writes a row per item sharing the key). `DriverRefillUI` generates it once per submission and reuses it for both the online attempt and the offline-queue fallback, so a batch that commits with a lost response isn't double-counted on replay. `logBatchRefills` maps that P2002 to `success: true`. Never mint a fresh key on retry.
- **Numeric input**: use the shared `<NumericInput>` (`src/components/NumericInput.tsx`) for every typed number field — `decimal` prop for prices/costs, optional `max`. It keeps the raw string internally so a cleared box stays empty (no sticky "0") and partial decimals ("0.5") survive re-renders, while `onChange` hands the parent a plain number (0 when empty). Never hand-roll `type="number"` or `parseInt(e.target.value) || 0` into a `value={number}` input; avoid `onFocus={e.target.select()}` (mobile re-fires focus between keystrokes). `<select>` dropdowns are exempt.

## UI

Neo-Design System: glassmorphism + slate. Use project tokens (`accent-blue`, `accent-green`, `neo-bg`) — never raw `bg-blue-500`. Reuse modal/dropdown/card primitives in `src/components/`. Dark mode primary (`next-themes`); always provide light variants.

**Typography is three roles, not one** (`src/app/layout.tsx` + the `@theme` block in `globals.css`). The split exists because ~90% of what this app renders is small text and numbers a driver acts on, so the face setting the tables must stay quiet — which means it can't also be the interesting one:

- **Display — Bricolage Grotesque** (`font-display`, token `--font-display`). Applied by a base-layer rule to `h1, h2` only, plus `KpiCard`'s value. It **caps at weight 800** — never style it `font-black` (900) or the browser synthesises a smeared fake bold; use `font-extrabold`. Loaded with `axes: ["opsz"]`: the optical-size axis is the whole reason this face is safe here (ink traps and eccentric proportions bloom large, normalise small), and dropping the axis to save ~35KB retires the argument for it. `h3` is deliberately **excluded** — 62 uses, all small card/row headings, which is text not display; opt in below `h2` with `font-display`.
- **Body — Geist** (`font-sans`). Squared counters and flat terminals, real tabular figures, full 100–900. Deliberately neutral. Sets every table and control.
- **Data — JetBrains Mono** (`font-mono`, ~145 call-sites). The wide-tracked uppercase micro-labels are a deliberate signature, not leftovers — keep them.

`body` sets `font-variant-numeric: tabular-nums` so numeric columns align digit-for-digit in the **body** face. That was previously the job `font-mono` was quietly recruited for: the predecessor (Outfit) was a display/brand geometric with proportional figures that left financial columns ragged, and every ragged column got patched with `font-mono` one `className` at a time. Reaching for `font-mono` purely to line up digits is now redundant.

Timestamps: `formatSaudiDate`/`formatSaudiTime` from `src/lib/utils.ts`, never `toLocaleString()`. Day/year boundaries: `startOfRiyadhDay()`/`endOfRiyadhDay()`/`startOfRiyadhYear()` — never `setHours(0,0,0,0)` or `new Date(y, 0, 1)`. Rolling-window math (`now - 7*24*60*60*1000`) is timezone-agnostic and fine.

**Modals**: every modal calls `useModalBehavior()` (`src/hooks/useModalBehavior.ts`) for Escape, focus trap, focus restore, `role="dialog" aria-modal`, and ref-counted body scroll lock — then spreads `{...dialogProps}` and `ref={panelRef}` onto its **existing** panel div. It's a hook, not a `<Modal>` wrapper, on purpose: the panels have deliberately different chrome (the warehouse/machine audit pair is kept in sync by hand, MapModal is `h-[80vh]`, several animate with framer-motion), and one wrapper would flatten that. Pass `closeOnEscape: false` for anything holding typed data — the calibration, cost-correction and template modals all do, so a stray Escape can't bin a 40-line recount. Point `labelledBy` at the visible heading's id.

`ConfirmModal` takes an optional `isPending`: supply it and the dialog stays open with a spinner and disabled buttons until the caller closes it (used by the two audit modals, cost correction, and Clear-all-disputes). **Passing it makes the dialog controlled — the caller must then close it itself.** Omit it and you keep the old fire-and-close behaviour.

**Modal stacking**: the data-entry modals sit at `z-[9999]`; `ConfirmModal` sits at `z-[10000]` and must stay above them. The three modals that nest it (`WarehouseAuditModal`, `MachineAuditModal`, `CostCorrectionModal`) render it as a **sibling** under the same `createPortal` wrapper — and that wrapper is a static `<div>`, so it forms no stacking context and the two `position:fixed` layers compete directly in the root. At its original `z-[999]` the confirm step painted *behind* the parent's opaque panel, so "Apply Calibration" silently did nothing; calibration was unusable from `3a41130` (the commit that introduced it) until `feat/ux-foundations`. jsdom does not paint, so a flow test that merely finds the confirm button passes either way — `tests/components/WarehouseAuditModal.test.tsx` asserts the `z-[N]` ordering numerically instead. Any new modal that nests `ConfirmModal` must stay below `z-[10000]`.

**Route states**: `loading.tsx` + `error.tsx` exist for `/`, `/admin`, `/driver`, `/super`, plus a root `global-error.tsx` for root-layout failures. Skeletons come from `src/components/Skeleton.tsx` (RSC — no `"use client"`, so they paint before hydration); error bodies from `src/components/ErrorState.tsx`. `ErrorState` shows `error.digest`, **never `error.message` in production** — server actions return raw Prisma text (constraint and column names) and an error boundary must not echo that to a driver or a client's admin.

## Domain skills

`.agents/skills/*/SKILL.md` — read before non-trivial changes: `vms-accounting-wac`, `vms-audit-trail`, `vms-security-rbac`, `vms-neo-design`, `supabase-postgres-best-practices`.
