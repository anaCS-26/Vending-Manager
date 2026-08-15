import type { RefillEntryMode } from "@/types";

/**
 * ============================================================================
 * REFILL SHEET ENTRY RULES
 *
 * Pure decision logic for how the driver's refill sheet orders and seeds its
 * quantity boxes. No React, no Prisma — DriverRefillUI is ~900 lines of
 * stateful UI that can only be exercised through jsdom, and these two rules are
 * the part that actually decides what gets written to the ledger. Same split as
 * src/lib/forecast.ts: the maths lives here and is unit-tested, the component
 * only renders it.
 *
 * The rule that governs everything below: `logBatchRefillsDispatchless` books
 * `items_sold_since_last_refill` — and therefore `sales_revenue` — straight
 * from the refilled quantity, onto a RefillLog row that is never rewritten. A
 * number nobody looked at must not be able to become revenue.
 * ============================================================================
 */

/** The subset of the sheet's row state these rules actually read. */
export type RefillRowLike = {
    refilled: number;
    bag_returned: number;
    estimated_stock: number;
    /** What this machine took of this item last visit; null when there's no history. */
    lastQty: number | null;
    confirmed: boolean;
};

/** Which section of the sheet a row sits in. Decided once per machine, then frozen. */
export type RefillGroup = "primary" | "secondary";

/**
 * How a row's refill box starts out.
 *
 * `quick` starts empty: the suggestion is offered as a one-tap chip instead, so
 * every figure submitted was an explicit action.
 *
 * `prefill` starts at last visit's quantity, capped to what's actually in the
 * bag — the literal request from the client, made safe by `confirmed: false`,
 * which forces the pre-submit review sheet.
 *
 * A seeded zero counts as confirmed: there is nothing to check about not
 * refilling something.
 */
export function seedRefillQuantity(
    mode: RefillEntryMode,
    lastQty: number | null,
    bagQuantity: number,
): { refilled: number; prefilled: boolean; confirmed: boolean } {
    const refilled = mode === "prefill" && lastQty !== null
        ? Math.max(0, Math.min(lastQty, bagQuantity))
        : 0;
    return { refilled, prefilled: refilled > 0, confirmed: refilled === 0 };
}

/**
 * Whether this item plausibly needs stock on this visit.
 *
 * There is no par level on MachineStock, so "needs stock" is the best available
 * proxy: the system believes the slot is empty, or it holds less than one
 * typical top-up for this machine. Anything already staged counts too — which
 * matters when prefill mode seeds the sheet before the driver sees it.
 *
 * Evaluated exactly once per machine, by `assignRefillGroup`. See there for why
 * it must never be re-run against live state.
 */
export function needsStock(row: RefillRowLike): boolean {
    if (row.refilled > 0 || row.bag_returned > 0) return true;
    if (row.estimated_stock === 0) return true;
    return row.lastQty !== null && row.estimated_stock < row.lastQty;
}

/**
 * Fixes a row's section when the machine is opened — and it is never
 * recalculated while the driver works.
 *
 * This function existing separately from `needsStock` is the whole point.
 * Deriving the section live meant a row's first `+` tap made `needsStock` flip
 * true, so a row the driver had expanded out of the collapsed group jumped to
 * the top of the sheet and every row below it slid up one position. With the
 * ±batch buttons that is not cosmetic: the second tap of `+6` lands on whatever
 * slid under the finger, and a refill quantity is booked as sold.
 *
 * Frozen membership costs nothing — a row in the wrong section is still one tap
 * away, and the sections re-sort on the next machine.
 */
export function assignRefillGroup(row: RefillRowLike): RefillGroup {
    return needsStock(row) ? "primary" : "secondary";
}

/**
 * Splits the sheet into "probably needs stock" and a collapsed remainder.
 *
 * Machines here stock ~26 items and the bag carries the full morning load, so
 * the Bag tab renders ~57 rows — while a real visit touches 7.6 of them (90-day
 * fleet average). Alphabetical order made the driver scroll past 50 rows to
 * reach 8. Nothing is removed; the remainder is one tap away.
 *
 * Two cases deliberately return a flat list: an active search is already a
 * filter (splitting it again would hide the hit the driver typed to find), and
 * the Machine tab records returns coming *out*, where "needs stock" is
 * meaningless.
 *
 * Partitions on the row's frozen `group` rather than re-deriving it, so nothing
 * on this sheet can change position in response to a tap.
 */
export function splitRefillRows<T extends { group: RefillGroup }>(
    rows: T[],
    opts: { isSearching: boolean; viewMode: "BAG" | "MACHINE" },
): { primary: T[]; secondary: T[] } {
    if (opts.isSearching || opts.viewMode === "MACHINE") {
        return { primary: rows, secondary: [] };
    }
    return {
        primary: rows.filter((r) => r.group === "primary"),
        secondary: rows.filter((r) => r.group === "secondary"),
    };
}

/**
 * Staged refills the driver has not yet looked at. Non-zero only in prefill
 * mode; the submit button diverts to the review sheet while this is above 0.
 */
export function countUnconfirmed(rows: RefillRowLike[]): number {
    return rows.filter((r) => r.refilled > 0 && !r.confirmed).length;
}

/**
 * One tap of a ±batch button, clamped to [0, max].
 *
 * Shared by the two screens that stage quantities in batches rather than units:
 * the admin's assignment grid (batch = the item's case pack) and the driver's
 * refill sheet (batch = what this machine took last visit — a case pack is the
 * wrong unit there, since only 3.9% of refill lines are a multiple of one).
 *
 * Both directions clamp rather than refuse. A batch button that goes dead near
 * the ceiling is the thing that sends people back to the keyboard, and one that
 * can only add makes an accidental tap cost fourteen presses of "−" to undo.
 */
export function adjustByBatch(current: number, delta: number, max: number): number {
    if (!Number.isFinite(current) || !Number.isFinite(delta)) return 0;
    return Math.max(0, Math.min(current + delta, Math.max(0, max)));
}
