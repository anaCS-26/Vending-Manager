# Driver refill entry

Read before touching `DriverRefillUI`, `src/lib/refill-entry.ts`, `PrefillReviewSheet`, `RefillModeChooser`, `getRefillHints`, `logBatchRefillsDispatchless`, or `useDriverStore`.

## Why it's built this way

The client asked for the morning case-pack quantities to be pre-filled into the refill form "instead of showing zero". Taken literally, that fabricates revenue: `logBatchRefillsDispatchless` sets `items_sold_since_last_refill = refilled` and `sales_revenue = refilled × price` on a `RefillLog` row that is never rewritten (corrections are posted, not edited). A case is also the wrong unit. 14 Lays is a **van** load, while the fleet's mean refill line is **5.4 units**.

Machines stock about **27 items** (max 58) and the bag carries the whole morning load. A visit touches **8** on average, 16 at the 90th percentile, and up to 30. The drivers' own complaint (Sept 2026) was about *finding* those items: the list looked jumbled, so they searched each one by code. What they asked for is the paper sheet: fixed groups in shelf order, then tap and save. That is what the sheet is now.

## Rules

`src/lib/refill-entry.ts` holds the rules as pure functions (no React/Prisma, unit-tested in `tests/lib/refill-entry.test.ts`). `DriverRefillUI` only renders them.

- **Ordering is shelf order, like the paper sheet.** `refillSections` groups rows under fixed category headings in `REFILL_SECTION_ORDER` (Chips, Chocolate, Biscuits & Wafers, Cakes, Juices & Dairy, Soft Drinks, Iced Tea, Coffee, Water, then unknown categories A–Z, then "Other"), A–Z by name inside each. Categories are matched by keyword on the free-text `Item.category`, so `coffe` still files under Coffee. Pringles are `Chips` in the catalogue, so they sit together inside that group. Every item in the bag is listed, with nothing folded away. The drivers asked for this order (Sept 2026).
- **What it replaced, and why.** The sheet used to sort by `estimated_stock` and fold "probably still full" items behind a disclosure (`splitRefillRows`/`needsStock`). Machines don't report sales, so the estimate is a guess. The order changed from machine to machine and needed items were often hidden, so drivers searched every item by code: 20–25 codes a machine, each typed and then deleted. About 35–40% of refill lines are an item the driver had never put in that machine before, so hiding "not this machine's items" would fail the same way.
- **Position never depends on a quantity.** `refillSections` reads only name, code and category. When position followed live state, the first `+` tap moved a row and the second tap of `+6` landed on whatever slid under the finger, booked as sold. A test (`keeps every row in place across a burst of taps`) pins this. **Never sort or group on anything a tap can change.**
- **Keyboard runs down the sheet.** The quantity box a driver fills every visit (Refilled on the Bag tab, Returned on the Machine tab) is a `data-entry` field inside a `data-entry-group` (see `src/lib/entry-keys.ts`), with `enterKeyHint="next"`. The phone keyboard's Next key jumps to the next item's box and scrolls it to the middle of the screen, and on the last box it closes the keyboard. Return (Warehouse) is unmarked, so Next skips it. While searching, Next means "done with this item": the search clears and focus returns to it for the next code. Enter in the search box goes into the first match's box.
- **Seeding.** `seedRefillQuantity(mode, …)`. `quick` (default) leaves boxes empty and offers last visit's quantity as a one-tap ±batch pair. `prefill` (the client's literal ask) seeds the box and marks it `confirmed: false`.
- **±batch is a pair on both screens, and `adjustByBatch` clamps both ways.** The admin grid's batch is `Item.default_assignment_qty`, a case going into the van. The refill sheet's batch is **last visit's quantity, never the case pack**: only **3.9%** of refill lines are a multiple of a case, and the averages are 5.3 units refilled against a 22.4-unit case. The `−N` half exists because `+14` was a one-way door, undoable only by fourteen presses of `−1`, retyping, or clearing the line. `+N` **clamps to what's available instead of going dead** near the ceiling, since a disabled batch button sends people back to the keyboard.
- **`RefillEntryMode` is per device, chosen by the driver** in `/driver/settings` (`RefillModeChooser`, stored in `useDriverStore` → IndexedDB). Both modes ship on purpose: the trade-off is fewer taps vs. fewer numbers to read, and the people doing 8 stops a day settle it, not a spec.

**The invariant across both modes: an unconfirmed quantity cannot be submitted.** Any edit to the refill box sets `confirmed` (and clears `prefilled`, because it's the driver's number now). A seeded zero counts as confirmed, since there's nothing to check about not refilling. While `countUnconfirmed() > 0`, the submit button opens `PrefillReviewSheet`, which lists every line and its total before anything is written. Quick mode reaches submit with nothing unconfirmed and goes straight through. **Do not add a bulk "apply all suggestions" that skips the sheet.**

## Hints

Suggestions come from `getRefillHints()` (`src/actions/inventory.ts`, `requireDriver`): one `SELECT DISTINCT ON ("machineId","itemId")` over 180 days for **every** machine, cached in the driver store. Fetching per machine would leave hints missing exactly when they're needed, because drivers are routinely out of signal at the machine. They are advisory only. On this fleet last visit's quantity repeats exactly **32%** of the time, is within ±1 **56%** of the time, and within ±2 **70%**. That's worth one tap and a nudge on the stepper, not a trusted answer.

## Offline + layout

- **Offline refills are idempotent.** `RefillLog.clientRequestId` is unique on `(clientRequestId, itemId)`, *not* alone, because one batch writes a row per item with the same key. `DriverRefillUI` generates it once per submission and reuses it for both the online attempt and the offline-queue fallback, so a batch that commits but loses its response isn't double-counted on replay. `logBatchRefills` maps that P2002 to `success: true`. Never mint a fresh key on retry.
- Only the refill screen drains the offline queue. `OfflineIndicator` (mounted in `src/app/driver/layout.tsx`) says so.
- The Submit bar is `fixed sm:absolute` with a staged-count summary, and the page (not an inner box) scrolls on phones. See [ui-and-mobile.md](ui-and-mobile.md#mobile).
- The shared `QtyStepper` in `DriverRefillUI` is the only implementation of the +/− control (44px).
