"use server"

import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { notifyClients } from "@/lib/notify"
import type { ActionResult } from "@/types"
import { auth } from "@/auth"
import { requireAdmin, requireDriver } from "@/lib/auth-utils"
import { writeAuditLog } from "@/lib/audit-utils"
import { sendPushToAdmins, sendPushToDriver } from "@/lib/push"

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
 * One-line summary of a push for the notification body. A lock screen truncates
 * hard, so name the first two items (which is the whole message for a typical
 * two-line push) and fall back to a count beyond that.
 */
function summariseAssignment(
    lines: { itemId: number; quantity: number }[],
    dbItems: { id: number; name: string }[]
): string {
    const units = lines.reduce((sum, l) => sum + l.quantity, 0)
    const named = lines
        .slice(0, 2)
        .map((l) => `${l.quantity} × ${dbItems.find((d) => d.id === l.itemId)?.name ?? "item"}`)
    const rest = lines.length - named.length
    const head = rest > 0 ? `${named.join(", ")} +${rest} more` : named.join(", ")
    return lines.length > 2 ? `${head} (${units} units total)` : head
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

        const lines = Array.from(merged, ([itemId, v]) => ({ itemId, quantity: v.quantity, notes: v.notes }))

        // Three set-based statements instead of three queries per item: large
        // pushes routed through the Supavisor pooler were exceeding Prisma's 5s
        // interactive-transaction window and dying mid-loop with "Transaction
        // not found". Round-trip count is now constant regardless of push size.
        let assignmentIds: number[] = []
        await prisma.$transaction(async (tx) => {
            // Decrement warehouse stock for every line at once. Each row keeps the
            // per-item gte guard (mirrors PO/dispatch behavior): a short row simply
            // doesn't match, drops out of RETURNING, and fails the count check below.
            const decremented = await tx.$queryRaw<{ itemId: number }[]>`
                UPDATE "WarehouseStock" AS ws
                SET quantity_on_hand = ws.quantity_on_hand - v.qty
                FROM (VALUES ${Prisma.join(lines.map((l) => Prisma.sql`(${l.itemId}::int, ${l.quantity}::int)`))}) AS v("itemId", qty)
                WHERE ws."warehouseId" = ${warehouseId}
                  AND ws."itemId" = v."itemId"
                  AND ws.quantity_on_hand >= v.qty
                RETURNING ws."itemId"
            `
            if (decremented.length !== lines.length) {
                const covered = new Set(decremented.map((r) => r.itemId))
                const short = lines
                    .filter((l) => !covered.has(l.itemId))
                    .map((l) => `${dbItems.find((d) => d.id === l.itemId)!.name} (need ${l.quantity})`)
                throw new Error(`Insufficient warehouse stock for: ${short.join(", ")}`)
            }

            // All audit rows in one INSERT; itemIds are unique after merging, so
            // ids map back to lines regardless of the order RETURNING uses.
            const created = await tx.stockAssignment.createManyAndReturn({
                data: lines.map((l) => ({
                    driverId,
                    itemId: l.itemId,
                    warehouseId,
                    quantity: l.quantity,
                    cost_at_assignment: dbItems.find((d) => d.id === l.itemId)!.cost,
                    notes: l.notes ?? undefined,
                    assigned_by: adminId,
                    status: "PENDING_ACK",
                })),
                select: { id: true, itemId: true },
            })
            const idByItem = new Map(created.map((r) => [r.itemId, r.id]))
            assignmentIds = lines.map((l) => idByItem.get(l.itemId)!)

            // Optimistic credit so the driver can refill immediately. If they
            // later dispute the count, denyAssignment() corrects this.
            // "updatedAt" is set manually because Prisma's @updatedAt is
            // client-side and doesn't apply to raw SQL.
            await tx.$executeRaw`
                INSERT INTO "DriverStock" ("driverId", "itemId", quantity_on_hand, "updatedAt")
                VALUES ${Prisma.join(lines.map((l) => Prisma.sql`(${driverId}::int, ${l.itemId}::int, ${l.quantity}::int, now())`))}
                ON CONFLICT ("driverId", "itemId") DO UPDATE
                SET quantity_on_hand = "DriverStock".quantity_on_hand + EXCLUDED.quantity_on_hand,
                    "updatedAt" = now()
            `
        }, { timeout: 15_000, maxWait: 5_000 })

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

        // The whole point of the notification feature: until now a driver only
        // discovered a push by happening to open the app. notifyClients() above
        // reaches browsers that already have the portal open — this reaches the
        // phone in their pocket. Never throws; a dead push service must not
        // fail an assignment whose stock has already moved.
        await sendPushToDriver(
            driverId,
            {
                title: "New stock assigned to you",
                body: `${summariseAssignment(lines, dbItems)} — open the app to confirm you received it.`,
                url: "/driver",
                // Per-driver collapse key: two pushes in a row replace one
                // another rather than stacking, so the lock screen shows the
                // latest state instead of a pile of near-identical alerts.
                tag: `assignment-${driverId}`,
                requireInteraction: true,
            },
            { urgency: "high" }
        )

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
 * Driver completely denies an assignment claim. Reverts the optimistic DriverStock 
 * credit and returns the items back to the originating Warehouse.
 */
export async function denyAssignment(
    assignmentId: number,
    notes?: string | null
): Promise<ActionResult> {
    const session = await auth()
    if (!session?.user) return { success: false, error: "Sign-in required." }
    const role = (session.user as any).role
    if (role !== "driver") return { success: false, error: "Only drivers can deny assignments." }
    const driverId = parseInt((session.user as any).id, 10)
    if (!Number.isFinite(driverId)) return { success: false, error: "Invalid session." }

    try {
        const assignment = await prisma.stockAssignment.findUnique({
            where: { id: assignmentId },
            // `select` rather than `include`, so the driver relation can't drag
            // the PIN hash in behind a future schema change.
            include: {
                item: { select: { name: true } },
                driver: { select: { name: true } },
            },
        })
        if (!assignment) return { success: false, error: "Assignment not found." }
        if (assignment.driverId !== driverId) return { success: false, error: "Not your assignment." }
        if (assignment.status !== "PENDING_ACK") {
            return { success: false, error: `Assignment is already ${assignment.status.toLowerCase()}.` }
        }

        await prisma.$transaction(async (tx) => {
            // Correct the optimistic credit. Ensure they haven't already spent it.
            const updated = await tx.driverStock.updateMany({
                where: { 
                    driverId, 
                    itemId: assignment.itemId,
                    quantity_on_hand: { gte: assignment.quantity }
                },
                data: { quantity_on_hand: { decrement: assignment.quantity } },
            })

            if (updated.count === 0) {
                throw new Error("Cannot deny assignment: stock has already been consumed.")
            }

            // Return items back to the warehouse if it originated from one
            if (assignment.warehouseId) {
                await tx.warehouseStock.updateMany({
                    where: { warehouseId: assignment.warehouseId, itemId: assignment.itemId },
                    data: { quantity_on_hand: { increment: assignment.quantity } }
                })
            }

            await tx.stockAssignment.update({
                where: { id: assignmentId },
                data: {
                    status: "DISPUTED",
                    acknowledged_at: new Date(),
                    acknowledged_qty: 0,
                    notes: notes ?? "Driver completely denied receiving these items.",
                },
            })
        })

        await writeAuditLog(
            session,
            "DENY_ASSIGNMENT",
            "StockAssignment",
            assignmentId,
            { quantity: assignment.quantity },
            { notes: notes ?? null },
            "Driver denied the assignment, stock reverted to warehouse."
        )

        notifyClients("assignment-dispute")
        revalidatePath("/driver")
        revalidatePath("/admin/driver-stock")
        revalidatePath("/admin/warehouse")

        // Disputes are the slow half of this workflow: the stock has already
        // reverted to the warehouse, but nobody knows to go and ask the driver
        // what happened until an admin next opens /admin/driver-stock. Alerting
        // ops directly is what turns a week-long dispute into a same-day one.
        await sendPushToAdmins(
            {
                title: "Delivery disputed",
                body: `${assignment.driver.name} denied receiving ${assignment.quantity} × ${assignment.item.name}. Stock returned to the warehouse.`,
                url: "/admin/driver-stock",
                // Per-driver, not per-assignment: five disputes from one driver
                // in one morning are one conversation, not five notifications.
                tag: `dispute-${driverId}`,
                requireInteraction: true,
            },
            { urgency: "high" }
        )

        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to deny assignment" }
    }
}

/**
 * Admin action to dismiss a completely denied/disputed assignment from the
 * driver's pending history, hiding the notification.
 */
export async function dismissAssignment(assignmentId: number): Promise<ActionResult> {
    const session = await requireAdmin()
    try {
        const assignment = await prisma.stockAssignment.findUnique({ where: { id: assignmentId } })
        if (!assignment) return { success: false, error: "Assignment not found." }

        // We can just delete it, or mark it as "DISMISSED"
        // Since there is no "DISMISSED" status explicitly used anywhere else except to hide it,
        // deleting it keeps the database clean since the items have already been reverted.
        await prisma.stockAssignment.delete({ where: { id: assignmentId } })

        await writeAuditLog(
            session,
            "DISMISS_ASSIGNMENT",
            "StockAssignment",
            assignmentId,
            { status: assignment.status },
            { status: "DELETED" },
            "Admin dismissed the denied/disputed assignment notification."
        )

        notifyClients("assignment-dismissed")
        revalidatePath("/admin/driver-stock")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to dismiss assignment" }
    }
}

/**
 * Bulk-dismiss every DISPUTED assignment for a single driver in one action.
 * Disputed assignments already had their stock reverted to the warehouse (see
 * disputeAssignment), so this only clears the lingering notifications — it is
 * non-destructive to inventory. Deletes the rows and writes one aggregate audit
 * entry listing exactly which assignments were dismissed.
 */
export async function dismissAllDisputes(driverId: number): Promise<ActionResult<{ dismissed: number }>> {
    const session = await requireAdmin()
    try {
        const disputed = await prisma.stockAssignment.findMany({
            where: { driverId, status: "DISPUTED" },
            select: { id: true, itemId: true, quantity: true },
        })
        if (disputed.length === 0) return { success: true, data: { dismissed: 0 } }

        const ids = disputed.map((a) => a.id)
        // Delete by the exact ids we read, so a dispute that arrives between the
        // read and the delete is not silently swept away.
        await prisma.stockAssignment.deleteMany({ where: { id: { in: ids } } })

        await writeAuditLog(
            session,
            "DISMISS_ALL_DISPUTES",
            "StockAssignment",
            driverId,
            { dismissedAssignments: disputed },
            { status: "DELETED", count: disputed.length },
            `Admin bulk-dismissed ${disputed.length} disputed assignment(s) for driver ${driverId}.`
        )

        notifyClients("assignment-dismissed")
        revalidatePath("/admin/driver-stock")
        return { success: true, data: { dismissed: disputed.length } }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to clear disputes" }
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

        // Two set-based statements instead of one query per line: same pooler
        // latency math as assignToDriver — per-item loops inside $transaction
        // exceed the 5s interactive-tx window on large returns (P2028).
        let returnIds: number[] = []
        const decrements = Array.from(totalsPerItem, ([itemId, total]) => ({ itemId, total }))
        await prisma.$transaction(async (tx) => {
            const created = await tx.returnVerification.createManyAndReturn({
                data: items.map((i) => ({
                    dispatchId: null,
                    driverId,
                    itemId: i.itemId,
                    quantity: i.quantity,
                    reason: i.reason,
                    status: "PENDING",
                    notes: i.notes ?? undefined,
                })),
                select: { id: true },
            })
            returnIds = created.map((r) => r.id)

            // One guarded decrement per bag: a short row (concurrent spend since
            // the pre-check above) fails the gte guard, drops out of RETURNING,
            // and rolls the whole return back.
            const decremented = await tx.$queryRaw<{ itemId: number }[]>`
                UPDATE "DriverStock" AS ds
                SET quantity_on_hand = ds.quantity_on_hand - v.qty,
                    "updatedAt" = now()
                FROM (VALUES ${Prisma.join(decrements.map((d) => Prisma.sql`(${d.itemId}::int, ${d.total}::int)`))}) AS v("itemId", qty)
                WHERE ds."driverId" = ${driverId}
                  AND ds."itemId" = v."itemId"
                  AND ds.quantity_on_hand >= v.qty
                RETURNING ds."itemId"
            `
            if (decremented.length !== decrements.length) {
                const covered = new Set(decremented.map((r) => r.itemId))
                const short = decrements.filter((d) => !covered.has(d.itemId)).map((d) => d.itemId)
                throw new Error(`Insufficient stock for item(s) ${short.join(", ")} or concurrent update detected.`)
            }
        }, { timeout: 15_000, maxWait: 5_000 })

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
 * with their current bag, ALL open assignments (PENDING_ACK / DISPUTED),
 * a window of recent acknowledged history, and recent refills.
 *
 * Open rows are fetched separately and unbounded: they are a work queue the
 * admin drains, not history. Folding them into the newest-100 slice let old
 * unresolved disputes fall out of the window as new pushes arrived, so the
 * sidebar badge (a global count) showed issues the page could not display.
 */
export async function getDriversWithBagAndPending() {
    await requireAdmin()
    const [drivers, openAssignments] = await Promise.all([
        prisma.driver.findMany({
            where: { isActive: true },
            omit: { pin: true },
            include: {
                DriverStock: {
                    where: { quantity_on_hand: { gt: 0 } },
                    include: { item: true },
                    orderBy: { item: { name: "asc" } },
                },
                StockAssignments: {
                    where: { status: "ACKNOWLEDGED" },
                    include: { item: true },
                    orderBy: { assigned_at: "desc" },
                    take: 100,
                },
                RefillLogs: {
                    include: { item: true, machine: true },
                    orderBy: { refilled_at: "desc" },
                    take: 20,
                },
            },
            orderBy: { name: "asc" },
        }),
        prisma.stockAssignment.findMany({
            where: { status: { in: ["PENDING_ACK", "DISPUTED"] }, driver: { isActive: true } },
            include: { item: true },
            orderBy: { assigned_at: "desc" },
        }),
    ])

    const openByDriver = new Map<number, typeof openAssignments>()
    for (const a of openAssignments) {
        const list = openByDriver.get(a.driverId)
        if (list) list.push(a)
        else openByDriver.set(a.driverId, [a])
    }

    // Component consumers filter by status, so open rows and acknowledged
    // history can share the one relation array.
    return drivers.map((d) => ({
        ...d,
        StockAssignments: [...(openByDriver.get(d.id) ?? []), ...d.StockAssignments],
    }))
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
