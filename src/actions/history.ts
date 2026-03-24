"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { notifyClients } from "@/lib/notify";
import type { ActionResult } from "@/types";

export async function updateRefillLog(
    logId: number,
    sold: number,
    refilled: number
): Promise<ActionResult> {
    try {
        if (sold < 0 || refilled < 0) {
            throw new Error("Quantities cannot be negative");
        }

        await prisma.$transaction(async (tx) => {
            // 1. Get current log to see delta
            const log = await tx.refillLog.findUnique({
                where: { id: logId }
            });

            if (!log) throw new Error("Log not found");

            const deltaRefilled = refilled - log.quantity_refilled;

            // 2. Update the log
            await tx.refillLog.update({
                where: { id: logId },
                data: {
                    items_sold_since_last_refill: sold,
                    quantity_refilled: refilled
                }
            });

            // 3. Update MachineStock estimated_stock based on refill delta
            // Note: We don't adjust for 'sold' delta here because MachineStock.estimated_stock is updated 
            // at the TIME of refill based on what the driver found. 
            // However, a change in 'refilled' amount directly changes the final stock.
            if (deltaRefilled !== 0) {
                const machineStock = await tx.machineStock.findUnique({
                    where: {
                        machineId_itemId: {
                            machineId: log.machineId,
                            itemId: log.itemId
                        }
                    }
                });

                if (!machineStock) throw new Error("Machine stock record not found for this log");
                const nextEstimated = Math.max(0, Math.min(machineStock.capacity, machineStock.estimated_stock + deltaRefilled));

                await tx.machineStock.update({
                    where: {
                        machineId_itemId: {
                            machineId: log.machineId,
                            itemId: log.itemId
                        }
                    },
                    data: {
                        estimated_stock: nextEstimated
                    }
                });
            }
        });

        revalidatePath('/admin/history');
        revalidatePath('/admin/financials'); // Financials depend on sold/refilled
        notifyClients('refill-update');
        return { success: true, data: undefined };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update log"
        };
    }
}
