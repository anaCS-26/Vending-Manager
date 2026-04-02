"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-utils";

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
    await requireAdmin();
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
 */
export async function completePurchaseOrder(
    orderId: number,
    receivedData: Array<{ purchaseOrderItemId: number; quantityReceived: number; costPerUnit: number; price_standard: number; price_hospital: number; price_hotel: number }>
) {
    await requireAdmin();
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Get the order
            const order = await tx.purchaseOrder.findUniqueOrThrow({
                where: { id: orderId },
                include: { Items: true },
            });

            if (order.status === "COMPLETED") {
                throw new Error("Order is already completed.");
            }

            // 2. Process each item
            for (const item of receivedData) {
                const orderItem = order.Items.find((oi: any) => oi.id === item.purchaseOrderItemId);
                if (!orderItem) continue;

                // Update the quantity received
                await tx.purchaseOrderItem.update({
                    where: { id: item.purchaseOrderItemId },
                    data: { quantityReceived: item.quantityReceived },
                });

                const deficitChange = orderItem.quantityRequested - item.quantityReceived;

                // Calculate Weighted Average Cost (WAC): (Existing Value + New Value) / Total Qty
                const wStock = await tx.warehouseStock.aggregate({ where: { itemId: orderItem.itemId }, _sum: { quantity_on_hand: true } });
                const mStock = await tx.machineStock.aggregate({ where: { itemId: orderItem.itemId }, _sum: { estimated_stock: true } });
                const dStock = await (tx as any).driverStock.aggregate({ where: { itemId: orderItem.itemId }, _sum: { quantity_on_hand: true } });
                
                const totalCurrentQty = (wStock._sum.quantity_on_hand || 0) + (mStock._sum.estimated_stock || 0) + (dStock._sum.quantity_on_hand || 0);
                const itemData = await tx.item.findUnique({ where: { id: orderItem.itemId }, select: { cost: true } });
                const currentCost = itemData?.cost || 0;
                
                const previousValue = totalCurrentQty * currentCost;
                const incomingValue = item.quantityReceived * item.costPerUnit;
                const newTotalQty = totalCurrentQty + item.quantityReceived;
                
                const newWeightedCost = newTotalQty > 0 ? (previousValue + incomingValue) / newTotalQty : item.costPerUnit;

                // Upsert to warehouse stock
                if (item.quantityReceived > 0 || deficitChange !== 0) {
                    const existingStock = await tx.warehouseStock.findUnique({
                        where: {
                            warehouseId_itemId: {
                                warehouseId: order.warehouseId,
                                itemId: orderItem.itemId,
                            },
                        },
                    });

                    if (existingStock) {
                        // Automatically resolve old debt if we received more than requested (overage)
                        const newDeficitTotal = Math.max(0, (existingStock.pending_deficit || 0) + deficitChange);

                        await tx.warehouseStock.update({
                            where: { id: existingStock.id },
                            data: {
                                quantity_on_hand: { increment: item.quantityReceived },
                                pending_deficit: newDeficitTotal
                            },
                        });
                    } else {
                        await tx.warehouseStock.create({
                            data: {
                                warehouseId: order.warehouseId,
                                itemId: orderItem.itemId,
                                quantity_on_hand: item.quantityReceived,
                                pending_deficit: Math.max(0, deficitChange)
                            },
                        });
                    }
                }

                // Update Item pricing globally + WAC
                await tx.item.update({
                    where: { id: orderItem.itemId },
                    data: {
                        cost: newWeightedCost,
                        price_standard: item.price_standard,
                        price_hospital: item.price_hospital,
                        price_hotel: item.price_hotel
                    }
                });
            }

            // 3. Mark the order as completed
            await tx.purchaseOrder.update({
                where: { id: orderId },
                data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                },
            });
        });

        revalidatePath("/admin/suppliers");
        revalidatePath("/admin/warehouse");
        revalidatePath("/admin/history");
        return { success: true };
    } catch (error: any) {
        console.error("Failed to complete purchase order:", error);
        return { success: false, error: error.message || "Failed to complete purchase order" };
    }
}

/** Marks a pending inventory request as CANCELLED, preventing stock integration. */
export async function cancelPurchaseOrder(orderId: number) {
    await requireAdmin();
    try {
        await prisma.purchaseOrder.update({
            where: { id: orderId },
            data: { status: "CANCELLED" },
        });
        revalidatePath("/admin/suppliers");
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
    await requireAdmin();
    try {
        const item = await prisma.item.create({
            data: {
                name: data.name,
                sku: data.sku,
                category: data.category,
                bulk_format: data.bulk_format || null
            }
        });
        return { success: true, item: { ...item, WarehouseStock: [], _count: { DispatchItems: 0 } } };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to create new item" };
    }
}
