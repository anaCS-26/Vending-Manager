"use server";

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { notifyClients } from "@/lib/notify"
import type { ActionResult } from "@/types"

export async function getPendingReturns() {
    return await prisma.returnVerification.findMany({
        where: { status: "PENDING" },
        include: {
            item: true,
            dispatch: {
                include: { driver: true }
            }
        },
        orderBy: { reported_at: 'desc' }
    });
}

export async function getProcessedReturns() {
    return await prisma.returnVerification.findMany({
        where: { status: { in: ["APPROVED", "REJECTED"] } },
        include: {
            item: true,
            dispatch: {
                include: { driver: true }
            }
        },
        orderBy: { verified_at: 'desc' },
        take: 50 // limit history for prototype
    });
}

export async function approveReturn(returnId: number): Promise<ActionResult> {
    try {
        await prisma.$transaction(async (tx) => {
            const ret = await tx.returnVerification.findUnique({
                where: { id: returnId },
                include: { item: true }
            });

            if (!ret || ret.status !== "PENDING") {
                throw new Error("Return is not pending or not found.");
            }

            // Mark as approved
            await tx.returnVerification.update({
                where: { id: returnId },
                data: { status: "APPROVED", verified_at: new Date() }
            });

            // Create an InventoryAdjustment to formally write off the item cost
            await tx.inventoryAdjustment.create({
                data: {
                    itemId: ret.itemId,
                    quantity: -ret.quantity, // Write off, so negative
                    reason: ret.reason,
                    locationName: "Approved Driver Return",
                    priceAtAdjustment: ret.item.price
                }
            });
        });

        revalidatePath('/admin/returns');
        revalidatePath('/admin/adjustments');
        notifyClients('returns');
        return { success: true, data: undefined };

    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to approve return" };
    }
}

export async function rejectReturn(returnId: number): Promise<ActionResult> {
    try {
        await prisma.returnVerification.update({
            where: { id: returnId },
            data: { status: "REJECTED", verified_at: new Date() }
        });

        revalidatePath('/admin/returns');
        notifyClients('returns');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to reject return" };
    }
}
