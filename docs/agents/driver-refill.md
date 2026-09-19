# Driver refill entry

Read before touching `DriverRefillUI`, `src/lib/refill-entry.ts`, `PrefillReviewSheet`, `RefillModeChooser`, `getRefillHints`, `logBatchRefillsDispatchless`, or `useDriverStore`.

## Why it's built this way

The client asked for the morning case-pack quantities to be pre-filled into the refill form "instead of showing zero". Taken literally, that fabricates revenue: `logBatchRefillsDispatchless` sets `items_sold_since_last_refill = refilled` and `sales_revenue = refilled × price` on a `RefillLog` row that is never rewritten (corrections are posted, not edited). A case is also the wrong unit. 14 Lays is a **van** load, while the fleet's mean refill line is **5.4 units**.

90 days of live data showed the real complaint was different. Machines stock **25.7 items** (max 58) and the bag carries the whole morning load, but a real visit touches only **7.6**. The driver was scrolling past ~50 rows to reach 8, not typing 50 numbers.

## Rules

`src/lib/refill-entry.ts` holds the rules as pure functions (no React/Prisma, unit-tested in `tests/lib/refill-entry.test.ts`). `DriverRefillUI` only renders them.

- **Ordering.** `splitRefillRows` puts likely-needed items first and collapses the rest behind a disclosure. The list is flat while searching and on the Machine tab. **Nothing is ever removed**: the estimate is only an estimate, and the driver is the one looking at the shelf. A real par level (`MachineStock.par_level`) would make this exact; it doesn't exist yet.
- **A row's section is frozen.** `assignRefillGroup` runs **once per machine open** and writes `ItemFormState.group`; `splitRefillRows` partitions on that field and never re-derives it. `needsStock` returns true for anything staged, so when the section was derived live, the first `+` tap moved a row out of the collapsed group to the top of the sheet and shifted every row below it up one position. The second tap of `+6` then landed on a different item and booked it as sold. Two tests pin this, and both fail if `splitRefillRows` goes back to calling `needsStock`. **Never re-evaluate grouping or the sort key from anything a tap can change.** For the same reason the primary sort is the raw `estimated_stock` (the row's SYS display adds `refilled`; the sort must not).
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
