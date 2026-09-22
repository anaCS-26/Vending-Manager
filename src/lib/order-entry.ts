/**
 * Purchase-order drafting rules, as pure functions (no React/Prisma) — the
 * `refill-entry.ts` / `forecast.ts` pattern. `OrderManagerUI` only renders them.
 *
 * A supplier order is placed in cartons, so that is the unit a line is typed
 * in: "5" on SIPP GREEN means 5 cartons of 8 packets of 20, and the line
 * stores the 800 pieces. A line can be switched to packets or pieces for the
 * odd order that isn't whole cartons. Unlike the driver's refill sheet (where
 * a carton is the wrong unit — see `refill-entry.ts`), nothing here fabricates
 * a figure: a PO line is a request, and what arrives is counted at receiving.
 *
 * The carton is `Item.pieces_per_box` × `Item.packets_per_carton`, never the
 * driver batch (`Item.default_assignment_qty`): MOVENPICK comes in cartons of
 * 10 and goes out to a driver 3 at a time.
 */

import { cartonSize, describeCount, hasCarton, hasPackets, levelsOf, type Levels } from "@/lib/packaging";

export type OrderUnit = "carton" | "packet" | "piece";

/**
 * `unit` is only set once the admin picks one; until then the line shows the
 * largest unit its quantity is a whole number of (see `lineUnit`).
 */
export type OrderLine = { itemId: number; quantityRequested: number; unit?: OrderUnit };

export const UNIT_LABEL: Record<OrderUnit, { one: string; many: string }> = {
    carton: { one: "carton", many: "cartons" },
    packet: { one: "packet", many: "packets" },
    piece: { one: "pc", many: "pcs" },
};

/** The units an item can be ordered in, biggest first. */
export function unitsFor(l: Levels): OrderUnit[] {
    const units: OrderUnit[] = [];
    if (hasCarton(l)) units.push("carton");
    if (hasPackets(l)) units.push("packet");
    units.push("piece");
    return units;
}

/** Pieces in one of `unit`. */
export function unitSize(unit: OrderUnit, l: Levels): number {
    if (unit === "carton") return cartonSize(l);
    if (unit === "packet") return hasPackets(l) ? l.perPacket : 1;
    return 1;
}

/**
 * The unit a line is shown in: the one the admin picked, as long as the
 * quantity is still a whole number of it — otherwise the biggest unit that
 * divides it exactly. A repeated order of 700 SIPP GREEN shows as 35 packets,
 * never as a rounded 4 or 5 cartons: nothing here changes a quantity unasked.
 */
export function lineUnit(line: OrderLine, l: Levels): OrderUnit {
    const units = unitsFor(l);
    if (line.unit && units.includes(line.unit) && line.quantityRequested % unitSize(line.unit, l) === 0) return line.unit;
    return units.find((u) => line.quantityRequested % unitSize(u, l) === 0) ?? "piece";
}

/** The number typed in the line's box, in its unit. */
export function lineCount(line: OrderLine, l: Levels): number {
    return line.quantityRequested / unitSize(lineUnit(line, l), l);
}

/** The line after typing `count` into its box. */
export function withCount(line: OrderLine, count: number, l: Levels): OrderLine {
    const unit = lineUnit(line, l);
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    return { ...line, unit, quantityRequested: n * unitSize(unit, l) };
}

/**
 * The line in another unit. Rounds UP to whole units — suppliers don't split a
 * carton, and rounding down could empty the line.
 */
export function withUnit(line: OrderLine, unit: OrderUnit, l: Levels): OrderLine {
    const size = unitSize(unit, l);
    return { ...line, unit, quantityRequested: Math.max(1, Math.ceil(line.quantityRequested / size)) * size };
}

/**
 * One tap of − or +, by one of the line's unit. A line never drops below one
 * unit — a line at zero is a line the admin should delete, and
 * `createPurchaseOrder` rejects it. A − that would cross that floor is refused
 * rather than clamped.
 */
export function stepLine(line: OrderLine, delta: 1 | -1, l: Levels): OrderLine {
    const unit = lineUnit(line, l);
    const count = lineCount(line, l) + delta;
    return count >= 1 ? { ...line, unit, quantityRequested: count * unitSize(unit, l) } : line;
}

/** A new line starts at one carton; items with no carton size start at 1. */
export function defaultOrderQuantity(carton: number | null | undefined): number {
    return typeof carton === "number" && Number.isFinite(carton) && carton > 0 ? Math.floor(carton) : 1;
}

/**
 * Where a newly added line starts: what was ordered of this item last time, so
 * a routine order is mostly Enter, Enter. Never less than one carton — a stray
 * test order of 1 piece shouldn't become the default.
 */
export function startingQuantity(carton: number, lastOrdered: number | null | undefined): number {
    const oneCarton = defaultOrderQuantity(carton);
    return typeof lastOrdered === "number" && Number.isInteger(lastOrdered) && lastOrdered >= oneCarton ? lastOrdered : oneCarton;
}

/** Smallest whole number of cartons covering `qty` (suppliers don't split one). */
export function roundUpToBatch(qty: number, carton: number | null | undefined): number {
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    const size = defaultOrderQuantity(carton);
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
 * (`WarehouseStock.pending_deficit`), rounded up to whole cartons.
 */
export function linesFromDeficits(
    items: Array<{
        id: number;
        pieces_per_box: number | null;
        packets_per_carton?: number | null;
        WarehouseStock?: Array<{ warehouseId: number; pending_deficit?: number }>;
    }>,
    warehouseId: number,
): OrderLine[] {
    const lines: OrderLine[] = [];
    for (const item of items) {
        const deficit = item.WarehouseStock?.find((ws) => ws.warehouseId === warehouseId)?.pending_deficit ?? 0;
        if (deficit > 0) {
            lines.push({ itemId: item.id, quantityRequested: roundUpToBatch(deficit, cartonSize(levelsOf(item))) });
        }
    }
    return lines;
}

export type LastOrdered = { quantity: number; orderId: number; date: Date };

/**
 * The most recent quantity requested of each item, across orders that weren't
 * cancelled. Feeds the starting quantity of a new line and its "Last time" hint.
 */
export function lastOrderedByItem(
    orders: Array<{ id: number; status: string; createdAt: Date | string; Items: Array<{ itemId: number; quantityRequested: number }> }>,
): Map<number, LastOrdered> {
    const newestFirst = orders
        .filter((o) => o.status !== "CANCELLED")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const last = new Map<number, LastOrdered>();
    for (const order of newestFirst) {
        const inThisOrder = new Map<number, number>();
        for (const oi of order.Items) inThisOrder.set(oi.itemId, (inThisOrder.get(oi.itemId) ?? 0) + oi.quantityRequested);
        for (const [itemId, quantity] of inThisOrder) {
            if (!last.has(itemId) && quantity > 0) last.set(itemId, { quantity, orderId: order.id, date: new Date(order.createdAt) });
        }
    }
    return last;
}

/** "5 cartons", "35 packets", "22 cartons + 20 pcs", "30 pcs". */
export function formatOrderQuantity(pieces: number, l: Levels): string {
    return describeCount(pieces, l) ?? `${pieces.toLocaleString("en-US")} ${pieces === 1 ? "pc" : "pcs"}`;
}

/**
 * The order as a plain message for the supplier (WhatsApp, SMS, email), in
 * cartons — the unit the supplier sells in. `date` arrives pre-formatted so
 * this stays free of locale code.
 */
export function orderAsText(order: {
    id: number;
    warehouseName: string;
    date: string;
    lines: Array<{ name: string; quantity: number; levels: Levels }>;
}): string {
    const head = [`Purchase order PO-${String(order.id).padStart(4, "0")}`, `Deliver to: ${order.warehouseName}`, `Date: ${order.date}`];
    const body = order.lines.map((l, i) => `${i + 1}. ${l.name} — ${formatOrderQuantity(l.quantity, l.levels)}`);
    return [...head, "", ...body, "", `${order.lines.length} ${order.lines.length === 1 ? "item" : "items"}`].join("\n");
}
