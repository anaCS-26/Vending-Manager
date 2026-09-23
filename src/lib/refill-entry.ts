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
    confirmed: boolean;
};

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
 * The order the sheet's groups appear in: snacks top to bottom, then drinks —
 * the way the drivers read a machine, and the order they asked for ("chips at
 * the top, then Pringles, chocolates, then juices, soft drinks, iced tea").
 *
 * Matched by keyword on the item's free-text `category`, so a renamed or
 * misspelled category ("coffe") still lands in its group. Pringles are filed
 * under Chips in the catalogue, so they sit inside that group, together.
 * Anything that matches nothing goes after these, alphabetically by category.
 */
export const REFILL_SECTION_ORDER: ReadonlyArray<{ label: string; keywords: readonly string[] }> = [
    { label: "Chips", keywords: ["chip", "crisp"] },
    { label: "Chocolate", keywords: ["chocolate", "choco"] },
    { label: "Biscuits & Wafers", keywords: ["biscuit", "wafer", "cookie"] },
    { label: "Cakes", keywords: ["cake"] },
    { label: "Juices & Dairy", keywords: ["juice", "dairy", "milk"] },
    { label: "Soft Drinks", keywords: ["soft", "soda", "cola"] },
    { label: "Iced Tea", keywords: ["tea"] },
    { label: "Coffee", keywords: ["coffe", "cafe"] },
    { label: "Water", keywords: ["water"] },
];

/** The item fields the ordering reads. */
export type RefillSortable = { item: { name?: string | null; sku?: string | null; category?: string | null } };

export type RefillSection<T> = { key: string; label: string; rows: T[] };

function sectionOf(category: string | null | undefined): { rank: number; key: string; label: string } {
    const raw = (category ?? "").trim();
    const lower = raw.toLowerCase();
    const i = REFILL_SECTION_ORDER.findIndex((s) => s.keywords.some((k) => lower.includes(k)));
    if (i >= 0) return { rank: i, key: REFILL_SECTION_ORDER[i].label, label: REFILL_SECTION_ORDER[i].label };
    const label = raw && lower !== "uncategorized" && lower !== "uncategorised" ? raw : "Other";
    return { rank: REFILL_SECTION_ORDER.length, key: label.toLowerCase(), label };
}

/**
 * Lays the sheet out like the paper sheet it replaced: fixed category groups
 * in `REFILL_SECTION_ORDER`, items A–Z inside each group.
 *
 * It used to sort by the system's stock estimate and fold "probably still
 * full" items behind a disclosure. The estimate is a guess (machines don't
 * report sales), so the order looked random from one machine to the next and
 * the item the driver needed was often folded away — drivers searched every
 * item by code instead, typing and deleting 20–25 codes a machine.
 *
 * Nothing here reads a quantity, on purpose: a row's position depends only on
 * what the item is, so no tap can move it. When position followed live state,
 * the first `+` tap on a row moved it and the second tap of `+6` landed on
 * whatever slid under the finger — booked as sold.
 */
export function refillSections<T extends RefillSortable>(rows: T[]): RefillSection<T>[] {
    const byKey = new Map<string, RefillSection<T> & { rank: number }>();
    for (const row of rows) {
        const s = sectionOf(row.item?.category);
        let section = byKey.get(s.key);
        if (!section) {
            section = { key: s.key, label: s.label, rank: s.rank, rows: [] };
            byKey.set(s.key, section);
        }
        section.rows.push(row);
    }
    const byName = (a: T, b: T) =>
        (a.item?.name ?? "").localeCompare(b.item?.name ?? "") || (a.item?.sku ?? "").localeCompare(b.item?.sku ?? "");
    return [...byKey.values()]
        .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
        .map(({ key, label, rows: sectionRows }) => ({ key, label, rows: [...sectionRows].sort(byName) }));
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
