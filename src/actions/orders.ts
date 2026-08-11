"use server";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";
import { writeAuditLog } from "@/lib/audit-utils";
import { notifyClients } from "@/lib/notify";
import { computeWeightedCost } from "@/lib/wac-math";

/**
 * ============================================================================
 * PURCHASE ORDER ACTIONS
 * Handles procurement flow from suppliers to warehouses.
 * ============================================================================
 */

/** 
 * Initiates a procurement request. 
 * Creates a PENDING purchase order record with standard costs locked at the time of request. 
 */
export async function createPurchaseOrder(data: {
    warehouseId: number;
    items: Array<{
        itemId: number;
        quantityRequested: number;
    }>;
}) {
    const session = await requireAdmin();
    try {
        const itemIds = data.items.map((i) => i.itemId);
        const itemCosts = await prisma.item.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, cost: true }
        });
        const costMap = new Map(itemCosts.map(i => [i.id, i.cost]));

        const order = await prisma.purchaseOrder.create({
            // Status: PENDING until items are physically received in warehouse.
            data: {
                warehouseId: data.warehouseId,
                status: "PENDING",
                Items: {
                    create: data.items.map((item) => ({
                        itemId: item.itemId,
                        quantityRequested: item.quantityRequested,
                        costPerUnit: costMap.get(item.itemId) || 0,
                    })),
                },
            },
        });

        revalidatePath("/admin/suppliers");
        
        await writeAuditLog(session, 'CREATE_PURCHASE_ORDER', 'PurchaseOrder', order.id, null, data);
        notifyClients('purchase-order');

        return { success: true, orderId: order.id };
    } catch (error: any) {
        console.error("Failed to create purchase order:", error);
        return { success: false, error: error.message || "Failed to create purchase order" };
    }
}

/**
 * Finalizes a purchase order receipt.
 * Performs an atomic stock update, calculates new Weighted Average Cost (WAC) for items,
 * and automatically reconciles any outstanding supplier deficits (short-shipments).
 *
 * Reference reads happen BEFORE the transaction and the writes are constant
 * set-based statements, exactly as in assignToDriver / logBatchRefillsDispatchless.
 * This receipt previously ran ~8 sequential queries *per line item* inside the
 * interactive transaction (3 stock aggregates + item read + stock read + 3
 * writes). Production talks to Postgres through the Supavisor pooler at
 * ~70-100ms per round trip from Vercel, so roughly a dozen lines exhausted
 * Prisma's default 5s interactive-transaction window and the receiver got
 * P2028 ("Transaction not found. Transaction ID is invalid...") on a real
 * supplier invoice. Query count is now independent of line count.
 */
export async function completePurchaseOrder(
    orderId: number,
    receivedData: Array<{ purchaseOrderItemId: number; quantityReceived: number; costPerUnit: number; price_standard: number; price_hospital: number; price_hotel: number }>
) {
    const session = await requireAdmin();
    try {
        // ── Reference reads (outside the tx, batched) ────────────────────────
        const order = await prisma.purchaseOrder.findUniqueOrThrow({
            where: { id: orderId },
            include: { Items: true },
        });

        if (order.status === "COMPLETED") {
            throw new Error("Order is already completed.");
        }

        const orderItemById = new Map(order.Items.map((oi) => [oi.id, oi]));
        const lines = receivedData
            .filter((r) => orderItemById.has(r.purchaseOrderItemId))
            .map((r) => ({ received: r, orderItem: orderItemById.get(r.purchaseOrderItemId)! }));

        // Quantities land in raw `::int` columns, so reject junk here rather
        // than letting Postgres report it as a cast error.
        for (const { received } of lines) {
            if (!Number.isInteger(received.quantityReceived) || received.quantityReceived < 0) {
                throw new Error("Received quantity must be a whole number >= 0.");
            }
        }

        // Two PurchaseOrderItem rows can reference the same Item; the old loop
        // blended them one after the other. Merging by itemId is exact for WAC
        // — blending (q1 @ c1) then (q2 @ c2) into the same prior stock equals
        // blending one lot of Σq at Σ(q·c)/Σq — and it is *required* here
        // because `UPDATE … FROM (VALUES …)` is undefined when two value rows
        // match the same target row.
        const byItem = new Map<number, {
            itemId: number;
            receivedQty: number;
            incomingValue: number;
            deficitChange: number;
            lastCostPerUnit: number;
            price_standard: number;
            price_hospital: number;
            price_hotel: number;
        }>();
        for (const { received, orderItem } of lines) {
            const deficitChange = orderItem.quantityRequested - received.quantityReceived;
            const existing = byItem.get(orderItem.itemId);
            if (existing) {
                existing.receivedQty += received.quantityReceived;
                existing.incomingValue += received.quantityReceived * received.costPerUnit;
                existing.deficitChange += deficitChange;
                // Prices and last_purchase_cost stay last-line-wins, as before.
                existing.lastCostPerUnit = received.costPerUnit;
                existing.price_standard = received.price_standard;
                existing.price_hospital = received.price_hospital;
                existing.price_hotel = received.price_hotel;
            } else {
                byItem.set(orderItem.itemId, {
                    itemId: orderItem.itemId,
                    receivedQty: received.quantityReceived,
                    incomingValue: received.quantityReceived * received.costPerUnit,
                    deficitChange,
                    lastCostPerUnit: received.costPerUnit,
                    price_standard: received.price_standard,
                    price_hospital: received.price_hospital,
                    price_hotel: received.price_hotel,
                });
            }
        }
        const mergedItems = [...byItem.values()];
        const itemIds = mergedItems.map((m) => m.itemId);

        // Prior on-hand quantity across Warehouse + Machine + Driver for every
        // item on the order: 3 grouped queries instead of 3 aggregates per line.
        const [wSums, mSums, dSums, itemRows] = itemIds.length
            ? await Promise.all([
                prisma.warehouseStock.groupBy({ by: ["itemId"], where: { itemId: { in: itemIds } }, _sum: { quantity_on_hand: true } }),
                prisma.machineStock.groupBy({ by: ["itemId"], where: { itemId: { in: itemIds } }, _sum: { estimated_stock: true } }),
                prisma.driverStock.groupBy({ by: ["itemId"], where: { itemId: { in: itemIds } }, _sum: { quantity_on_hand: true } }),
                prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, cost: true } }),
            ])
            : [[], [], [], []];

        const priorQty = new Map<number, number>(itemIds.map((id) => [id, 0]));
        for (const r of wSums) priorQty.set(r.itemId, (priorQty.get(r.itemId) ?? 0) + (r._sum.quantity_on_hand ?? 0));
        for (const r of mSums) priorQty.set(r.itemId, (priorQty.get(r.itemId) ?? 0) + (r._sum.estimated_stock ?? 0));
        for (const r of dSums) priorQty.set(r.itemId, (priorQty.get(r.itemId) ?? 0) + (r._sum.quantity_on_hand ?? 0));
        const costById = new Map(itemRows.map((i) => [i.id, i.cost]));

        const writes = mergedItems.map((m) => ({
            ...m,
            newCost: computeWeightedCost(
                priorQty.get(m.itemId) ?? 0,
                costById.get(m.itemId) ?? 0,
                m.receivedQty,
                // Blended cost of this receipt's lot(s) for the item.
                m.receivedQty > 0 ? m.incomingValue / m.receivedQty : m.lastCostPerUnit,
            ),
        }));
        // A line that neither delivered units nor moved the deficit must not
        // conjure a WarehouseStock row, same as the old `if` guard.
        const stockWrites = writes.filter((w) => w.receivedQty > 0 || w.deficitChange !== 0);

        // ── Writes (inside the tx, constant statement count) ─────────────────
        await prisma.$transaction(async (tx) => {
            // Claim the order first. `updateMany` with a status guard is the
            // atomic form of the old read-then-check: it locks the PO row for
            // the rest of the transaction, so two receivers hitting Complete at
            // the same moment cannot both apply their stock.
            const claimed = await tx.purchaseOrder.updateMany({
                where: { id: orderId, status: { not: "COMPLETED" } },
                data: { status: "COMPLETED", completedAt: new Date() },
            });
            if (claimed.count === 0) {
                throw new Error("Order is already completed.");
            }

            if (lines.length > 0) {
                await tx.$executeRaw`
                    UPDATE "PurchaseOrderItem" AS poi
                    SET "quantityReceived" = v.qty
                    FROM (VALUES ${Prisma.join(lines.map((l) => Prisma.sql`(${l.received.purchaseOrderItemId}::int, ${l.received.quantityReceived}::int)`))}) AS v(id, qty)
                    WHERE poi.id = v.id
                `;
            }

            if (stockWrites.length > 0) {
                // pending_deficit is inserted RAW here — it is negative when the
                // supplier over-shipped, which pays down an older shortage — and
                // clamped to 0 by the follow-up statement. It cannot be clamped
                // inline: `ON CONFLICT DO UPDATE` can reference EXCLUDED and the
                // target row but not the VALUES alias, so one expression cannot
                // serve both the insert path (max(0, change)) and the update path
                // (max(0, existing + change)).
                await tx.$executeRaw`
                    INSERT INTO "WarehouseStock" ("warehouseId", "itemId", quantity_on_hand, pending_deficit)
                    VALUES ${Prisma.join(stockWrites.map((w) => Prisma.sql`(${order.warehouseId}::int, ${w.itemId}::int, ${w.receivedQty}::int, ${w.deficitChange}::int)`))}
                    ON CONFLICT ("warehouseId", "itemId") DO UPDATE
                    SET quantity_on_hand = "WarehouseStock".quantity_on_hand + EXCLUDED.quantity_on_hand,
                        pending_deficit  = "WarehouseStock".pending_deficit + EXCLUDED.pending_deficit
                `;
                await tx.$executeRaw`
                    UPDATE "WarehouseStock"
                    SET pending_deficit = 0
                    WHERE "warehouseId" = ${order.warehouseId}
                      AND "itemId" IN (${Prisma.join(stockWrites.map((w) => Prisma.sql`${w.itemId}::int`))})
                      AND pending_deficit < 0
                `;
            }

            if (writes.length > 0) {
                await tx.$executeRaw`
                    UPDATE "Item" AS i
                    SET cost = v.cost,
                        last_purchase_cost = v.last_cost,
                        price_standard = v.p_standard,
                        price_hospital = v.p_hospital,
                        price_hotel = v.p_hotel
                    FROM (VALUES ${Prisma.join(writes.map((w) => Prisma.sql`(${w.itemId}::int, ${w.newCost}::double precision, ${w.lastCostPerUnit}::double precision, ${w.price_standard}::double precision, ${w.price_hospital}::double precision, ${w.price_hotel}::double precision)`))}) AS v("itemId", cost, last_cost, p_standard, p_hospital, p_hotel)
                    WHERE i.id = v."itemId"
                `;
            }
        }, { timeout: 15_000, maxWait: 5_000 });

        revalidatePath("/admin/suppliers");
        revalidatePath("/admin/warehouse");
        revalidatePath("/admin/history");
        
        await writeAuditLog(session, 'COMPLETE_PURCHASE_ORDER', 'PurchaseOrder', orderId, null, { receivedData });
        notifyClients('purchase-order');
        
        return { success: true };
    } catch (error: any) {
        console.error("Failed to complete purchase order:", error);
        return { success: false, error: error.message || "Failed to complete purchase order" };
    }
}

/** Marks a pending inventory request as CANCELLED, preventing stock integration. */
export async function cancelPurchaseOrder(orderId: number) {
    const session = await requireAdmin();
    try {
        await prisma.purchaseOrder.update({
            where: { id: orderId },
            data: { status: "CANCELLED" },
        });
        revalidatePath("/admin/suppliers");
        
        await writeAuditLog(session, 'CANCEL_PURCHASE_ORDER', 'PurchaseOrder', orderId, null, null);
        notifyClients('purchase-order');
        
        return { success: true };
    } catch (error: any) {
        console.error("Failed to cancel purchase order:", error);
        return { success: false, error: error.message || "Failed to cancel purchase order" };
    }
}

/**
 * ============================================================================
 * QUICK PROCUREMENT TOOLS
 * Helper actions for rapid item initialization during procurement.
 * ============================================================================
 */

/** 
 * Expedited item creation for procurement workflows. 
 * Allows creating a placeholder item record when not found in the master catalog during PO entry. 
 */
export async function createQuickItem(data: { name: string; sku: string; category: string; bulk_format?: string }) {
    const session = await requireAdmin();
    try {
        const item = await prisma.item.create({
            data: {
                name: data.name,
                sku: data.sku,
                category: data.category,
                bulk_format: data.bulk_format || null
            }
        });
        
        await writeAuditLog(session, 'CREATE_QUICK_ITEM', 'Item', item.id, null, data);
        notifyClients('item');
        
        return { success: true, item: { ...item, WarehouseStock: [], _count: { DispatchItems: 0 } } };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to create new item" };
    }
}
