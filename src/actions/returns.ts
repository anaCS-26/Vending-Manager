"use server";

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { notifyClients } from "@/lib/notify"
import type { ActionResult } from "@/types"
import { requireAdmin } from "@/lib/auth-utils"

/**
 * ============================================================================
 * DRIVER RETURN VERIFICATION
 * Logic for admins to approve or reject items reported as damaged/returned by drivers.
 * ============================================================================
 */

/** 
 * Retrieves all reported damages and returns awaiting administrative verification. 
 * Sorted by latest reporting date for prioritized backlog processing. 
 */
export async function getPendingReturns() {
    await requireAdmin();
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

/** Retrieves historical records of approved or rejected returns for the audit archive. */
export async function getProcessedReturns() {
    await requireAdmin();
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

/**
 * Formally approves a driver-reported return. 
 * Creates a linked InventoryAdjustment to write off negative stock and update the financial ledger. 
 */
export async function approveReturn(returnId: number, adminNotes?: string): Promise<ActionResult> {
    await requireAdmin();
    try {
        await prisma.$transaction(async (tx) => {
            const ret = await tx.returnVerification.findUnique({
                where: { id: returnId },
                include: { item: true }
            });

            if (!ret || ret.status !== "PENDING") {
                throw new Error("Return is not pending or not found.");
            }

            // Mark as approved and optional add notes string
            await tx.returnVerification.update({
                where: { id: returnId },
                data: { status: "APPROVED", verified_at: new Date(), notes: adminNotes || null }
            });

            // Create an InventoryAdjustment to formally write off the item cost
            await tx.inventoryAdjustment.create({
                data: {
                    itemId: ret.itemId,
                    quantity: -ret.quantity, // Write off, so negative
                    reason: adminNotes ? `Approved Driver Return: ${ret.reason} - ${adminNotes}` : `Approved Driver Return: ${ret.reason}`,
                    priceAtAdjustment: ret.item.price_standard
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

/** Rejects a return claim, preserving the original stock level as unaccounted for in the audit. */
export async function rejectReturn(returnId: number): Promise<ActionResult> {
    await requireAdmin();
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
