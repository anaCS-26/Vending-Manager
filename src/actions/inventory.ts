"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { notifyClients } from "@/lib/notify"
import type { ActionResult, PaginatedResult, DispatchWithRelations } from "@/types"
import { join } from "path"
import { writeFile, mkdir } from "fs/promises"
import fs from "fs"
import { put } from '@vercel/blob';
import bcrypt from "bcryptjs";
import { requireAdmin, requireSuperAdmin, requireDriver, requireAdminOrDriverOwner } from "@/lib/auth-utils";
import { writeAuditLog } from "@/lib/audit-utils";
import { computeWeightedCost } from "@/lib/wac-math";

/**
 * ============================================================================
 * WAREHOUSE & INVENTORY VIEW ACTIONS
 * Fetches stock levels and item lists for administrative dashboards.
 * ============================================================================
 */
/** 
 * Fetches comprehensive warehouse stock metrics. 
 * Includes item metadata and warehouse localization for the Admin Inventory Dashboard. 
 */
export async function getWarehouseInventory() {
    await requireAdmin();
    return await prisma.warehouseStock.findMany({
        where: { warehouse: { isActive: true }, item: { isActive: true } },
        include: { item: true, warehouse: true },
        orderBy: { item: { name: 'asc' } }
    })
}

/** 
 * Retrieves system-wide machine inventory records. 
 * Grouped by location then item name to assist in spatial route auditing. 
 */
export async function getMachineInventory() {
    await requireAdmin();
    return await prisma.machineStock.findMany({
        where: { machine: { isActive: true }, item: { isActive: true } },
        include: { item: true, machine: true },
        orderBy: [
            { machine: { location_name: 'asc' } },
            { item: { name: 'asc' } }
        ]
    })
}

/** Extracts granular stock levels for a specific machine, typically for detail-view modals. */
export async function getMachineInventoryDetails(machineId: number) {
    return await prisma.machineStock.findMany({
        where: { machineId },
        include: { item: true }
    })
}

/** Fetches the master list of all active products in the system catalog. */
export async function getItems() {
    await requireDriver();
    return await prisma.item.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
    })
}

function getRefillRouteReturnQty(log: { expired_quantity?: number | null, damaged_quantity?: number | null }) {
    return (log.expired_quantity || 0) + (log.damaged_quantity || 0);
}

function assertWholeNonNegative(value: number, label: string) {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        throw new Error(`${label} must be a whole number >= 0`)
    }
}

/**
 * ============================================================================
 * DISPATCH & LOGISTICS ACTIONS
 * Handles assignment of stock from warehouses to driver bags.
 * ============================================================================
 */
/** Lists all active drivers along with their real-time hand-stock (back-stock) levels. */
export async function getDrivers() {
    await requireAdmin();
    return await prisma.driver.findMany({
        omit: { pin: true },
        include: { DriverStock: { include: { item: true } } },
        orderBy: { name: 'asc' }
    })
}

/** Returns all dispatches currently in transit or awaiting completion. */
export async function getActiveDispatches() {
    await requireDriver();
    return await prisma.dispatch.findMany({
        where: { status: "OPEN" },
        include: {
            driver: {
                include: { DriverStock: { include: { item: true } } }
            },
            DispatchItems: { include: { item: true } },
            RefillLogs: { include: { machine: true } }
        }
    })
}

/** Retrieves the historical archive of completed dispatches, primarily for reconciliation audits. */
export async function getClosedDispatches() {
    await requireAdmin();
    return await prisma.dispatch.findMany({
        where: { status: "CLOSED" },
        orderBy: { dispatch_date: 'desc' },
        include: {
            driver: true,
            DispatchItems: { include: { item: true } },
            RefillLogs: { include: { machine: true } }
        }
    })
}

/** 
 * High-performance paginated access to the dispatch archive. 
 * Supports server-side search by driver/item and anomaly filtering for audit flags. 
 */
export async function getClosedDispatchesPaginated(
    page: number = 1,
    pageSize: number = 10,
    filter?: "ALL" | "ISSUES" | "MATCHES",
    searchQuery?: string
): Promise<PaginatedResult<DispatchWithRelations>> {
    await requireAdmin();
    // 1. Build the database-side where clause
    const where: any = { status: "CLOSED" }

    if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase()
        where.OR = [
            { driver: { name: { contains: searchQuery, mode: 'insensitive' } } },
            { DispatchItems: { some: { item: { name: { contains: searchQuery, mode: 'insensitive' } } } } }
        ]

        // Handle numeric ID search if possible
        const numericId = parseInt(searchQuery)
        if (!isNaN(numericId)) {
            where.OR.push({ id: numericId })
        }
    }

    // 2. Fetch data from DB
    // Optimization: If we have a lot of data, we should move the 'anomaly' flag to a column.
    // Since this is a prototype, we fetch enough for filtering.
    const allDispatches = await prisma.dispatch.findMany({
        where,
        orderBy: { dispatch_date: 'desc' },
        include: {
            driver: true,
            DispatchItems: { include: { item: true } },
            RefillLogs: { include: { machine: true } }
        }
    })

    // 3. Post-fetch filtering: Logic for 'anomaly' detection (Variance between Issued vs Accounted)
    let filtered = allDispatches

    if (filter && filter !== "ALL") {
        filtered = filtered.filter(d => {
            const totalGiven = d.DispatchItems.reduce((acc, curr) => acc + curr.quantity_given, 0)
            const totalReturned = d.DispatchItems.reduce((acc, curr) => acc + curr.quantity_returned, 0)
            const totalRefilled = d.RefillLogs.reduce((acc, curr) => acc + curr.quantity_refilled, 0)
            const totalRouteReturned = d.RefillLogs.reduce((acc, curr: any) => acc + getRefillRouteReturnQty(curr), 0)
            const hasAnomaly = (totalGiven - (totalRefilled + totalReturned + totalRouteReturned)) !== 0

            if (filter === "ISSUES") return hasAnomaly
            if (filter === "MATCHES") return !hasAnomaly
            return true
        })
    }

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const start = (safePage - 1) * pageSize
    const data = filtered.slice(start, start + pageSize)

    return {
        data,
        total,
        page: safePage,
        pageSize,
        totalPages
    }
}

/**
 * Initializes a new logistical dispatch. 
 * Deducts stock first from the Driver's existing back-stock (DriverStock) 
 * before drawing from the primary Warehouse to ensure accurate inventory aging.
 */
export async function dispatchToDriver(
    driverId: number,
    warehouseId: number,
    items: { itemId: number, quantity: number }[]
): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        let createdDispatchId: number | null = null;
        await prisma.$transaction(async (tx) => {
            if (!items.length) {
                throw new Error("Dispatch must include at least one item")
            }

            // Normalize/merge duplicate lines and reject invalid quantities.
            const merged = new Map<number, number>()
            for (const item of items) {
                assertWholeNonNegative(item.quantity, `Dispatch quantity for item ${item.itemId}`)
                if (item.quantity === 0) continue
                merged.set(item.itemId, (merged.get(item.itemId) || 0) + item.quantity)
            }
            const normalizedItems = [...merged.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))
            if (!normalizedItems.length) {
                throw new Error("Dispatch must include at least one quantity > 0")
            }

            // Fetch current item prices to lock them into the dispatch
            const itemIds = normalizedItems.map(i => i.itemId)
            const dbItems = await tx.item.findMany({
                where: { id: { in: itemIds } }
            })
            if (dbItems.length !== itemIds.length) {
                throw new Error("One or more dispatch items are invalid")
            }

            const createdDispatch = await tx.dispatch.create({
                data: {
                    driverId,
                    warehouseId,
                    DispatchItems: {
                        create: normalizedItems.map(i => {
                            const matchedItem = dbItems.find(dbI => dbI.id === i.itemId)
                            return {
                                itemId: i.itemId,
                                quantity_given: i.quantity,
                                price_at_dispatch: matchedItem?.price_standard || 0.0
                            }
                        })
                    }
                }
            })
            createdDispatchId = createdDispatch.id;

            // Deduct stock: 1. Try Driver's existing bag (DriverStock), 2. Take remainder from Warehouse.
            for (const item of normalizedItems) {
                // 1. Check DriverStock first
                const driverStock = await (tx as any).driverStock.findUnique({
                    where: { driverId_itemId: { driverId, itemId: item.itemId } }
                });

                let qtyToTakeFromWarehouse = item.quantity;

                if (driverStock && driverStock.quantity_on_hand > 0) {
                    const takeFromDriver = Math.min(driverStock.quantity_on_hand, item.quantity);
                    await (tx as any).driverStock.update({
                        where: { id: driverStock.id },
                        data: { quantity_on_hand: { decrement: takeFromDriver } }
                    });
                    qtyToTakeFromWarehouse -= takeFromDriver;
                }

                // 2. Take remainder from Warehouse
                if (qtyToTakeFromWarehouse > 0) {
                    const updated = await tx.warehouseStock.updateMany({
                        where: {
                            itemId: item.itemId,
                            warehouseId,
                            quantity_on_hand: { gte: qtyToTakeFromWarehouse }
                        },
                        data: { quantity_on_hand: { decrement: qtyToTakeFromWarehouse } }
                    })
                    if (updated.count === 0) {
                        throw new Error(`Insufficient stock for item ${item.itemId} at selected warehouse. Missing: ${qtyToTakeFromWarehouse}`)
                    }
                }
            }
        })

        revalidatePath('/admin')
        revalidatePath('/driver')
        notifyClients('dispatch')
        
        await writeAuditLog(session, 'CREATE_DISPATCH', 'Dispatch', createdDispatchId, null, { driverId, warehouseId, items });
        
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to dispatch items"
        return { success: false, error: message }
    }
}

/**
 * ============================================================================
 * MACHINE REFILL ACTIONS
 * Logic for drivers filling machines from their active dispatch stock.
 * ============================================================================
 */
/** Fetches active machine list for driver selection. */
export async function getMachines() {
    await requireDriver();
    return await prisma.machine.findMany({
        include: { Stock: { include: { item: true } } },
        orderBy: { id: 'asc' }
    })
}

/**
 * Transactions a single machine refill. 
 * Synchronizes MachineStock, tracks route returns/damages, and decrements dispatch allocation.
 */
export async function logRefill(
    dispatchId: number,
    machineId: number,
    itemId: number,
    quantity_refilled: number,
    quantity_before: number = 0,
    damaged: number = 0,
    returned: number = 0
): Promise<ActionResult> {
    try {
        const dispatchAuthCheck = await prisma.dispatch.findUnique({ where: { id: dispatchId }, select: { driverId: true } });
        if (!dispatchAuthCheck) return { success: false, error: "Dispatch not found" };
        const session = await requireAdminOrDriverOwner(dispatchAuthCheck.driverId);

        let createdRefillId: number | null = null;
        await prisma.$transaction(async (tx) => {
            assertWholeNonNegative(quantity_refilled, "Refilled quantity")
            assertWholeNonNegative(returned, "Returned quantity")

            const dispatch = await tx.dispatch.findUnique({
                where: { id: dispatchId },
                include: { DispatchItems: true }
            })
            if (!dispatch) throw new Error("Dispatch not found")
            if (dispatch.status !== "OPEN") throw new Error("Dispatch is already closed")

            const dispatchItem = dispatch.DispatchItems.find(di => di.itemId === itemId)
            const driverStock = await tx.driverStock.findUnique({
                where: { driverId_itemId: { driverId: dispatch.driverId, itemId: itemId } }
            })
            const totalGiven = (dispatchItem?.quantity_given || 0) + (driverStock?.quantity_on_hand || 0)
            
            if (totalGiven === 0 && quantity_refilled > 0) throw new Error("Item is not assigned to this driver")

            const refillAgg = await tx.refillLog.aggregate({
                where: { dispatchId, itemId },
                _sum: {
                    quantity_refilled: true,
                    expired_quantity: true,
                    damaged_quantity: true
                }
            })
            const alreadyConsumed = (refillAgg._sum.quantity_refilled || 0)
            const remaining = Math.max(0, totalGiven - alreadyConsumed)
            const currentlyConsuming = quantity_refilled
            if (currentlyConsuming > remaining) {
                throw new Error(`Not enough remaining dispatch stock for item ${itemId}. Remaining: ${remaining}, attempted: ${currentlyConsuming}`)
            }

            const itemData = await tx.item.findUnique({ where: { id: itemId } });
            const machineData = await tx.machine.findUnique({ where: { id: machineId } });

            let priceToUse = itemData?.price_standard || 0;
            if (machineData?.tier === 'HOSPITAL') priceToUse = itemData?.price_hospital || 0;
            else if (machineData?.tier === 'HOTEL') priceToUse = itemData?.price_hotel || 0;

            // Keep financial continuity: refilled is treated as sold proxy in this prototype.
            const sales = quantity_refilled;

            // PREVIOUS RESTOCK LOCK-IN: Calculate revenue using the price that was set during the LAST restock.
            const previousLog = await tx.refillLog.findFirst({
                where: { machineId, itemId },
                orderBy: { refilled_at: 'desc' },
                select: { price_at_refill: true }
            });
            const historicPrice = previousLog ? previousLog.price_at_refill : priceToUse;
            const sales_revenue = sales * historicPrice;

            // 2. Create the refill log
            const refill = await tx.refillLog.create({
                data: {
                    dispatchId,
                    machineId,
                    itemId,
                    quantity_refilled,
                    items_sold_since_last_refill: sales,
                    sales_revenue: sales_revenue,
                    price_at_refill: priceToUse,
                    cost_at_refill: (itemData as any)?.cost || 0,
                    damaged_quantity: damaged,
                    // Reusing expired_quantity as route-returned quantity for compatibility.
                    expired_quantity: returned
                } as any
            })
            createdRefillId = refill.id;

            // 3. Update or Create MachineStock
            await tx.machineStock.upsert({
                where: { machineId_itemId: { machineId, itemId } },
                update: {
                    estimated_stock: { increment: quantity_refilled - returned },
                    last_refilled_at: new Date()
                },
                create: {
                    machineId,
                    itemId,
                    estimated_stock: Math.max(0, quantity_refilled - returned),
                    last_refilled_at: new Date()
                }
            });

            // 4. Record damaged/returned items for Admin verification
            if (damaged > 0) {
                await tx.returnVerification.create({
                    data: { dispatchId, machineId, itemId, quantity: damaged, reason: "DAMAGED", status: "PENDING" }
                });
            }

            if (returned > 0) {
                await tx.returnVerification.create({
                    data: { dispatchId, machineId, itemId, quantity: returned, reason: "RETURNED", status: "PENDING" }
                });
            }
        })

        revalidatePath('/driver')
        revalidatePath('/admin')
        revalidatePath('/admin/machine-stock')
        notifyClients('refill')
        
        await writeAuditLog(session, 'LOG_REFILL', 'RefillLog', createdRefillId, null, { dispatchId, machineId, itemId, quantity_refilled, damaged, returned});
        
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to log refill"
        return { success: false, error: message }
    }
}

/**
 * Atomic batch processing for machine refills. 
 * Optimized for low-latency mobile updates in the driver-portal interface.
 */
export async function logBatchRefills(
    dispatchId: number | null,
    machineId: number,
    items: { itemId: number, refilled: number, returned: number, bag_returned?: number }[]
): Promise<ActionResult> {
    try {
        // Dispatchless path: no Dispatch wrapper, source bag from DriverStock,
        // decrement directly on each refill. Driver-only — admins shadowing the
        // portal still go through the dispatch flow above.
        if (dispatchId === null) {
            return await logBatchRefillsDispatchless(machineId, items);
        }

        const dispatchAuthCheck = await prisma.dispatch.findUnique({ where: { id: dispatchId }, select: { driverId: true } });
        if (!dispatchAuthCheck) return { success: false, error: "Dispatch not found" };
        const session = await requireAdminOrDriverOwner(dispatchAuthCheck.driverId);

        await prisma.$transaction(async (tx) => {
            const dispatch = await tx.dispatch.findUnique({
                where: { id: dispatchId },
                include: { DispatchItems: true }
            })
            if (!dispatch) throw new Error("Dispatch not found")
            if (dispatch.status !== "OPEN") throw new Error("Dispatch is already closed")

            const machineData = await tx.machine.findUnique({ where: { id: machineId } });

            for (const item of items) {
                assertWholeNonNegative(item.refilled, `Refilled quantity for item ${item.itemId}`)
                assertWholeNonNegative(item.returned, `Returned quantity for item ${item.itemId}`)
                const bagReturned = item.bag_returned || 0;
                assertWholeNonNegative(bagReturned, `Bag Returned quantity for item ${item.itemId}`)

                if (item.refilled === 0 && item.returned === 0 && bagReturned === 0) continue;

                const dispatchItem = dispatch.DispatchItems.find(di => di.itemId === item.itemId)
                const driverStock = await tx.driverStock.findUnique({
                    where: { driverId_itemId: { driverId: dispatch.driverId, itemId: item.itemId } }
                })
                const totalGiven = (dispatchItem?.quantity_given || 0) + (driverStock?.quantity_on_hand || 0)

                if (totalGiven === 0 && item.refilled > 0) {
                    throw new Error(`Item ${item.itemId} is not assigned to this driver`)
                }

                const refillAgg = await tx.refillLog.aggregate({
                    where: { dispatchId, itemId: item.itemId },
                    _sum: {
                        quantity_refilled: true,
                        expired_quantity: true,
                        damaged_quantity: true
                    }
                })
                const alreadyConsumed = (refillAgg._sum.quantity_refilled || 0)
                const remaining = Math.max(0, totalGiven - alreadyConsumed)
                const currentlyConsuming = item.refilled
                if (currentlyConsuming > remaining) {
                    throw new Error(`Not enough remaining dispatch stock for item ${item.itemId}. Remaining: ${remaining}, attempted: ${currentlyConsuming}`)
                }

                const itemData = await tx.item.findUnique({ where: { id: item.itemId } });

                let priceToUse = itemData?.price_standard || 0;
                if (machineData?.tier === 'HOSPITAL') priceToUse = itemData?.price_hospital || 0;
                else if (machineData?.tier === 'HOTEL') priceToUse = itemData?.price_hotel || 0;

                // Keep financial continuity: refilled is treated as sold proxy in this prototype.
                const sales = item.refilled;

                // PREVIOUS RESTOCK LOCK-IN
                const previousLog = await tx.refillLog.findFirst({
                    where: { machineId, itemId: item.itemId },
                    orderBy: { refilled_at: 'desc' },
                    select: { price_at_refill: true }
                });
                const historicPrice = previousLog ? previousLog.price_at_refill : priceToUse;
                const sales_revenue = sales * historicPrice;

                await tx.refillLog.create({
                    data: {
                        dispatchId,
                        machineId,
                        itemId: item.itemId,
                        quantity_refilled: item.refilled,
                        items_sold_since_last_refill: sales,
                        sales_revenue: sales_revenue,
                        price_at_refill: priceToUse,
                        cost_at_refill: (itemData as any)?.cost || 0,
                        damaged_quantity: 0,
                        // Reusing expired_quantity as route-returned quantity for compatibility.
                        expired_quantity: item.returned
                    } as any
                });

                await tx.machineStock.upsert({
                    where: { machineId_itemId: { machineId, itemId: item.itemId } },
                    update: {
                        estimated_stock: { increment: item.refilled - item.returned },
                        last_refilled_at: new Date()
                    },
                    create: {
                        machineId,
                        itemId: item.itemId,
                        estimated_stock: Math.max(0, item.refilled - item.returned),
                        last_refilled_at: new Date()
                    }
                });

                if (item.returned > 0) {
                    await tx.returnVerification.create({
                        data: { dispatchId, machineId, itemId: item.itemId, quantity: item.returned, reason: "RETURNED", status: "PENDING" }
                    });
                }
            }
        });

        revalidatePath('/driver')
        revalidatePath('/admin')
        revalidatePath('/admin/machine-stock')
        notifyClients('refill')
        
        await writeAuditLog(session, 'LOG_BATCH_REFILL', 'Dispatch', dispatchId, null, { machineId, items });

        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to log batch refill"
        return { success: false, error: message }
    }
}

/**
 * Dispatchless variant of logBatchRefills. Same machine-side effects as the
 * legacy path (RefillLog + MachineStock + ReturnVerification), but the driver's
 * bag is sourced from DriverStock and decremented directly on each refill —
 * since there's no dispatch close to reconcile through.
 *
 * Always called via logBatchRefills(null, ...) so the client doesn't have to
 * know which transport it's using.
 */
async function logBatchRefillsDispatchless(
    machineId: number,
    items: { itemId: number, refilled: number, returned: number, bag_returned?: number }[]
): Promise<ActionResult> {
    const session = await requireDriver();
    const role = (session.user as any).role;
    if (role !== 'driver') {
        return { success: false, error: "Dispatchless refills are driver-only. Admins should use the dispatch flow." };
    }
    const driverId = parseInt((session.user as any).id, 10);
    if (!Number.isFinite(driverId)) return { success: false, error: "Invalid session." };

    try {
        await prisma.$transaction(async (tx) => {
            const machineData = await tx.machine.findUnique({ where: { id: machineId } });

            for (const item of items) {
                assertWholeNonNegative(item.refilled, `Refilled quantity for item ${item.itemId}`);
                assertWholeNonNegative(item.returned, `Returned quantity for item ${item.itemId}`);
                const bagReturned = item.bag_returned || 0;
                assertWholeNonNegative(bagReturned, `Bag Returned quantity for item ${item.itemId}`);
                if (item.refilled === 0 && item.returned === 0 && bagReturned === 0) continue;

                // Source bag inventory from DriverStock alone — no DispatchItem wrapper.
                const driverStock = await tx.driverStock.findUnique({
                    where: { driverId_itemId: { driverId, itemId: item.itemId } },
                });
                const onHand = driverStock?.quantity_on_hand || 0;

                if (item.refilled + bagReturned > onHand) {
                    throw new Error(
                        `Not enough in driver bag for item ${item.itemId}. On hand: ${onHand}, attempted refill+return: ${item.refilled + bagReturned}`
                    );
                }

                const itemData = await tx.item.findUnique({ where: { id: item.itemId } });
                let priceToUse = itemData?.price_standard || 0;
                if (machineData?.tier === 'HOSPITAL') priceToUse = itemData?.price_hospital || 0;
                else if (machineData?.tier === 'HOTEL') priceToUse = itemData?.price_hotel || 0;

                const sales = item.refilled;

                // PREVIOUS RESTOCK LOCK-IN — same convention as the legacy path so
                // sales_revenue stays comparable across both flows.
                const previousLog = await tx.refillLog.findFirst({
                    where: { machineId, itemId: item.itemId },
                    orderBy: { refilled_at: 'desc' },
                    select: { price_at_refill: true },
                });
                const historicPrice = previousLog ? previousLog.price_at_refill : priceToUse;
                const sales_revenue = sales * historicPrice;

                // Only create a RefillLog if there was actual machine interaction
                if (item.refilled > 0 || item.returned > 0) {
                    await tx.refillLog.create({
                        data: {
                            dispatchId: null,
                            driverId,
                            machineId,
                            itemId: item.itemId,
                            quantity_refilled: item.refilled,
                            items_sold_since_last_refill: sales,
                            sales_revenue,
                            price_at_refill: priceToUse,
                            cost_at_refill: itemData?.cost || 0,
                            damaged_quantity: 0,
                            // Reuse expired_quantity as route-returned for compat with legacy reports.
                            expired_quantity: item.returned,
                        } as any,
                    });
                }

                // Decrement bag immediately for both refilled AND items returned to warehouse
                if (item.refilled + bagReturned > 0) {
                    const updatedStock = await tx.driverStock.updateMany({
                        where: { driverId, itemId: item.itemId, quantity_on_hand: { gte: item.refilled + bagReturned } },
                        data: { quantity_on_hand: { decrement: item.refilled + bagReturned } },
                    });
                    
                    if (updatedStock.count === 0) {
                        throw new Error(`Insufficient driver stock for item ${item.itemId} during refill or concurrent update detected.`);
                    }
                }

                await tx.machineStock.upsert({
                    where: { machineId_itemId: { machineId, itemId: item.itemId } },
                    update: {
                        estimated_stock: { increment: item.refilled - item.returned },
                        last_refilled_at: new Date(),
                    },
                    create: {
                        machineId,
                        itemId: item.itemId,
                        estimated_stock: Math.max(0, item.refilled - item.returned),
                        last_refilled_at: new Date(),
                    },
                });

                if (item.returned > 0) {
                    // Returned items came out of the machine, not the bag — they go
                    // straight into the verification queue with driverId so admins
                    // can track who pulled them.
                    await tx.returnVerification.create({
                        data: {
                            dispatchId: null,
                            driverId,
                            machineId,
                            itemId: item.itemId,
                            quantity: item.returned,
                            reason: "RETURNED",
                            status: "PENDING",
                        },
                    });
                }
                
                if (bagReturned > 0) {
                    await tx.returnVerification.create({
                        data: {
                            dispatchId: null,
                            driverId,
                            itemId: item.itemId,
                            quantity: bagReturned,
                            reason: "SURPLUS",
                            status: "PENDING",
                        },
                    });
                }
            }
        });

        revalidatePath('/driver');
        revalidatePath('/admin');
        revalidatePath('/admin/machine-stock');
        notifyClients('refill');

        await writeAuditLog(session, 'LOG_BATCH_REFILL', 'Driver', driverId, null, { machineId, items, dispatchless: true });

        return { success: true, data: undefined };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to log batch refill";
        return { success: false, error: message };
    }
}

/**
 * ============================================================================
 * DISPATCH CLOSURE & RETURNS
 * Finalizes routes, reconciles stock, and handles damaged item verification.
 * ============================================================================
 */
/** 
 * Finalizes and reconciles a dispatch route. 
 * Re-integrates surplus stock into DriverStock or Warehouse and flags damages for manual verification.
 */
export async function returnDispatch(
    dispatchId: number,
    returns: { dispatchItemId: number, quantity_returned: number, quantity_damaged: number }[]
): Promise<ActionResult> {
    try {
        const dispatchAuthCheck = await prisma.dispatch.findUnique({ where: { id: dispatchId }, select: { driverId: true } });
        if (!dispatchAuthCheck) return { success: false, error: "Dispatch not found" };
        const session = await requireAdminOrDriverOwner(dispatchAuthCheck.driverId);

        await prisma.$transaction(async (tx) => {
            const dispatch = await tx.dispatch.findUnique({
                where: { id: dispatchId },
                include: { DispatchItems: true }
            })
            if (!dispatch) throw new Error("Dispatch not found")
            if (dispatch.status !== "OPEN") throw new Error("Dispatch is already closed")

            await Promise.all(returns.map(async (ret) => {
                if (ret.quantity_returned < 0 || ret.quantity_damaged < 0) {
                    throw new Error("Quantities cannot be negative")
                }

                const existingDispatchItem = dispatch.DispatchItems.find(di => di.id === ret.dispatchItemId)
                if (!existingDispatchItem) {
                    throw new Error(`Dispatch item ${ret.dispatchItemId} does not belong to dispatch ${dispatchId}`)
                }

                const refillAgg = await tx.refillLog.aggregate({
                    where: { dispatchId, itemId: existingDispatchItem.itemId },
                    _sum: {
                        quantity_refilled: true,
                        expired_quantity: true,
                        damaged_quantity: true
                    }
                })
                const usedInRoute =
                    (refillAgg._sum.quantity_refilled || 0) +
                    (refillAgg._sum.expired_quantity || 0) +
                    (refillAgg._sum.damaged_quantity || 0)
                const maxReturnable = Math.max(0, existingDispatchItem.quantity_given - usedInRoute)
                if ((ret.quantity_returned + ret.quantity_damaged) > maxReturnable) {
                    throw new Error(`Return quantities exceed remaining dispatch stock for item ${existingDispatchItem.itemId}`)
                }

                const dispatchItem = await tx.dispatchItem.update({
                    where: { id: ret.dispatchItemId },
                    data: {
                        quantity_returned: ret.quantity_returned,
                        quantity_damaged: ret.quantity_damaged
                    } as any
                })

                if (!dispatch || !dispatch.warehouseId) return;

                const warehouseStock = await tx.warehouseStock.findFirst({
                    where: { itemId: dispatchItem.itemId, warehouseId: dispatch.warehouseId }
                })

                if (warehouseStock) {
                    await tx.warehouseStock.update({
                        where: { id: warehouseStock.id },
                        data: { quantity_on_hand: { increment: ret.quantity_returned } }
                    })
                }
            }));

            // Closing Flow: Unaccounted items are 'injected' into DriverStock for their next shift.
            await Promise.all(dispatch.DispatchItems.map(async (dispatchItem) => {
                const retParams = returns.find(r => r.dispatchItemId === dispatchItem.id);
                const finalReturned = retParams?.quantity_returned || 0;
                const finalDamaged = retParams?.quantity_damaged || 0;

                const refillAgg = await tx.refillLog.aggregate({
                    where: { dispatchId, itemId: dispatchItem.itemId },
                    _sum: {
                        quantity_refilled: true,
                        expired_quantity: true,
                        damaged_quantity: true
                    }
                })

                const usedInRoute =
                    (refillAgg._sum.quantity_refilled || 0) +
                    (refillAgg._sum.expired_quantity || 0) +
                    (refillAgg._sum.damaged_quantity || 0)

                const remaining = dispatchItem.quantity_given - usedInRoute - finalReturned - finalDamaged;

                if (remaining > 0 && dispatch.driverId) {
                    await tx.driverStock.upsert({
                        where: {
                            driverId_itemId: { driverId: dispatch.driverId, itemId: dispatchItem.itemId }
                        },
                        update: {
                            quantity_on_hand: { increment: remaining }
                        },
                        create: {
                            driverId: dispatch.driverId,
                            itemId: dispatchItem.itemId,
                            quantity_on_hand: remaining
                        }
                    });
                }
            }));

            await tx.dispatch.update({
                where: { id: dispatchId },
                data: { status: "CLOSED" }
            })
        }, {
            maxWait: 5000,
            timeout: 15000
        })

        revalidatePath('/admin')
        revalidatePath('/driver')
        notifyClients('return')
        
        await writeAuditLog(session, 'SUBMIT_UNVERIFIED_RETURN', 'Dispatch', dispatchId, null, { returns });
        
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to process return"
        return { success: false, error: message }
    }
}

/** Administrative tool to correct errors in a driver's submitted return. */
export async function editDispatchReturn(
    dispatchId: number,
    edits: { dispatchItemId: number, new_quantity_returned: number }[]
): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        await prisma.$transaction(async (tx) => {
            const dispatch = await tx.dispatch.findUnique({
                where: { id: dispatchId },
                include: { DispatchItems: true }
            })
            if (!dispatch) throw new Error("Dispatch not found")

            for (const edit of edits) {
                if (edit.new_quantity_returned < 0) {
                    throw new Error("Return quantity cannot be negative")
                }

                const dispatchItem = await tx.dispatchItem.findUnique({
                    where: { id: edit.dispatchItemId }
                })

                if (!dispatchItem) {
                    throw new Error(`DispatchItem ${edit.dispatchItemId} not found`)
                }
                if (dispatchItem.dispatchId !== dispatchId) {
                    throw new Error(`Dispatch item ${edit.dispatchItemId} does not belong to dispatch ${dispatchId}`)
                }

                const refillAgg = await tx.refillLog.aggregate({
                    where: { dispatchId, itemId: dispatchItem.itemId },
                    _sum: {
                        quantity_refilled: true,
                        expired_quantity: true,
                        damaged_quantity: true
                    }
                })
                const usedInRoute =
                    (refillAgg._sum.quantity_refilled || 0) +
                    (refillAgg._sum.expired_quantity || 0) +
                    (refillAgg._sum.damaged_quantity || 0)
                const maxReturnable = Math.max(0, dispatchItem.quantity_given - usedInRoute)
                if (edit.new_quantity_returned > maxReturnable) {
                    throw new Error(`Edited return exceeds remaining dispatch stock for item ${dispatchItem.itemId}`)
                }

                const delta = edit.new_quantity_returned - dispatchItem.quantity_returned;

                if (delta !== 0) {
                    await tx.dispatchItem.update({
                        where: { id: edit.dispatchItemId },
                        data: { quantity_returned: edit.new_quantity_returned }
                    })

                    if (!dispatch || !dispatch.warehouseId) continue;

                    const warehouseStock = await tx.warehouseStock.findFirst({
                        where: { itemId: dispatchItem.itemId, warehouseId: dispatch.warehouseId }
                    })

                    if (warehouseStock) {
                        await tx.warehouseStock.update({
                            where: { id: warehouseStock.id },
                            data: { quantity_on_hand: { increment: delta } }
                        })
                    }

                    // Delta is > 0 if they returned MORE than previously recorded.
                    // This means what went to DriverStock was TOO MUCH by `delta`. So we must decrement `DriverStock`.
                    // If delta < 0, they returned LESS, so we increment DriverStock.
                    if (dispatch.driverId) {
                        const existingDriverStock = await (tx as any).driverStock.findUnique({
                            where: { driverId_itemId: { driverId: dispatch.driverId, itemId: dispatchItem.itemId } }
                        });
                        
                        if (existingDriverStock) {
                            await (tx as any).driverStock.update({
                                where: { id: existingDriverStock.id },
                                data: { quantity_on_hand: { decrement: delta } }
                            });
                        }
                    }
                }
            }
        })

        revalidatePath('/admin')
        revalidatePath('/driver')
        notifyClients('return')
        
        await writeAuditLog(session, 'EDIT_UNVERIFIED_RETURN', 'DispatchItem', dispatchId, null, { edits });
        
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to edit return"
        return { success: false, error: message }
    }
}

/**
 * ============================================================================
 * CORE MANAGEMENT (CRUD)
 * Manual overrides and entity management (Drivers, Machines, Items).
 * ============================================================================
 */

/** Fetches Lat/Lon for an address via OpenStreetMap (Nominatim) */
async function geocodeAddress(address?: string): Promise<{ latitude?: number, longitude?: number }> {
    if (!address) return {};
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const data = await res.json();
        if (data && data.length > 0) {
            return {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon)
            };
        }
    } catch (e) {
        console.error("Geocoding failed for address:", address, e);
    }
    return {};
}

/** Cleans and normalizes Saudi phone numbers to 05XXXXXXXX format */
function normalizePhoneNumber(phone?: string): string | undefined {
    if (!phone) return undefined;
    // Remove all non-numeric characters (including spaces, hyphens, and the + sign if we handle it next)
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Convert '+9665XXXXXXXX' or '9665XXXXXXXX' to '05XXXXXXXX'
    if (cleaned.startsWith('+966')) {
        cleaned = '0' + cleaned.substring(4);
    } else if (cleaned.startsWith('966')) {
        cleaned = '0' + cleaned.substring(3);
    }

    return cleaned;
}

/** Creates a new driver profile with optional PIN for app login. */
export async function createDriver(name: string, phone?: string, email?: string, pin?: string): Promise<ActionResult> {
    await requireAdmin();
    try {
        let hashedPin = pin;
        if (pin) {
            hashedPin = await bcrypt.hash(pin, 10);
        }

        const normalizedPhone = normalizePhoneNumber(phone);

        await prisma.driver.create({ data: { name, phone: normalizedPhone, email, pin: hashedPin } })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create driver" }
    }
}

/** Updates an existing driver's metadata or login credentials. */
export async function updateDriver(id: number, name: string, phone?: string, email?: string, pin?: string): Promise<ActionResult> {
    await requireAdmin();
    try {
        let hashedPin = pin;
        if (pin) {
            hashedPin = await bcrypt.hash(pin, 10);
        }

        const normalizedPhone = normalizePhoneNumber(phone);

        await prisma.driver.update({ where: { id }, data: { name, phone: normalizedPhone, email, ...(hashedPin !== undefined && { pin: hashedPin }) } })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update driver" }
    }
}

/** Toggles a driver as inactive. Rejects if they have open dispatches. */
export async function deleteDriver(id: number): Promise<ActionResult> {
    await requireAdmin();
    try {
        const activeDispatches = await prisma.dispatch.count({ where: { driverId: id, status: "OPEN" } })
        if (activeDispatches > 0) return { success: false, error: "Cannot delete driver with active dispatches" }
        await prisma.driver.update({ where: { id }, data: { isActive: false } })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: "Cannot delete driver (likely has existing logs/history)" }
    }
}

/** Creates a new machine with optional geocoding via OpenStreetMap. */
export async function createMachine(location_name: string, district: string, address?: string, notes?: string, latitude?: number, longitude?: number, terminalId?: string, operating_cost?: number, rental_cost?: number, tier?: string): Promise<ActionResult> {
    await requireAdmin();
    try {
        let finalLat = latitude;
        let finalLon = longitude;

        // If we don't have explicit coordinates but we have an address, fallback to geocoding
        if (address && (finalLat === undefined || finalLon === undefined)) {
            const coords = await geocodeAddress(address);
            if (coords.latitude) finalLat = coords.latitude;
            if (coords.longitude) finalLon = coords.longitude;
        }

        await prisma.machine.create({
            data: {
                location_name,
                district,
                address,
                notes,
                terminalId,
                latitude: finalLat,
                longitude: finalLon,
                operating_cost: operating_cost || 0,
                rental_cost: rental_cost || 0,
                tier: tier || "STANDARD"
            } as any
        })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create machine" }
    }
}

/** Updates machine metadata and recalculates coordinates if address changes. */
export async function updateMachine(id: number, location_name: string, district: string, address?: string, notes?: string, latitude?: number, longitude?: number, terminalId?: string, operating_cost?: number, rental_cost?: number, tier?: string): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        let finalLat = latitude;
        let finalLon = longitude;

        // If we don't have explicit coordinates but we have an address, fallback to geocoding
        if (address && (finalLat === undefined || finalLon === undefined)) {
            const coords = await geocodeAddress(address);
            if (coords.latitude) finalLat = coords.latitude;
            if (coords.longitude) finalLon = coords.longitude;
        }

        const oldState = await prisma.machine.findUnique({ where: { id } });
        const updated = await prisma.machine.update({
            where: { id },
            data: {
                location_name,
                district,
                address,
                notes,
                terminalId,
                latitude: finalLat,
                longitude: finalLon,
                operating_cost: operating_cost || 0,
                rental_cost: rental_cost || 0,
                tier: tier || "STANDARD"
            } as any
        })

        await writeAuditLog(session, 'UPDATE_MACHINE', 'Machine', id, oldState, updated);

        revalidatePath('/admin/manage')
        notifyClients('machine')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update machine" }
    }
}

/** Permanently removes a machine from the system. Rejects if logs exist. */
export async function deleteMachine(id: number): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        const oldState = await prisma.machine.findUnique({ where: { id } });
        await prisma.machine.delete({ where: { id } })

        await writeAuditLog(session, 'DELETE_MACHINE', 'Machine', id, oldState, null);

        revalidatePath('/admin/manage')
        notifyClients('machine')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: "Cannot delete machine (likely has existing logs/history)" }
    }
}

/** 
 * Admin tool to create a new item global record. 
 * Can optionally initialize stock in a specific warehouse. 
 */
export async function createItem(name: string, category: string, sku: string, price_standard: number, price_hospital: number, price_hotel: number, warehouseId?: number, initialStock: number = 0, bulk_format?: string): Promise<ActionResult> {
    try {
        await prisma.$transaction(async (tx) => {
            let targetItem: any = null;

            if (warehouseId) {
                // Look for an item with this SKU that is already linked to this warehouse
                const existingStockWithItem = await tx.warehouseStock.findFirst({
                    where: {
                        warehouseId,
                        item: { sku }
                    },
                    include: { item: true }
                });

                if (existingStockWithItem) {
                    // Update this specific item's metadata and increment its stock
                    targetItem = await tx.item.update({
                        where: { id: existingStockWithItem.itemId },
                        data: { name, category, price_standard, price_hospital, price_hotel, bulk_format }
                    });

                    await tx.warehouseStock.update({
                        where: { id: existingStockWithItem.id },
                        data: { quantity_on_hand: { increment: initialStock } }
                    });
                }
            }

            // If we didn't find an existing match in the target warehouse, create a new item record
            if (!targetItem) {
                targetItem = await tx.item.create({
                    data: { name, category, sku, price_standard, price_hospital, price_hotel, bulk_format }
                });

                if (warehouseId) {
                    await tx.warehouseStock.create({
                        data: {
                            itemId: targetItem.id,
                            warehouseId: warehouseId,
                            quantity_on_hand: initialStock
                        }
                    });
                }
            }
        });
        revalidatePath('/admin/manage');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to process item creation" };
    }
}

/** Updates standard pricing and metadata for an item. */
export async function updateItem(id: number, name: string, category: string, sku: string, price_standard: number, price_hospital: number, price_hotel: number, bulk_format?: string, default_assignment_qty?: number): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        if (default_assignment_qty !== undefined) {
            if (!Number.isInteger(default_assignment_qty) || default_assignment_qty < 0 || default_assignment_qty > 100) {
                return { success: false, error: "Batch quantity must be an integer between 0 and 100" };
            }
        }
        const oldState = await prisma.item.findUnique({ where: { id } });
        const updated = await prisma.item.update({
            where: { id },
            data: {
                name, category, sku, price_standard, price_hospital, price_hotel, bulk_format,
                ...(default_assignment_qty !== undefined ? { default_assignment_qty } : {}),
            }
        })

        await writeAuditLog(session, 'UPDATE_ITEM', 'Item', id, oldState, updated);

        revalidatePath('/admin/manage')
        notifyClients('item')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update item" }
    }
}

/** Fast-track stock update for the primary system warehouse. */
export async function updateItemStock(id: number, quantity_on_hand: number): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        const defaultWarehouse = await prisma.warehouse.findFirst();
        if (defaultWarehouse) {
            const oldStock = await prisma.warehouseStock.findUnique({
                where: { warehouseId_itemId: { warehouseId: defaultWarehouse.id, itemId: id } }
            });
            await prisma.warehouseStock.update({
                where: {
                    warehouseId_itemId: { warehouseId: defaultWarehouse.id, itemId: id }
                },
                data: { quantity_on_hand }
            })

            await writeAuditLog(session, 'UPDATE_ITEM_STOCK', 'WarehouseStock', oldStock?.id ?? null, oldStock, { ...oldStock, quantity_on_hand });
        }
        revalidatePath('/admin/manage')
        notifyClients('warehouseStock')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update item stock" }
    }
}

/**
 * ============================================================================
 * WAREHOUSE STOCK ADJUSTMENTS
 * Direct manipulation of specific warehouse stock levels.
 * ============================================================================
 */
/** Increments stock for a specific Item-Warehouse pair. */
export async function updateWarehouseItemStock(warehouseId: number, itemId: number, quantityToAdd: number): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        if (quantityToAdd <= 0) throw new Error("Quantity must be positive");

        let resultId: number | null = null;
        await prisma.$transaction(async (tx) => {
            const existingStock = await tx.warehouseStock.findFirst({
                where: { warehouseId, itemId }
            });

            if (existingStock) {
                const updated = await tx.warehouseStock.update({
                    where: { id: existingStock.id },
                    data: { quantity_on_hand: { increment: quantityToAdd } }
                });
                resultId = updated.id;
            } else {
                const created = await tx.warehouseStock.create({
                    data: { warehouseId, itemId, quantity_on_hand: quantityToAdd }
                });
                resultId = created.id;
            }
        });

        await writeAuditLog(session, 'INCREMENT_WAREHOUSE_STOCK', 'WarehouseStock', resultId, null, { warehouseId, itemId, quantityToAdd });

        revalidatePath('/admin/warehouse');
        notifyClients('warehouseStock');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to restock warehouse item" };
    }
}

/** Creates a new item and links it immediately to a warehouse. */
export async function createWarehouseItem(warehouseId: number, name: string, category: string, sku: string, price_standard: number, price_hospital: number, price_hotel: number, initialStock: number, bulk_format?: string): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        if (initialStock < 0) throw new Error("Initial stock cannot be negative");

        let createdItemId: number | null = null;
        await prisma.$transaction(async (tx) => {
            // First create the unified item
            const item = await tx.item.create({
                data: { name, category, sku, price_standard, price_hospital, price_hotel, bulk_format }
            });
            createdItemId = item.id;

            // Map it specifically to the requested warehouse
            await tx.warehouseStock.create({
                data: { warehouseId, itemId: item.id, quantity_on_hand: initialStock }
            });
        });

        await writeAuditLog(session, 'CREATE_WAREHOUSE_ITEM', 'Item', createdItemId, null, { warehouseId, name, sku, initialStock });

        revalidatePath('/admin/warehouse');
        notifyClients('item');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to specify new warehouse item" };
    }
}

/** Permanently deletes an item and all its inventory mapping records. */
export async function deleteItem(id: number): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        const oldState = await prisma.item.findUnique({ where: { id } });
        await prisma.$transaction(async (tx) => {
            await tx.warehouseStock.deleteMany({ where: { itemId: id } })
            await tx.item.delete({ where: { id } })
        })

        await writeAuditLog(session, 'DELETE_ITEM', 'Item', id, oldState, null);

        revalidatePath('/admin/manage')
        notifyClients('item')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: "Cannot delete item (likely has existing logs/history)" }
    }
}

/**
 * ============================================================================
 * PROTOTYPE & DEBUG ACTIONS
 * Destructive tools for resetting state or managing media assets.
 * ============================================================================
 */
/** Destroys all transactional data. Reserved for Super Admin use. */
export async function resetDatabase(): Promise<ActionResult> {
    await requireSuperAdmin();
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Delete all records in correct order
            await tx.inventoryAdjustment.deleteMany({});
            await tx.purchaseInvoiceItem.deleteMany({});
            await tx.purchaseInvoice.deleteMany({});
            await tx.refillLog.deleteMany({});
            await tx.dispatchItem.deleteMany({});
            await tx.dispatch.deleteMany({});
            await tx.dispatchTemplateItem.deleteMany({});
            await tx.dispatchTemplate.deleteMany({});
            await tx.warehouseStock.deleteMany({});
            await tx.machineStock.deleteMany({});
            await tx.warehouse.deleteMany({});
            await tx.item.deleteMany({});
            await tx.machine.deleteMany({});
            await tx.driver.deleteMany({});
            await tx.supplier.deleteMany({});
            await tx.returnVerification.deleteMany({});
        });

        revalidatePath('/', 'layout');
        notifyClients('reset');
        return { success: true, data: undefined };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to clear database"
        return { success: false, error: message }
    }
}

/** Uploads an item image to Vercel Blob and links the URL to the Item record. */
export async function uploadItemImage(itemId: number, formData: FormData): Promise<ActionResult<string>> {
    await requireDriver();
    try {
        const file = formData.get('image') as File | null;
        if (!file) throw new Error("No image file provided");

        const filename = `item-${itemId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;

        const blob = await put(filename, file, {
            access: 'public',
            addRandomSuffix: false
        });

        const imageUrl = blob.url;

        // Note: we can't easily delete old blobs without storing their blob object ID or making external queries tracking urls, 
        // to save time, we'll let vercel keep them or clean them manually.

        await prisma.item.update({
            where: { id: itemId },
            data: { imageUrl } as any
        });

        revalidatePath('/admin/manage');
        revalidatePath('/driver');
        notifyClients('image');
        return { success: true, data: imageUrl };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to upload image";
        return { success: false, error: message };
    }
}
/** Fetches the most recent dispatch for a driver to assist with inventory reconciliation. */
export async function getRecentDispatchForDriver(driverId: number): Promise<ActionResult<any>> {
    await requireAdmin();
    try {
        const latestDispatch = await prisma.dispatch.findFirst({
            where: { driverId },
            orderBy: { dispatch_date: 'desc' },
            include: {
                DispatchItems: {
                    include: { item: true }
                }
            }
        });

        if (!latestDispatch) {
            return { success: false, error: "No previous dispatches found for this driver." };
        }

        return { success: true, data: latestDispatch };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to fetch latest dispatch" };
    }
}

/** 
 * Admin utility to manually adjust driver stock to fix "ghost inventory".
 * Creates InventoryAdjustments for any positive or negative deltas.
 */
export async function editDriverBagStock(
    driverId: number,
    edits: { itemId: number, new_quantity: number }[]
): Promise<ActionResult> {
    await requireAdmin();
    try {
        await prisma.$transaction(async (tx) => {
            for (const edit of edits) {
                if (edit.new_quantity < 0) {
                    throw new Error("Quantity cannot be negative");
                }

                const driverStock = await (tx as any).driverStock.findUnique({
                    where: { driverId_itemId: { driverId, itemId: edit.itemId } }
                });

                if (!driverStock) {
                    if (edit.new_quantity > 0) {
                         throw new Error(`Cannot add to nonexistent driver stock for item ${edit.itemId}`);
                    }
                    continue; // Nothing to change
                }

                const delta = edit.new_quantity - driverStock.quantity_on_hand;
                if (delta === 0) continue;

                await (tx as any).driverStock.update({
                    where: { id: driverStock.id },
                    data: { quantity_on_hand: edit.new_quantity }
                });

                const itemData = await tx.item.findUnique({ where: { id: edit.itemId } });
                const priceAtAdjustment = itemData?.price_standard || 0;
                const driverData = await tx.driver.findUnique({ where: { id: driverId } });

                await tx.inventoryAdjustment.create({
                    data: {
                        itemId: edit.itemId,
                        quantity: delta,
                        reason: `Driver Bag Correction (${delta > 0 ? '+' : ''}${delta})`,
                        locationName: `Driver: ${driverData?.name || driverId}`,
                        priceAtAdjustment
                    }
                });
            }
        });
        
        revalidatePath('/admin');
        notifyClients('driverStock');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to edit driver bag stock" };
    }
}

/**
 * ============================================================================
 * AUDIT & RECONCILIATION
 * Enterprise tools for discrepancy auditing and system ledgers.
 * ============================================================================
 */

export async function reconcileMachineAudit(
    machineId: number,
    itemAudits: { itemId: number, physicalCount: number }[]
): Promise<ActionResult> {
    const session = await requireAdmin();
    const actorId = session.user ? parseInt((session.user as any).id, 10) : null;
    const actorRole = session.user ? (session.user as any).role : "SYSTEM";

    try {
        await prisma.$transaction(async (tx) => {
            const currentStock = await tx.machineStock.findMany({
                where: { machineId },
                include: { item: true }
            });

            // Map existing stock for fast lookup
            const stockMap = new Map(currentStock.map(s => [s.itemId, s]));
            
            const machineData = await tx.machine.findUnique({ where: { id: machineId }});

            const auditLogChanges: {itemId: number, expected: number, actual: number, sold: number}[] = [];

            for (const audit of itemAudits) {
                const stock = stockMap.get(audit.itemId);
                const expected = stock ? stock.estimated_stock : 0;
                
                // If there's a discrepancy
                if (expected !== audit.physicalCount) {
                    const diff = expected - audit.physicalCount;

                    // If physical is LESS than expected, missing items were SOLD or LOST.
                    // We log this as sales to maintain financial continuity.
                    if (diff > 0) {
                        const itemData = await tx.item.findUnique({ where: { id: audit.itemId } });
                        let priceToUse = itemData?.price_standard || 0;
                        if (machineData?.tier === 'HOSPITAL') priceToUse = itemData?.price_hospital || 0;
                        else if (machineData?.tier === 'HOTEL') priceToUse = itemData?.price_hotel || 0;

                        // Create a Dispatch-less RefillLog to push it to the financials as sales revenue
                        await tx.refillLog.create({
                            data: {
                                dispatchId: null, // Critical: this enables standalone sales logging!
                                machineId: machineId,
                                itemId: audit.itemId,
                                quantity_refilled: 0,
                                items_sold_since_last_refill: diff,
                                price_at_refill: priceToUse,
                                cost_at_refill: (itemData as any)?.cost || 0,
                                damaged_quantity: 0,
                                expired_quantity: 0
                            } as any
                        });
                    }
                    
                    // Update actual machine stock to the physical count
                    await tx.machineStock.upsert({
                        where: { machineId_itemId: { machineId, itemId: audit.itemId } },
                        update: {
                            estimated_stock: audit.physicalCount,
                            last_refilled_at: new Date()
                        },
                        create: {
                            machineId,
                            itemId: audit.itemId,
                            estimated_stock: audit.physicalCount,
                            last_refilled_at: new Date()
                        }
                    });

                    auditLogChanges.push({
                        itemId: audit.itemId,
                        expected,
                        actual: audit.physicalCount,
                        sold: diff > 0 ? diff : 0
                    });
                }
            }

            // Centralized Ledger Record
            if (auditLogChanges.length > 0) {
                await tx.systemAuditLog.create({
                    data: {
                        actorId,
                        actorRole,
                        actionType: "MACHINE_AUDIT",
                        entityType: "MACHINE_STOCK",
                        entityId: machineId,
                        oldState: JSON.parse(JSON.stringify(currentStock.filter(s => auditLogChanges.find(a => a.itemId === s.itemId)))),
                        newState: JSON.parse(JSON.stringify(auditLogChanges)),
                        message: `Auditor reconciled ${auditLogChanges.length} items. Total missing/sold: ${auditLogChanges.reduce((acc, curr) => acc + curr.sold, 0)}`
                    }
                });
            }
        });

        revalidatePath('/admin');
        revalidatePath('/admin/financials');
        revalidatePath('/admin/machine-stock');
        notifyClients('audit');
        
        return { success: true, data: undefined };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to reconcile machine";
        return { success: false, error: message };
    }
}

/**
 * ============================================================================
 * WAREHOUSE CALIBRATION (Quantity Recount + Cost Correction)
 *
 * Lets an admin correct warehouse stock that has drifted from physical reality
 * WITHOUT abusing purchase orders (which create false procurement records and
 * silently shift WAC). Mirrors reconcileMachineAudit, but warehouse stock
 * leaving is NOT a sale — so we never emit RefillLog rows. Every change writes
 * an InventoryAdjustment (inventory ledger) AND a SystemAuditLog row, both
 * inside the same transaction, so the audit trail can never drift from the data.
 * ============================================================================
 */

/**
 * Recount a warehouse to its physical count (absolute set, per item).
 *  - delta < 0 (shortage): neutral correction — WAC untouched (removing units at
 *    the running average never moves the average). No P&L impact.
 *  - delta > 0, no foundUnitCost: WAC untouched (found units valued at the current
 *    average — adding qty at the current WAC is a mathematical no-op).
 *  - delta > 0 with foundUnitCost: re-blend WAC exactly like a PO receipt,
 *    aggregating qty across Warehouse + Machine + Driver (see completePurchaseOrder).
 */
export async function calibrateWarehouseStock(
    warehouseId: number,
    items: { itemId: number; physicalCount: number; foundUnitCost?: number | null }[],
    note?: string
): Promise<ActionResult> {
    const session = await requireAdmin();
    const actorId = session.user ? parseInt((session.user as any).id, 10) : null;
    const actorRole = session.user ? (session.user as any).role : "SYSTEM";

    try {
        await prisma.$transaction(async (tx) => {
            const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
            if (!warehouse) throw new Error("Warehouse not found");

            const changes: { itemId: number; from: number; to: number; delta: number; wacFrom: number; wacTo: number }[] = [];

            for (const entry of items) {
                if (entry.physicalCount < 0) throw new Error("Physical count cannot be negative");

                const existing = await tx.warehouseStock.findUnique({
                    where: { warehouseId_itemId: { warehouseId, itemId: entry.itemId } },
                });
                const current = existing?.quantity_on_hand ?? 0;
                const delta = entry.physicalCount - current;
                if (delta === 0) continue;

                const itemData = await tx.item.findUnique({ where: { id: entry.itemId }, select: { cost: true } });
                const currentCost = itemData?.cost ?? 0;
                let newCost = currentCost;

                // Re-blend WAC only when adding found units that carry a DIFFERENT cost.
                const foundCost = entry.foundUnitCost;
                if (delta > 0 && foundCost != null && foundCost >= 0 && foundCost !== currentCost) {
                    const wStock = await tx.warehouseStock.aggregate({ where: { itemId: entry.itemId }, _sum: { quantity_on_hand: true } });
                    const mStock = await tx.machineStock.aggregate({ where: { itemId: entry.itemId }, _sum: { estimated_stock: true } });
                    const dStock = await (tx as any).driverStock.aggregate({ where: { itemId: entry.itemId }, _sum: { quantity_on_hand: true } });
                    const totalCurrentQty = (wStock._sum.quantity_on_hand || 0) + (mStock._sum.estimated_stock || 0) + (dStock._sum.quantity_on_hand || 0);
                    newCost = computeWeightedCost(totalCurrentQty, currentCost, delta, foundCost);
                }

                // Apply the absolute physical count.
                await tx.warehouseStock.upsert({
                    where: { warehouseId_itemId: { warehouseId, itemId: entry.itemId } },
                    update: { quantity_on_hand: entry.physicalCount },
                    create: { warehouseId, itemId: entry.itemId, quantity_on_hand: entry.physicalCount },
                });

                if (newCost !== currentCost) {
                    await tx.item.update({ where: { id: entry.itemId }, data: { cost: newCost } });
                }

                // Inventory ledger entry (snapshot the cost basis used for these units).
                await tx.inventoryAdjustment.create({
                    data: {
                        itemId: entry.itemId,
                        quantity: delta,
                        reason: `Warehouse Recount (${delta > 0 ? '+' : ''}${delta})${note && note.trim() ? `: ${note.trim()}` : ''}`,
                        locationName: warehouse.name,
                        priceAtAdjustment: delta > 0 ? (foundCost ?? currentCost) : currentCost,
                    },
                });

                changes.push({ itemId: entry.itemId, from: current, to: entry.physicalCount, delta, wacFrom: currentCost, wacTo: newCost });
            }

            if (changes.length === 0) {
                throw new Error("No changes to apply — all counts already match.");
            }

            await tx.systemAuditLog.create({
                data: {
                    actorId,
                    actorRole,
                    actionType: "WAREHOUSE_RECOUNT",
                    entityType: "WarehouseStock",
                    entityId: warehouseId,
                    oldState: JSON.parse(JSON.stringify(changes.map(c => ({ itemId: c.itemId, quantity_on_hand: c.from, cost: c.wacFrom })))),
                    newState: JSON.parse(JSON.stringify(changes.map(c => ({ itemId: c.itemId, quantity_on_hand: c.to, cost: c.wacTo })))),
                    message: `Recounted ${changes.length} item(s) in ${warehouse.name}. Net qty delta: ${changes.reduce((a, c) => a + c.delta, 0)}.${note && note.trim() ? ` Note: ${note.trim()}` : ''}`,
                },
            });
        });

        revalidatePath('/admin/warehouse');
        revalidatePath('/admin/financials');
        notifyClients('warehouseStock');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to calibrate warehouse stock" };
    }
}

/**
 * Directly correct an item's running cost (WAC) when it is known to be wrong —
 * e.g. a case price entered as a per-unit cost. This is a revaluation (SET), not
 * a blend, and it does NOT change quantity. Historical RefillLog.cost_at_refill
 * snapshots are deliberately left frozen (you never rewrite a posted record); the
 * correction only fixes go-forward COGS and live shrinkage valuation.
 * Super-admin only — revaluation is financially sensitive.
 */
export async function correctItemCost(
    itemId: number,
    correctedCost: number,
    note: string
): Promise<ActionResult> {
    const session = await requireSuperAdmin();
    const actorId = session.user ? parseInt((session.user as any).id, 10) : null;
    const actorRole = session.user ? (session.user as any).role : "SYSTEM";

    try {
        if (correctedCost < 0) throw new Error("Cost cannot be negative");
        if (!note || !note.trim()) throw new Error("A reason note is required for a cost correction");

        await prisma.$transaction(async (tx) => {
            const item = await tx.item.findUnique({ where: { id: itemId }, select: { id: true, name: true, cost: true } });
            if (!item) throw new Error("Item not found");
            if (item.cost === correctedCost) throw new Error("Corrected cost is identical to the current cost");

            await tx.item.update({ where: { id: itemId }, data: { cost: correctedCost } });

            await tx.systemAuditLog.create({
                data: {
                    actorId,
                    actorRole,
                    actionType: "COST_CORRECTION",
                    entityType: "Item",
                    entityId: itemId,
                    oldState: { cost: item.cost },
                    newState: { cost: correctedCost },
                    message: `Cost correction for ${item.name}: ${item.cost} → ${correctedCost}. Reason: ${note.trim()}`,
                },
            });
        });

        revalidatePath('/admin/warehouse');
        revalidatePath('/admin/manage');
        revalidatePath('/admin/financials');
        notifyClients('item');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to correct item cost" };
    }
}
