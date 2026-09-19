# Inventory, purchase orders, receiving, calibration

Read before touching `Item`, `WarehouseStock`, `MachineStock`, `src/actions/orders.ts`, `OrderManagerUI`, `src/lib/order-entry.ts`, `src/lib/packaging.ts`, `src/lib/receipt-totals.ts`, or the calibration / cost-correction modals. Also read the skills `.agents/skills/vms-accounting-wac` and `vms-audit-trail`.

## Core model

- **WAC** (weighted-average cost) is recomputed when a PO is received. Supplier shortages stack into `WarehouseStock.pending_deficit`, never into negative inventory. `Item.cost` = running WAC; `last_purchase_cost` = latest price paid.
- WAC flows into P&L through `RefillLog.cost_at_refill` snapshots and live shrinkage. A PO entered at the wrong `costPerUnit` silently corrupts it. That's why stock and cost corrections go through calibration (below), never through fake POs.
- Three price tiers on `Item` (`price_standard`/`hospital`/`hotel`). `Machine.tier` selects which one applies at refill.
- `Item.default_assignment_qty` is the **driver batch**: the `+N` button in `DriverStockManager` next to the `+1` stepper (one batch per click, hidden when 0; editable in `/admin/manage` → Items, capped 0–100 server-side in `updateItem`). It is **not** the supplier box, which is `Item.pieces_per_box`. The two differ (MOVENPICK: box of 10, batch of 3). It must never leak into refill quantities.
- Soft delete: drivers/machines/items/warehouses flip `isActive`. `deleteDriver` (`inventory.ts`) **hard-deletes** a driver with zero history (no `RefillLog`/`ReturnVerification`/`StockAssignment`/`Dispatch`; `DriverStock` cascades) and otherwise soft-deletes, to keep the denormalized `driverId` audit trail. On a P2003 FK error it falls back to soft-delete. `/super/admins` deliberately shows inactive drivers with an "Inactive" badge; every other driver list hides them.

## Purchase orders — drafting

The admin keys a ~60-line supplier order from paper. The rules are pure functions in `src/lib/order-entry.ts` (tested in `tests/lib/order-entry.test.ts`; `OrderManagerUI` only renders them; the flow is pinned by `tests/components/OrderManagerUI.test.tsx`):

- **A new PO line starts at one box**, `defaultOrderQuantity(Item.pieces_per_box)`, falling back to 1 only when the item has no box size. (It was once a hard-coded 1, then the driver batch.) This is the opposite call from the driver refill sheet, where a case pack must *not* leak in, and both are right: a supplier order really is placed in cases, and a PO line is a request, not a booked sale.
- **`±case` buttons, and `−case` refuses rather than clamps** when it would empty the line. Clamping 24 − 24 to the floor of 1 would make the next `+24` land on 25, which is no whole number of cases.
- **Bulk starting points only ever append** (`mergeOrderLines`): "Repeat last order" (per destination warehouse; uses `quantityRequested` so a short shipment doesn't shrink the next order; drops *and counts* deactivated items), "Order these again" in the history modal, and "Add N shorted items" (`pending_deficit` rounded up to whole boxes). None may overwrite a quantity the admin typed.
- **Keyboard loop: name → Enter → Enter.** Enter in the search adds the highlighted match and lands in the new line's quantity box with the case pack *selected*. Enter there accepts it and returns to search; typing replaces it. A mouse click instead keeps focus in the search box with the list open (`onMouseDown` `preventDefault`), so several items can be picked in a row. Searching for an item already on the order jumps to its line.
- **Lines render newest-first** so the line just added sits under the search box. State stays in insertion order, so the submitted/printed PO order is unchanged.
- **The draft is persisted to `localStorage` (`vms:po-draft`)**, restored after mount and cleared on submit. Changing the destination warehouse does not wipe the lines.
- Only `isActive` items are orderable. The unfiltered `items` prop is kept because pending/history rows still look up inactive ones. `createPurchaseOrder` rejects empty orders, non-integer or < 1 quantities, and duplicate items server-side.
- The Create Order tab shows an **Estimated Order Value** (unit cost = `Item.cost`, the WAC snapshot `createPurchaseOrder` locks per line).

## Purchase orders — receiving

The Pending Receipts tab shows a live **Receipt Summary** (line count, units, subtotal, 15% VAT, grand total; math in `src/lib/receipt-totals.ts`, tested against a real supplier invoice in `tests/lib/receipt-totals.test.ts`) so the receiver can match the paper tax invoice, and the confirm dialog restates the totals. Amounts are entered **excluding VAT**, so the subtotal lines up with the invoice's pre-VAT "Total Amount". Suppliers round VAT per line, so the grand total may drift a few halalas from `subtotal × 1.15`. That still counts as a match.

### Receiving in boxes

The client's rule: stock **arrives in boxes but is counted and dispatched in pieces**, and a receiver must be able to say whether *this* delivery's box held 24 or 20. So a box exists in exactly one place, the warehouse door, and every stock table stays in pieces. The rules are pure functions in **`src/lib/packaging.ts`** (tested in `tests/lib/packaging.test.ts`).

- **`Item.pieces_per_box`** (null = not set), **`piece_size` + `piece_size_unit`** (`g`/`kg`/`ml`/`L`, display only: "Box of 24 × 50 g"). Set them in Manage → Items (`updateItem`'s optional `packaging` arg; omitted means *leave alone*, so no caller blanks them by accident) or in the PO "New Item" modal (`createQuickItem`). A cleared box is stored as **null, never 0**. `Item.bulk_format` stays as the free-text "Pack code" (`10*24*50GM` carries the carton count, which nothing models) and is shown only where no structured packaging exists.
- **Receiving asks for boxes × pcs/box + loose pieces, at a price per box.** Pieces = `piecesFromBoxes`; cost per piece = box price ÷ box size. Asking for a box price is the point: the invoice prints one, and the old per-piece field was being fed box prices. **AQUAFINA WATER (a 2 SAR bottle) is costed at 31 SAR in production** for exactly that reason, and it flowed into WAC. A line whose piece cost exceeds its standard price shows a warning. The pcs/box field is pre-filled from the item and editable per line; when it differs from the item's box, the row says "Usually 24 per box".
- **`PurchaseOrderItem.boxesReceived` / `piecesPerBox`** record how a line was counted (null on lines received before this change). `quantityReceived` stays the source of truth; `checkReceivedBoxes` rejects a breakdown worth more pieces than were received. Receiving overwrites **`PurchaseOrderItem.costPerUnit` with the per-piece cost actually paid**. Rows received before this change still hold the order-time estimate.
- **Loose pieces only render next to a real box, but stay visible while they hold a number.** A hidden field that still counts is how a total goes wrong without anyone seeing it.
- **Receiving never changes the item's usual box.** A one-off 20-box shouldn't silently change the default for the next order; the admin edits the item instead.
- Ordering uses the box too (`orderBoxOf` in `OrderManagerUI`); the driver-stock `+N` keeps the driver batch. The warehouse table shows each quantity in boxes underneath ("41 boxes + 16 pcs"). Recounts (calibration) are still typed in pieces.
- **Backfill:** `npm run db:seed-packaging:{dev,prod}` → `scripts/seed-item-packaging.ts` + `prisma/seed-data-templates/Item_Packaging.csv` (seed contract in [build-and-deploy.md](build-and-deploy.md#seeding)), **fill-only** unless `--overwrite`. How the CSV was read (its Source column cites each row): the client's pack code (`Item.bulk_format`) gives the piece size and the candidate counts, and the driver batch or the morning-load sheet's `(24X1)` picks which count is the box, so `32*12*36GM` with a batch of 12 is a box of 12 × 36 g. A bare count is the box (`30*240ML`, `10X1`, `12`). An item with no pack code takes its driver batch. **Production was filled from it on 2026-09-19** (fill-only, so boxes already typed in the app were kept): 63 of 64 active items have a box, 45 a piece size. **Deliberately left empty:** SNICKERS' box (sheet and batch say 24, the pack code `12*20*45GM` says 20: the client's question), Pringles' size (`30/40G`), and every size no pack code states. **Least certain:** the four cakes (45 per box, from `45X1`; batch 3), `LIPTON PEACH ZRO` (6, batch only), `landessa` (12, bare pack code).

### `completePurchaseOrder` is set-based

It used to run ~8 sequential queries per line inside the transaction and P2028'd on a real SAR 124k invoice (the general rule is in [driver-stock.md](driver-stock.md#batched-transactions)). Three consequences to preserve:

1. The prior-quantity reads across warehouse + machines + driver bags are **3 `groupBy`s before the tx**, not 3 aggregates per line, so WAC is blended against a snapshot taken just outside the transaction.
2. Two PO lines pointing at the same `Item` are **merged** first. Blending `(q1@c1)` then `(q2@c2)` equals one lot of `Σq @ Σ(q·c)/Σq`, and `UPDATE…FROM VALUES` is undefined for duplicate join rows.
3. `pending_deficit` is written raw (negative on an overage, which pays down an older shortage) and then **clamped to 0 by a follow-up `UPDATE`**. `ON CONFLICT DO UPDATE` can see `EXCLUDED` and the target row but not the `VALUES` alias, so one expression can't cover both `max(0, change)` and `max(0, existing + change)`.

The status flip is a guarded `updateMany` (`status: { not: 'COMPLETED' }`) as the transaction's **first** statement. It locks the PO row, so two receivers can't both apply stock.

## Warehouse calibration and cost correction

Correct warehouse stock/cost **without fake POs**. Both actions are in `src/actions/inventory.ts` and write `InventoryAdjustment` + `SystemAuditLog` **inside the tx**:

- `calibrateWarehouseStock(warehouseId, items[{itemId, physicalCount, foundUnitCost?}], note?)`: recount to an absolute quantity (`requireAdmin`). WAC is left unchanged for shortages and for found units valued at current WAC. A `foundUnitCost` re-blends WAC via `computeWeightedCost` (same warehouse + machines + driver bags aggregation as `completePurchaseOrder`). It never writes a `RefillLog`, because warehouse stock leaving is not a sale.
- `correctItemCost(itemId, correctedCost, note)`: direct WAC revaluation (`requireSuperAdmin`). It sets `Item.cost` and **never** rewrites frozen `RefillLog` history (post a correcting entry; don't edit the ledger).

UI: "Calibrate Stock" / "Correct Cost" on `/admin/warehouse` (`WarehouseAuditModal`, `CostCorrectionModal`). Correct Cost is super-admin-only (the page passes `isSuperAdmin`). Detection heuristic for bad costs: `cost > price_standard` (`scripts/find-suspect-costs.ts`).

### Machine calibration

`/admin/machine-stock` has a **sibling** "Calibrate Stock" button (`MachineInventoryTable` → `MachineAuditModal` → `reconcileMachineAudit`) that shares the warehouse modal's chrome and copy **by design** (same title pattern, explainer, columns, badges and confirm flow). Keep the two modals visually in sync, but **do not flatten the semantics**. A machine **shortage IS a sale** (booked as `RefillLog` revenue + COGS, since product leaves a machine by being vended). A warehouse shortage is neutral.

The explainer is `src/components/CalibrationLegend.tsx`: two colour-coded outcome cards (shortage / surplus) plus one optional caveat line. The **structure** is shared, so the pair stays in sync automatically, but every **string** is a prop, so neither modal can inherit the other's financial claim. Card headings reuse the row badges' words ("Shortage"/"Found" for the warehouse, "Missing"/"Surplus" for the machine). Colours are the `accent-pink`/`accent-green` tokens.

Both modals nest `ConfirmModal`; see the stacking rule in [ui-and-mobile.md](ui-and-mobile.md#modals).
