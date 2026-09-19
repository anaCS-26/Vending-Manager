# Driver stock: bag, assignments, returns, templates, batched transactions

Read before touching `src/actions/driver-stock.ts`, `src/actions/dispatch-templates.ts`, `DriverStockManager`, `DriverReturnModal`, `src/actions/returns.ts`, `/admin/driver-stock`, or any action that writes many rows in one transaction. Also read the skill `.agents/skills/vms-audit-trail`.

## Dispatchless flow (Phase B, dual-run)

It sits behind `NEXT_PUBLIC_USE_DISPATCHLESS` (`src/lib/feature-flags.ts`), which is effectively hardcoded `true`. The current path is `src/actions/driver-stock.ts` (`assignToDriver`, `acknowledgeAssignment`, `disputeAssignment`, `submitDriverReturn`, `getDriverBag`). The legacy path is `src/actions/inventory.ts` (`dispatchToDriver`, `returnDispatch`). `logBatchRefills` is **still dispatch-required** until B2b. A dispute writes an `InventoryAdjustment` with reason `ASSIGNMENT_DISCREPANCY`. `approveReturn` works on both kinds of row.

`Dispatch`/`DispatchItem` are frozen historical records and are never deleted. New flows write `dispatchId: null` and use the denormalized `driverId` on `RefillLog`/`ReturnVerification`.

`getDriversWithBagAndPending` fetches open assignments (`PENDING_ACK`/`DISPUTED`) in a **separate unbounded query** and merges them with a newest-100 `ACKNOWLEDGED` history slice. Don't fold them back into one `take: N` window. Open rows are a work queue, and old unresolved disputes used to fall out of the window as new pushes arrived (the sidebar badge counted them globally, but the page couldn't show them).

### Disputes

Disputing an assignment reverts its stock to the warehouse immediately, so a `DISPUTED` row is only a lingering notification and **dismissing it is non-destructive**. `dismissAssignment(id)` clears one (hard-deletes the row, since the stock is already reconciled). `dismissAllDisputes(driverId)` bulk-clears a driver's disputes by the exact ids it read (so a dispute arriving mid-operation isn't swept away) and writes one aggregate `DISMISS_ALL_DISPUTES` audit entry. UI: a per-card ✕ and a per-driver "Clear all" button (shown when there is more than one) in the Pending/Disputed tab of `DriverStockManager`, behind a `ConfirmModal`.

### End-of-day return (admin-initiated)

`returnDriverStockToWarehouse(driverId, warehouseId, items[])` is the mirror of `assignToDriver`: bag down (gte-guarded), warehouse up, four constant statements. The UI is the "Return Items to Warehouse" button on the Current Stock tab of `DriverStockManager` → `DriverReturnModal`. The client physically takes unused stock back each evening. Before this there was no reachable way to record it (`DriverReturnSheet` is mounted nowhere, and `DriverBagManager` lives only on the dormant `/admin/dispatches` and never credits the warehouse). Three rules:

- **Every quantity starts empty; "Fill everything" is opt-in.** Water/7Up/Pepsi ride in the van overnight, so returning the whole bag is never the default. What's left empty stays in the bag. A short count leaves the difference on the driver rather than inventing shrinkage.
- **No `RefillLog`, no WAC change.** It's the same units at the same cost in a different place. It writes `InventoryAdjustment` (`Driver Return to Warehouse`) + `ADMIN_DRIVER_RETURN` audit, and a low-urgency push so the driver's next sheet isn't a surprise.
- **`ReturnVerification.status = "RESTOCKED"`, never `"APPROVED"`.** `/admin/financials`, `computePnLTotals` and `getExecutiveKpis` book **every `APPROVED` return as shrinkage at item cost** without looking at the reason. `approveReturn(…, 'RESTOCK')` used to write `APPROVED` too, so every restocked surplus was also counted as a loss; it writes `RESTOCKED` now (`LOSS` stays `APPROVED`). **Rows restocked before this change are still `APPROVED` and still inflate historical shrinkage.** They can only be told apart by pairing them with the `Restocked Surplus Return` `InventoryAdjustment`, which carries no return id. Not backfilled. Any new reader of `ReturnVerification` that means "loss" must filter `status: "APPROVED"`; anything listing processed returns must include `RESTOCKED`.

Still open: `approveReturn` restocks into `warehouse.findFirst()`, which is unordered and has no `isActive` filter. Harmless with one warehouse, wrong the day there are two.

## Dispatch templates

`DispatchTemplate`/`DispatchTemplateItem`, actions in `src/actions/dispatch-templates.ts`. These are reusable name + item/qty presets that pre-fill the driver-stock grid. They are pure config: no FK from any historical row, hard delete with cascade, quantities not tied to a warehouse. CRUD lives in the Templates tab of `/admin/manage` (`TemplateEditorModal`). `/admin/driver-stock` has a Load Template select, which replaces the grid, clamps to the selected warehouse's stock with a warning toast, and skips zero-stock items. Merge against raw `inventory`, never `filteredInventory` (which embeds the search query). It also has a "Save as Template" popover that captures staged quantities. Loading is client-side only: `assignToDriver` stays the only push path and never records which template seeded it.

**`Morning Load` is the client's real template** (template #4 in production, 56 lines / 1,080 units), seeded from their case-pack sheet by `npm run db:seed-template:{dev,prod}` → `scripts/seed-dispatch-template.ts` + `prisma/seed-data-templates/Dispatch_Template_Morning_Load.csv`. An admin had been typing ~62 quantities per driver, four drivers a day, because Load Template shipped with zero templates in the database. The seed matches by `Item.name`, never SKU (the sheet's codes disagree with the catalogue), so the CSV carries the resolved catalogue name beside the raw sheet label. Seed contract: [build-and-deploy.md](build-and-deploy.md#seeding).

**The sheet is stale in two known ways, left as-is on purpose.** First, 7 active items are missing from it (`AMADA MOOD`, `ULKER SANDWICH`, `LUPPO CAKE`, `SIPP GREEN` (spelled `SIIP` on the sheet), `DORITOS BLUE CHEESE`, `DEMAH BROWNIE`, `LIPTON PEACH ZRO`), so they load as zero. Second, `AQUAFINA WATER` is `80` on the sheet against a usual quantity of `40`. Both are the client's to correct from the Templates tab.

## Batched transactions

**Every multi-item write action runs its transaction as a constant number of set-based statements.** `assignToDriver`, `logBatchRefillsDispatchless`, `submitDriverReturn`, `returnDriverStockToWarehouse`, `completePurchaseOrder`, `calibrateWarehouseStock`, `reconcileMachineAudit`, `editDriverBagStock`, `editDispatchReturn` and `dispatchToDriver` all use:

- raw `UPDATE…FROM (VALUES…)`, with per-row gte guards where stock can run short;
- raw `INSERT…ON CONFLICT` for upserts;
- `createMany`/`createManyAndReturn` for audit/log rows;
- a 15s transaction timeout.

Reference reads (item prices, bag levels, prior quantities via `groupBy`, historic `price_at_refill` via `SELECT DISTINCT ON`) happen **before** the transaction.

Do NOT go back to per-item loops inside `$transaction`. Production runs through the Supavisor pooler (~70–100ms per query from Vercel), so N sequential queries blow through Prisma's 5s interactive-transaction window on large batches. The result is P2028 "Transaction not found", which shows up as the driver portal's "Sync Failed" toast. **`Promise.all` does not rescue a loop:** an interactive transaction pins one connection, so the queries serialize on it anyway. The fix is always fewer statements, not concurrent ones.

Duplicate item lines are merged before they reach SQL (`UPDATE…FROM VALUES` and `INSERT…ON CONFLICT` are both undefined when two value rows hit one target row). For absolute-set actions (both recounts, `editDriverBagStock`) that merge is last-wins; for additive ones (`completePurchaseOrder`) quantities and values sum.

Two loops survive, both on the **dormant legacy dispatch path** (`/admin/dispatches` has no inbound link from any nav, and the driver page synthesizes dispatch id 0 → `null`): the dispatch-path branch of `logBatchRefills` (~6 queries/item) and `returnDispatch` (~7 queries/item; its `Promise.all` is the trap described above). Both have the 15s timeout, and both are retired at B2b. Re-linking that page means rewriting these two first.

**Testing.** Raw SQL goes through `prismaMock.$queryRaw`/`$executeRaw` in `tests/__helpers__/prisma-mock.ts`. Assert the statement text and bound values, plus a **constant-statement-count test** for each action (`tests/actions/orders.test.ts`, `calibration.test.ts`, `machine-audit.test.ts`). That count is the regression guard, because jsdom can't reproduce pooler latency. Repro harness: `scripts/repro-assign-timeout.ts` (`SIM_LATENCY_MS=100 ITEMS=25`).
