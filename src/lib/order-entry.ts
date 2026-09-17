/**
 * Purchase-order drafting rules, as pure functions (no React/Prisma) — the
 * `refill-entry.ts` / `forecast.ts` pattern. `OrderManagerUI` only renders them.
 *
 * The unit throughout is `Item.default_assignment_qty`: the case pack. Unlike
 * the driver's refill sheet (where a case is the wrong unit — see
 * `refill-entry.ts`), a supplier order really is placed in cases, so the case
 * pack is the right default here and nothing about it fabricates a figure:
 * a PO line is a request, and what arrives is typed at receiving.
 */

export type OrderLine = { itemId: number; quantityRequested: number };

/** A new line starts at one case; items with no case pack start at 1. */
export function defaultOrderQuantity(batch: number | null | undefined): number {
    return typeof batch === "number" && Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1;
}

/**
 * One tap of a ±case button. A line never drops below 1 — a line at zero is a
 * line the admin should delete, and `createPurchaseOrder` rejects it. A `−case`
 * that would cross that floor is refused rather than clamped: clamping 24 − 24
 * to 1 makes the next `+24` land on 25, which is no number of cases.
 */
export function adjustOrderQuantity(current: number, delta: number): number {
    if (!Number.isFinite(current) || !Number.isFinite(delta)) return 1;
    const next = Math.floor(current + delta);
    return next >= 1 ? next : Math.max(1, Math.floor(current));
}

/** Smallest whole number of cases covering `qty` (suppliers don't split one). */
export function roundUpToBatch(qty: number, batch: number | null | undefined): number {
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    const size = defaultOrderQuantity(batch);
    return Math.ceil(qty / size) * size;
}

/**
 * Append `incoming` to `existing`. A line the admin already has is left alone —
 * a bulk add must never overwrite a number someone typed.
 */
export function mergeOrderLines(
    existing: OrderLine[],
    incoming: OrderLine[],
): { lines: OrderLine[]; added: number } {
    const seen = new Set(existing.map((l) => l.itemId));
    const lines = [...existing];
    let added = 0;
    for (const line of incoming) {
        if (seen.has(line.itemId) || line.quantityRequested <= 0) continue;
        seen.add(line.itemId);
        lines.push(line);
        added++;
    }
    return { lines, added };
}

/**
 * Lines for "repeat a previous order". Uses what was *requested*, not what
 * arrived — a short shipment shouldn't shrink the next order. Items that have
 * since been deactivated are dropped and counted, so the UI can say so rather
 * than silently ordering less than the admin expects.
 */
export function linesFromPreviousOrder(
    orderItems: Array<{ itemId: number; quantityRequested: number }>,
    orderableItemIds: Set<number>,
): { lines: OrderLine[]; skipped: number } {
    const byItem = new Map<number, number>();
    let skipped = 0;
    for (const oi of orderItems) {
        if (!orderableItemIds.has(oi.itemId)) {
            skipped++;
            continue;
        }
        if (oi.quantityRequested <= 0) continue;
        byItem.set(oi.itemId, (byItem.get(oi.itemId) ?? 0) + oi.quantityRequested);
    }
    return {
        lines: [...byItem].map(([itemId, quantityRequested]) => ({ itemId, quantityRequested })),
        skipped,
    };
}

/**
 * Lines covering what the supplier still owes this warehouse
 * (`WarehouseStock.pending_deficit`), rounded up to whole cases.
 */
export function linesFromDeficits(
    items: Array<{
        id: number;
        default_assignment_qty: number;
        WarehouseStock?: Array<{ warehouseId: number; pending_deficit?: number }>;
    }>,
    warehouseId: number,
): OrderLine[] {
    const lines: OrderLine[] = [];
    for (const item of items) {
        const deficit = item.WarehouseStock?.find((ws) => ws.warehouseId === warehouseId)?.pending_deficit ?? 0;
        if (deficit > 0) {
            lines.push({ itemId: item.id, quantityRequested: roundUpToBatch(deficit, item.default_assignment_qty) });
        }
    }
    return lines;
}
