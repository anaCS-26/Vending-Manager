"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createPurchaseOrder(data: {
    warehouseId: number;
    items: Array<{
        itemId: number;
        quantityRequested: number;
    }>;
}) {
    try {
        const itemIds = data.items.map((i) => i.itemId);
        const itemCosts = await prisma.item.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, cost: true }
        });
        const costMap = new Map(itemCosts.map(i => [i.id, i.cost]));

        const order = await prisma.purchaseOrder.create({
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

export async function completePurchaseOrder(
    orderId: number,
    receivedData: Array<{ purchaseOrderItemId: number; quantityReceived: number; costPerUnit: number; retailPrice: number }>
) {
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

                // Calculate the deficit (if they received fewer items than requested)
                const deficitAmount = Math.max(0, orderItem.quantityRequested - item.quantityReceived);

                // Upsert to warehouse stock
                if (item.quantityReceived > 0 || deficitAmount > 0) {
                    const existingStock = await tx.warehouseStock.findUnique({
                        where: {
                            warehouseId_itemId: {
                                warehouseId: order.warehouseId,
                                itemId: orderItem.itemId,
                            },
                        },
                    });

                    if (existingStock) {
                        await tx.warehouseStock.update({
                            where: { id: existingStock.id },
                            data: {
                                quantity_on_hand: { increment: item.quantityReceived },
                                pending_deficit: deficitAmount // Overwrite any old deficit with the latest transaction reality
                            },
                        });
                    } else {
                        await tx.warehouseStock.create({
                            data: {
                                warehouseId: order.warehouseId,
                                itemId: orderItem.itemId,
                                quantity_on_hand: item.quantityReceived,
                                pending_deficit: deficitAmount
                            },
                        });
                    }
                }

                // Update Item pricing globally
                await tx.item.update({
                    where: { id: orderItem.itemId },
                    data: {
                        cost: item.costPerUnit,
                        price: item.retailPrice
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

export async function cancelPurchaseOrder(orderId: number) {
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

// Quick action to create an Item if it doesn't exist
export async function createQuickItem(data: { name: string; sku: string; category: string; bulk_format?: string, price: number }) {
    try {
        const item = await prisma.item.create({
            data: {
                name: data.name,
                sku: data.sku,
                category: data.category,
                bulk_format: data.bulk_format || null,
                price: data.price
            }
        });
        return { success: true, item: { ...item, WarehouseStock: [], _count: { DispatchItems: 0 } } };
    } catch (error: any) {
        return { success: false, error: error.message || "Failed to create new item" };
    }
}
