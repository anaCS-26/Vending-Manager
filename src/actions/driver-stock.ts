"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { notifyClients } from "@/lib/notify"
import type { ActionResult } from "@/types"
import { auth } from "@/auth"
import { requireAdmin, requireDriver } from "@/lib/auth-utils"
import { writeAuditLog } from "@/lib/audit-utils"

/**
 * ============================================================================
 * DISPATCHLESS DRIVER STOCK ACTIONS (Phase B)
 *
 * Replaces the Dispatch/Route abstraction with a "running bag" model.
 * - Admin pushes items into a driver's DriverStock via assignToDriver().
 * - Each push creates a StockAssignment audit row in PENDING_ACK.
 * - The driver acknowledges or disputes the push from the ack banner
 *   (acknowledgeAssignment / disputeAssignment).
 * - The driver returns items any time via submitDriverReturn(), which feeds
 *   the existing ReturnVerification approval queue but with dispatchId NULL.
 *
 * These actions are gated by NEXT_PUBLIC_USE_DISPATCHLESS in the UI; the
 * backend is always available. Old dispatchToDriver/returnDispatch actions
 * remain functional during the dual-run cutover window.
 * ============================================================================
 */

function assertWholeNonNegative(value: number, label: string) {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        throw new Error(`${label} must be a whole number >= 0`)
    }
}

/**
 * Admin pushes items into a driver's bag. One row per (item, push) is
 * recorded in StockAssignment for audit; DriverStock.quantity_on_hand is
 * incremented optimistically so the driver can begin work immediately.
 * The driver still must acknowledge (or dispute) the push from the ack banner.
 */
export async function assignToDriver(
    driverId: number,
    warehouseId: number,
    items: { itemId: number; quantity: number; notes?: string | null }[]
): Promise<ActionResult<{ assignmentIds: number[] }>> {
    const session = await requireAdmin()
    try {
        if (!items.length) throw new Error("Assignment must include at least one item")

        // Merge duplicates and reject zero/invalid quantities up front.
        const merged = new Map<number, { quantity: number; notes: string | null }>()
        for (const i of items) {
            assertWholeNonNegative(i.quantity, `Quantity for item ${i.itemId}`)
            if (i.quantity === 0) continue
            const prev = merged.get(i.itemId)
            merged.set(i.itemId, {
                quantity: (prev?.quantity || 0) + i.quantity,
                notes: i.notes ?? prev?.notes ?? null,
            })
        }
        if (!merged.size) throw new Error("Assignment must include at least one quantity > 0")

        const itemIds = Array.from(merged.keys())
        const dbItems = await prisma.item.findMany({ where: { id: { in: itemIds } } })
        if (dbItems.length !== itemIds.length) throw new Error("One or more items are invalid")

        const adminId = session.user?.id ? parseInt((session.user as any).id, 10) : null

        const assignmentIds: number[] = []
        await prisma.$transaction(async (tx) => {
            for (const [itemId, { quantity, notes }] of merged) {
                const dbItem = dbItems.find((d) => d.id === itemId)!

                // Decrement warehouse stock; reject if short (mirrors PO/dispatch behavior).
                const updated = await tx.warehouseStock.updateMany({
                    where: {
                        itemId,
                        warehouseId,
                        quantity_on_hand: { gte: quantity },
                    },
                    data: { quantity_on_hand: { decrement: quantity } },
                })
                if (updated.count === 0) {
                    throw new Error(`Insufficient warehouse stock for item ${dbItem.name}. Need ${quantity}.`)
                }

                // Audit row first so we can return its id even if the upsert later widens.
                const assignment = await tx.stockAssignment.create({
                    data: {
                        driverId,
                        itemId,
                        warehouseId,
                        quantity,
                        cost_at_assignment: dbItem.cost,
                        notes: notes ?? undefined,
                        assigned_by: adminId,
                        status: "PENDING_ACK",
                    },
                })
                assignmentIds.push(assignment.id)

                // Optimistic credit so the driver can refill immediately. If they
                // later dispute the count, disputeAssignment() corrects this.
                await tx.driverStock.upsert({
                    where: { driverId_itemId: { driverId, itemId } },
                    update: { quantity_on_hand: { increment: quantity } },
                    create: { driverId, itemId, quantity_on_hand: quantity },
                })
            }
        })

        await writeAuditLog(
            session,
            "ASSIGN_STOCK",
            "Driver",
            driverId,
            null,
            { warehouseId, items: Array.from(merged, ([itemId, v]) => ({ itemId, quantity: v.quantity })) },
            `Pushed ${assignmentIds.length} item(s) to driver bag`
        )

        revalidatePath("/admin")
        revalidatePath("/admin/driver-stock")
        revalidatePath("/driver")
        notifyClients("stock-assignment")

        return { success: true, data: { assignmentIds } }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to assign stock" }
    }
}

/**
 * Driver confirms they received the assignment as listed. No stock movement —
 * the optimistic credit landed at assignment time; this just flips the audit row.
 */
export async function acknowledgeAssignment(assignmentId: number): Promise<ActionResult> {
    const session = await auth()
    if (!session?.user) return { success: false, error: "Sign-in required." }
    const role = (session.user as any).role
    if (role !== "driver") return { success: false, error: "Only drivers can acknowledge assignments." }
    const driverId = parseInt((session.user as any).id, 10)
    if (!Number.isFinite(driverId)) return { success: false, error: "Invalid session." }

    try {
        const assignment = await prisma.stockAssignment.findUnique({ where: { id: assignmentId } })
        if (!assignment) return { success: false, error: "Assignment not found." }
        if (assignment.driverId !== driverId) return { success: false, error: "Not your assignment." }
        if (assignment.status !== "PENDING_ACK") {
            return { success: false, error: `Assignment is already ${assignment.status.toLowerCase()}.` }
        }

        await prisma.stockAssignment.update({
            where: { id: assignmentId },
            data: {
                status: "ACKNOWLEDGED",
                acknowledged_at: new Date(),
                acknowledged_qty: assignment.quantity,
            },
        })

        await writeAuditLog(
            session,
            "ACK_ASSIGNMENT",
            "StockAssignment",
            assignmentId,
            { status: "PENDING_ACK" },
            { status: "ACKNOWLEDGED", qty: assignment.quantity },
            null
        )

        notifyClients("assignment-ack")
        revalidatePath("/driver")
        revalidatePath("/admin/driver-stock")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to acknowledge assignment" }
    }
}

/**
 * Driver reports they received fewer items than the admin pushed. Corrects
 * the optimistic DriverStock credit by `delta = quantity - actualQty` and
 * writes an InventoryAdjustment with reason ASSIGNMENT_DISCREPANCY so the
 * shrinkage is visible in admin financials.
 */
export async function disputeAssignment(
    assignmentId: number,
    actualQty: number,
    notes?: string | null
): Promise<ActionResult> {
    const session = await auth()
    if (!session?.user) return { success: false, error: "Sign-in required." }
    const role = (session.user as any).role
    if (role !== "driver") return { success: false, error: "Only drivers can dispute assignments." }
    const driverId = parseInt((session.user as any).id, 10)
    if (!Number.isFinite(driverId)) return { success: false, error: "Invalid session." }

    try {
        assertWholeNonNegative(actualQty, "Actual quantity received")

        const assignment = await prisma.stockAssignment.findUnique({ where: { id: assignmentId } })
        if (!assignment) return { success: false, error: "Assignment not found." }
        if (assignment.driverId !== driverId) return { success: false, error: "Not your assignment." }
        if (assignment.status !== "PENDING_ACK") {
            return { success: false, error: `Assignment is already ${assignment.status.toLowerCase()}.` }
        }
        if (actualQty >= assignment.quantity) {
            return {
                success: false,
                error: "Actual must be less than the pushed quantity. Use acknowledge if you received the full amount.",
            }
        }

        const delta = assignment.quantity - actualQty // missing items

        await prisma.$transaction(async (tx) => {
            // Correct the optimistic credit. updateMany guards against running negative
            // (driver could have refilled some of it already; in that case we'd let it
            // go negative — admin will resolve via /admin/adjustments).
            await tx.driverStock.updateMany({
                where: { driverId, itemId: assignment.itemId },
                data: { quantity_on_hand: { decrement: delta } },
            })

            await tx.inventoryAdjustment.create({
                data: {
                    itemId: assignment.itemId,
                    quantity: -delta,
                    reason: "ASSIGNMENT_DISCREPANCY",
                    locationName: `Driver #${driverId} (assignment ${assignmentId})`,
                    priceAtAdjustment: assignment.cost_at_assignment,
                },
            })

            await tx.stockAssignment.update({
                where: { id: assignmentId },
                data: {
                    status: "DISPUTED",
                    acknowledged_at: new Date(),
                    acknowledged_qty: actualQty,
                    notes: notes ?? assignment.notes,
                },
            })
        })

        await writeAuditLog(
            session,
            "DISPUTE_ASSIGNMENT",
            "StockAssignment",
            assignmentId,
            { quantity: assignment.quantity },
            { actualQty, delta, notes: notes ?? null },
            "Driver reported discrepancy on stock assignment"
        )

        notifyClients("assignment-dispute")
        revalidatePath("/driver")
        revalidatePath("/admin/driver-stock")
        revalidatePath("/admin/adjustments")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to dispute assignment" }
    }
}

/**
 * Driver-initiated return. Each item-line creates one ReturnVerification with
 * dispatchId NULL and driverId set. DriverStock is decremented immediately
 * (the item leaves the bag the moment the driver records it; admin
 * verification just decides whether it goes back to warehouse stock or
 * shrinkage). Mirrors the existing ReturnVerification approval flow.
 */
export async function submitDriverReturn(
    items: {
        itemId: number
        quantity: number
        reason: "DAMAGED" | "EXPIRED" | "SURPLUS"
        notes?: string | null
    }[]
): Promise<ActionResult<{ returnIds: number[] }>> {
    const session = await requireDriver()
    const role = (session.user as any).role
    // Only drivers may use this self-service flow. Admins shadowing the portal
    // fall through to the existing dispatch-based return path.
    if (role !== "driver") {
        return { success: false, error: "Driver-only action." }
    }
    const driverId = parseInt((session.user as any).id, 10)
    if (!Number.isFinite(driverId)) return { success: false, error: "Invalid session." }

    try {
        if (!items.length) throw new Error("Return must include at least one item")

        const allowedReasons = new Set(["DAMAGED", "EXPIRED", "SURPLUS"])
        for (const i of items) {
            assertWholeNonNegative(i.quantity, `Return quantity for item ${i.itemId}`)
            if (i.quantity === 0) throw new Error("Return quantity must be > 0")
            if (!allowedReasons.has(i.reason)) throw new Error(`Invalid return reason: ${i.reason}`)
        }

        const itemIds = Array.from(new Set(items.map((i) => i.itemId)))
        const stockRows = await prisma.driverStock.findMany({
            where: { driverId, itemId: { in: itemIds } },
        })
        const onHand = new Map(stockRows.map((s) => [s.itemId, s.quantity_on_hand] as const))

        // Aggregate per (itemId, reason) for the bag-balance check; multiple
        // lines with the same item but different reasons are all valid.
        const totalsPerItem = new Map<number, number>()
        for (const i of items) {
            totalsPerItem.set(i.itemId, (totalsPerItem.get(i.itemId) || 0) + i.quantity)
        }
        for (const [itemId, total] of totalsPerItem) {
            const have = onHand.get(itemId) || 0
            if (total > have) {
                throw new Error(`Cannot return ${total} of item ${itemId}; only ${have} on hand.`)
            }
        }

        const returnIds: number[] = []
        await prisma.$transaction(async (tx) => {
            for (const i of items) {
                const created = await tx.returnVerification.create({
                    data: {
                        dispatchId: null,
                        driverId,
                        itemId: i.itemId,
                        quantity: i.quantity,
                        reason: i.reason,
                        status: "PENDING",
                        notes: i.notes ?? undefined,
                    },
                })
                returnIds.push(created.id)
            }
            // Decrement bag totals once per item (could be multiple reasons per item).
            for (const [itemId, total] of totalsPerItem) {
                await tx.driverStock.updateMany({
                    where: { driverId, itemId },
                    data: { quantity_on_hand: { decrement: total } },
                })
            }
        })

        await writeAuditLog(
            session,
            "DRIVER_RETURN_SUBMIT",
            "Driver",
            driverId,
            null,
            { items },
            `Driver submitted ${returnIds.length} return line(s)`
        )

        notifyClients("return")
        revalidatePath("/driver")
        revalidatePath("/admin/returns")
        return { success: true, data: { returnIds } }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to submit return" }
    }
}

/**
 * Admin-side feed for the /admin/driver-stock page: every active driver
 * with their current bag, pending acks, and the latest disputed assignments
 * (so admins can resolve discrepancies). Tries to keep payloads small —
 * only PENDING_ACK and recent DISPUTED rows, not the full assignment history.
 */
export async function getDriversWithBagAndPending() {
    await requireAdmin()
    return await prisma.driver.findMany({
        where: { isActive: true },
        omit: { pin: true },
        include: {
            DriverStock: {
                where: { quantity_on_hand: { gt: 0 } },
                include: { item: true },
                orderBy: { item: { name: "asc" } },
            },
            StockAssignments: {
                where: { status: { in: ["PENDING_ACK", "DISPUTED"] } },
                include: { item: true },
                orderBy: { assigned_at: "desc" },
                take: 50,
            },
        },
        orderBy: { name: "asc" },
    })
}

/**
 * Reads the driver's bag (DriverStock) AND any pending acknowledgments. The
 * driver portal calls this in place of getActiveDispatches() once dispatchless
 * mode is on. Driver-only — admin views go through getDriversWithBagAndPending().
 */
export async function getDriverBag() {
    const session = await requireDriver()
    const role = (session.user as any).role
    if (role !== "driver") {
        return { driverId: null, bag: [], pendingAssignments: [] }
    }
    const driverId = parseInt((session.user as any).id, 10)

    const [bag, pendingAssignments] = await Promise.all([
        prisma.driverStock.findMany({
            where: { driverId, quantity_on_hand: { gt: 0 } },
            include: { item: true },
            orderBy: { item: { name: "asc" } },
        }),
        prisma.stockAssignment.findMany({
            where: { driverId, status: "PENDING_ACK" },
            include: { item: true },
            orderBy: { assigned_at: "desc" },
        }),
    ])

    return { driverId, bag, pendingAssignments }
}
