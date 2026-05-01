"use server";

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { notifyClients } from "@/lib/notify"
import type { ActionResult } from "@/types"
import { requireAdmin } from "@/lib/auth-utils"
import { writeAuditLog } from "@/lib/audit-utils"

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
            // Both relations are populated where applicable: legacy rows carry
            // dispatch (with nested driver), dispatchless rows carry driver directly.
            driver: true,
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
            driver: true,
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
export async function approveReturn(returnId: number, actionType: 'RESTOCK' | 'LOSS', adminNotes?: string): Promise<ActionResult> {
    const session = await requireAdmin();
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

            if (actionType === 'RESTOCK') {
                const defaultWarehouse = await tx.warehouse.findFirst();
                if (!defaultWarehouse) throw new Error("No warehouse found to restock to.");
                
                await tx.warehouseStock.upsert({
                    where: { warehouseId_itemId: { warehouseId: defaultWarehouse.id, itemId: ret.itemId } },
                    update: { quantity_on_hand: { increment: ret.quantity } },
                    create: { warehouseId: defaultWarehouse.id, itemId: ret.itemId, quantity_on_hand: ret.quantity }
                });

                // Create a positive InventoryAdjustment to formally log the restock
                await tx.inventoryAdjustment.create({
                    data: {
                        itemId: ret.itemId,
                        quantity: ret.quantity,
                        reason: adminNotes ? `Restocked Surplus Return: ${adminNotes}` : `Restocked Surplus Return`,
                        priceAtAdjustment: ret.item.price_standard
                    }
                });
            } else {
                // Create a negative InventoryAdjustment to formally write off the item cost
                await tx.inventoryAdjustment.create({
                    data: {
                        itemId: ret.itemId,
                        quantity: -ret.quantity, // Write off, so negative
                        reason: adminNotes ? `Written-off Driver Return: ${ret.reason} - ${adminNotes}` : `Written-off Driver Return: ${ret.reason}`,
                        priceAtAdjustment: ret.item.price_standard
                    }
                });
            }
        });

        revalidatePath('/admin/returns');
        revalidatePath('/admin/adjustments');
        notifyClients('returns');
        
        await writeAuditLog(session, 'APPROVE_RETURN', 'ReturnVerification', returnId, null, { adminNotes });
        
        return { success: true, data: undefined };

    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to approve return" };
    }
}

/** Rejects a return claim, preserving the original stock level as unaccounted for in the audit. */
export async function rejectReturn(returnId: number): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        await prisma.$transaction(async (tx) => {
            const ret = await tx.returnVerification.findUnique({
                where: { id: returnId },
                include: { dispatch: true }
            });

            if (!ret || ret.status !== "PENDING") {
                throw new Error("Return is not pending or not found.");
            }

            await tx.returnVerification.update({
                where: { id: returnId },
                data: { status: "REJECTED", verified_at: new Date() }
            });

            // If the admin rejects a driver's return, the inventory was not accepted
            // back into the warehouse. Therefore, the driver is still in possession of it
            // (or is liable for it). We must put it back into their DriverStock.
            const targetDriverId = ret.driverId || ret.dispatch?.driverId;
            
            if (targetDriverId) {
                await tx.driverStock.upsert({
                    where: { driverId_itemId: { driverId: targetDriverId, itemId: ret.itemId } },
                    update: { quantity_on_hand: { increment: ret.quantity } },
                    create: { driverId: targetDriverId, itemId: ret.itemId, quantity_on_hand: ret.quantity }
                });
            }
        });

        revalidatePath('/admin/returns');
        revalidatePath('/admin/driver-stock');
        notifyClients('returns');
        
        await writeAuditLog(session, 'REJECT_RETURN', 'ReturnVerification', returnId, null, null);
        
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to reject return" };
    }
}
