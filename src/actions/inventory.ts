"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { notifyClients, getDataVersion } from "@/lib/notify"
import type { ActionResult, PaginatedResult, DispatchWithRelations } from "@/types"
import { join } from "path"
import { writeFile, mkdir } from "fs/promises"
import fs from "fs"
import { put } from '@vercel/blob';
import bcrypt from "bcryptjs";

export async function getVersion(): Promise<number> {
    return getDataVersion();
}

// ==========================================
// WAREHOUSE ACTIONS
// ==========================================
export async function getWarehouseInventory() {
    return await prisma.warehouseStock.findMany({
        include: { item: true, warehouse: true }
    })
}

export async function getMachineInventory() {
    return await prisma.machineStock.findMany({
        include: { item: true, machine: true }
    })
}

export async function getMachineInventoryDetails(machineId: number) {
    return await prisma.machineStock.findMany({
        where: { machineId },
        include: { item: true }
    })
}

export async function getItems() {
    return await prisma.item.findMany({
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

// ==========================================
// DISPATCH ACTIONS (Admin Assigning to Driver)
// ==========================================
export async function getDrivers() {
    return await prisma.driver.findMany({
        include: { DriverStock: { include: { item: true } } }
    })
}

export async function getActiveDispatches() {
    return await prisma.dispatch.findMany({
        where: { status: "OPEN" },
        include: {
            driver: true,
            DispatchItems: { include: { item: true } },
            RefillLogs: { include: { machine: true } }
        }
    })
}

export async function getClosedDispatches() {
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

export async function getClosedDispatchesPaginated(
    page: number = 1,
    pageSize: number = 10,
    filter?: "ALL" | "ISSUES" | "MATCHES",
    searchQuery?: string
): Promise<PaginatedResult<DispatchWithRelations>> {
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

    // 3. Post-fetch filtering (for the complex variance logic that isn't in SQL)
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

export async function dispatchToDriver(
    driverId: number,
    warehouseId: number,
    items: { itemId: number, quantity: number }[]
): Promise<ActionResult> {
    try {
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

            await tx.dispatch.create({
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

            // Deduct warehouse stock strictly from the originating warehouse, but try Driver's bag first!
            for (const item of normalizedItems) {
                // 1. Check DriverStock first
                const driverStock = await tx.driverStock.findUnique({
                    where: { driverId_itemId: { driverId, itemId: item.itemId } }
                });

                let qtyToTakeFromWarehouse = item.quantity;

                if (driverStock && driverStock.quantity_on_hand > 0) {
                    const takeFromDriver = Math.min(driverStock.quantity_on_hand, item.quantity);
                    await tx.driverStock.update({
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
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to dispatch items"
        return { success: false, error: message }
    }
}

// ==========================================
// REFILL ACTIONS (Driver refilling Machine)
// ==========================================
export async function getMachines() {
    return await prisma.machine.findMany()
}

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
            if (!dispatchItem) throw new Error("Item is not part of this dispatch")

            const refillAgg = await tx.refillLog.aggregate({
                where: { dispatchId, itemId },
                _sum: {
                    quantity_refilled: true,
                    expired_quantity: true,
                    damaged_quantity: true
                }
            })
            const alreadyConsumed =
                (refillAgg._sum.quantity_refilled || 0) +
                (refillAgg._sum.expired_quantity || 0) +
                (refillAgg._sum.damaged_quantity || 0)
            const remaining = Math.max(0, dispatchItem.quantity_given - alreadyConsumed)
            const currentlyConsuming = quantity_refilled + returned
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

            // 2. Create the refill log
            await tx.refillLog.create({
                data: {
                    dispatchId,
                    machineId,
                    itemId,
                    quantity_refilled,
                    items_sold_since_last_refill: sales,
                    price_at_refill: priceToUse,
                    cost_at_refill: (itemData as any)?.cost || 0,
                    damaged_quantity: damaged,
                    // Reusing expired_quantity as route-returned quantity for compatibility.
                    expired_quantity: returned
                } as any
            })

            // 3. Update or Create MachineStock
            const currentStock = await tx.machineStock.findUnique({
                where: { machineId_itemId: { machineId, itemId } }
            });
            const cap = currentStock?.capacity || 10;
            const estimatedBase = currentStock?.estimated_stock ?? 0
            const estimatedAfter = Math.min(cap, Math.max(0, estimatedBase - returned + quantity_refilled))

            await tx.machineStock.upsert({
                where: { machineId_itemId: { machineId, itemId } },
                update: {
                    estimated_stock: estimatedAfter,
                    last_refilled_at: new Date()
                },
                create: {
                    machineId,
                    itemId,
                    capacity: cap,
                    estimated_stock: Math.min(cap, Math.max(0, quantity_refilled - returned)),
                    last_refilled_at: new Date()
                }
            });

            // 4. Add route-returned items to Return Verification
            if (damaged > 0) {
                await tx.returnVerification.create({
                    data: { dispatchId, itemId, quantity: damaged, reason: "DAMAGED", status: "PENDING" }
                });
            }

            if (returned > 0) {
                await tx.returnVerification.create({
                    data: { dispatchId, itemId, quantity: returned, reason: "RETURNED", status: "PENDING" }
                });
            }
        })

        revalidatePath('/driver')
        revalidatePath('/admin')
        revalidatePath('/admin/machine-stock')
        notifyClients('refill')
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to log refill"
        return { success: false, error: message }
    }
}

export async function logBatchRefills(
    dispatchId: number,
    machineId: number,
    items: { itemId: number, refilled: number, returned: number, capacity: number }[]
): Promise<ActionResult> {
    try {
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
                assertWholeNonNegative(item.capacity, `Capacity for item ${item.itemId}`)

                if (item.refilled === 0 && item.returned === 0) continue;

                const dispatchItem = dispatch.DispatchItems.find(di => di.itemId === item.itemId)
                if (!dispatchItem) {
                    throw new Error(`Item ${item.itemId} is not part of this dispatch`)
                }

                const refillAgg = await tx.refillLog.aggregate({
                    where: { dispatchId, itemId: item.itemId },
                    _sum: {
                        quantity_refilled: true,
                        expired_quantity: true,
                        damaged_quantity: true
                    }
                })
                const alreadyConsumed =
                    (refillAgg._sum.quantity_refilled || 0) +
                    (refillAgg._sum.expired_quantity || 0) +
                    (refillAgg._sum.damaged_quantity || 0)
                const remaining = Math.max(0, dispatchItem.quantity_given - alreadyConsumed)
                const currentlyConsuming = item.refilled + item.returned
                if (currentlyConsuming > remaining) {
                    throw new Error(`Not enough remaining dispatch stock for item ${item.itemId}. Remaining: ${remaining}, attempted: ${currentlyConsuming}`)
                }

                const itemData = await tx.item.findUnique({ where: { id: item.itemId } });

                let priceToUse = itemData?.price_standard || 0;
                if (machineData?.tier === 'HOSPITAL') priceToUse = itemData?.price_hospital || 0;
                else if (machineData?.tier === 'HOTEL') priceToUse = itemData?.price_hotel || 0;

                // Keep financial continuity: refilled is treated as sold proxy in this prototype.
                const sales = item.refilled;

                await tx.refillLog.create({
                    data: {
                        dispatchId,
                        machineId,
                        itemId: item.itemId,
                        quantity_refilled: item.refilled,
                        items_sold_since_last_refill: sales,
                        price_at_refill: priceToUse,
                        cost_at_refill: (itemData as any)?.cost || 0,
                        damaged_quantity: 0,
                        // Reusing expired_quantity as route-returned quantity for compatibility.
                        expired_quantity: item.returned
                    } as any
                });

                const currentStock = await tx.machineStock.findUnique({
                    where: { machineId_itemId: { machineId, itemId: item.itemId } }
                })
                const safeCapacity = Math.max(1, item.capacity)
                const estimatedBase = currentStock?.estimated_stock ?? 0
                const estimatedAfter = Math.min(safeCapacity, Math.max(0, estimatedBase - item.returned + item.refilled))

                await tx.machineStock.upsert({
                    where: { machineId_itemId: { machineId, itemId: item.itemId } },
                    update: {
                        capacity: safeCapacity,
                        estimated_stock: estimatedAfter,
                        last_refilled_at: new Date()
                    },
                    create: {
                        machineId,
                        itemId: item.itemId,
                        capacity: safeCapacity,
                        estimated_stock: Math.min(safeCapacity, Math.max(0, item.refilled - item.returned)),
                        last_refilled_at: new Date()
                    }
                });

                if (item.returned > 0) {
                    await tx.returnVerification.create({
                        data: { dispatchId, itemId: item.itemId, quantity: item.returned, reason: "RETURNED", status: "PENDING" }
                    });
                }
            }
        });

        revalidatePath('/driver')
        revalidatePath('/admin')
        revalidatePath('/admin/machine-stock')
        notifyClients('refill')
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to log batch refill"
        return { success: false, error: message }
    }
}

// ==========================================
// RETURN ACTIONS (End of day reconciliation)
// ==========================================
export async function returnDispatch(
    dispatchId: number,
    returns: { dispatchItemId: number, quantity_returned: number, quantity_damaged: number }[]
): Promise<ActionResult> {
    try {
        await prisma.$transaction(async (tx) => {
            const dispatch = await tx.dispatch.findUnique({
                where: { id: dispatchId },
                include: { DispatchItems: true }
            })
            if (!dispatch) throw new Error("Dispatch not found")
            if (dispatch.status !== "OPEN") throw new Error("Dispatch is already closed")

            for (const ret of returns) {
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

                if (!dispatch || !dispatch.warehouseId) continue;

                const warehouseStock = await tx.warehouseStock.findFirst({
                    where: { itemId: dispatchItem.itemId, warehouseId: dispatch.warehouseId }
                })

                if (warehouseStock) {
                    await tx.warehouseStock.update({
                        where: { id: warehouseStock.id },
                        data: { quantity_on_hand: { increment: ret.quantity_returned } }
                    })
                }
            }

            // --- INJECT REMAINING ITEMS INTO DRIVER STOCK ---
            for (const dispatchItem of dispatch.DispatchItems) {
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
            }

            await tx.dispatch.update({
                where: { id: dispatchId },
                data: { status: "CLOSED" }
            })
        })

        revalidatePath('/admin')
        revalidatePath('/driver')
        notifyClients('return')
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to process return"
        return { success: false, error: message }
    }
}

export async function editDispatchReturn(
    dispatchId: number,
    edits: { dispatchItemId: number, new_quantity_returned: number }[]
): Promise<ActionResult> {
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
                        const existingDriverStock = await tx.driverStock.findUnique({
                            where: { driverId_itemId: { driverId: dispatch.driverId, itemId: dispatchItem.itemId } }
                        });
                        
                        if (existingDriverStock) {
                            await tx.driverStock.update({
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
        return { success: true, data: undefined }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to edit return"
        return { success: false, error: message }
    }
}

// ==========================================
// MANAGEMENT ACTIONS (CRUD)
// ==========================================

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

export async function createDriver(name: string, phone?: string, email?: string, pin?: string): Promise<ActionResult> {
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

export async function updateDriver(id: number, name: string, phone?: string, email?: string, pin?: string): Promise<ActionResult> {
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

export async function deleteDriver(id: number): Promise<ActionResult> {
    try {
        const activeDispatches = await prisma.dispatch.count({ where: { driverId: id, status: "OPEN" } })
        if (activeDispatches > 0) return { success: false, error: "Cannot delete driver with active dispatches" }
        await prisma.driver.delete({ where: { id } })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: "Cannot delete driver (likely has existing logs/history)" }
    }
}

export async function createMachine(location_name: string, district: string, address?: string, notes?: string, latitude?: number, longitude?: number, terminalId?: string, operating_cost?: number, rental_cost?: number, tier?: string): Promise<ActionResult> {
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

export async function updateMachine(id: number, location_name: string, district: string, address?: string, notes?: string, latitude?: number, longitude?: number, terminalId?: string, operating_cost?: number, rental_cost?: number, tier?: string): Promise<ActionResult> {
    try {
        let finalLat = latitude;
        let finalLon = longitude;

        // If we don't have explicit coordinates but we have an address, fallback to geocoding
        if (address && (finalLat === undefined || finalLon === undefined)) {
            const coords = await geocodeAddress(address);
            if (coords.latitude) finalLat = coords.latitude;
            if (coords.longitude) finalLon = coords.longitude;
        }

        await prisma.machine.update({
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
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update machine" }
    }
}

export async function deleteMachine(id: number): Promise<ActionResult> {
    try {
        await prisma.machine.delete({ where: { id } })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: "Cannot delete machine (likely has existing logs/history)" }
    }
}

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

export async function updateItem(id: number, name: string, category: string, sku: string, price_standard: number, price_hospital: number, price_hotel: number, bulk_format?: string): Promise<ActionResult> {
    try {
        await prisma.item.update({ where: { id }, data: { name, category, sku, price_standard, price_hospital, price_hotel, bulk_format } })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update item" }
    }
}

export async function updateItemStock(id: number, quantity_on_hand: number): Promise<ActionResult> {
    try {
        const defaultWarehouse = await prisma.warehouse.findFirst();
        if (defaultWarehouse) {
            await prisma.warehouseStock.update({
                where: {
                    warehouseId_itemId: { warehouseId: defaultWarehouse.id, itemId: id }
                },
                data: { quantity_on_hand }
            })
        }
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update item stock" }
    }
}

// ----------------------------------------------------
// EXPLICIT WAREHOUSE STOCK ACTIONS
// ----------------------------------------------------

export async function updateWarehouseItemStock(warehouseId: number, itemId: number, quantityToAdd: number): Promise<ActionResult> {
    try {
        if (quantityToAdd <= 0) throw new Error("Quantity must be positive");

        await prisma.$transaction(async (tx) => {
            const existingStock = await tx.warehouseStock.findFirst({
                where: { warehouseId, itemId }
            });

            if (existingStock) {
                await tx.warehouseStock.update({
                    where: { id: existingStock.id },
                    data: { quantity_on_hand: { increment: quantityToAdd } }
                });
            } else {
                await tx.warehouseStock.create({
                    data: { warehouseId, itemId, quantity_on_hand: quantityToAdd }
                });
            }
        });

        revalidatePath('/admin/warehouse');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to restock warehouse item" };
    }
}

export async function createWarehouseItem(warehouseId: number, name: string, category: string, sku: string, price_standard: number, price_hospital: number, price_hotel: number, initialStock: number, bulk_format?: string): Promise<ActionResult> {
    try {
        if (initialStock < 0) throw new Error("Initial stock cannot be negative");

        await prisma.$transaction(async (tx) => {
            // First create the unified item
            const item = await tx.item.create({
                data: { name, category, sku, price_standard, price_hospital, price_hotel, bulk_format }
            });

            // Map it specifically to the requested warehouse
            await tx.warehouseStock.create({
                data: { warehouseId, itemId: item.id, quantity_on_hand: initialStock }
            });
        });

        revalidatePath('/admin/warehouse');
        return { success: true, data: undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to specify new warehouse item" };
    }
}

export async function deleteItem(id: number): Promise<ActionResult> {
    try {
        await prisma.$transaction(async (tx) => {
            await tx.warehouseStock.deleteMany({ where: { itemId: id } })
            await tx.item.delete({ where: { id } })
        })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: "Cannot delete item (likely has existing logs/history)" }
    }
}

// ==========================================
// PROTOTYPE ACTIONS
// ==========================================
export async function resetDatabase(): Promise<ActionResult> {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Delete all records in correct order
            await tx.customerRefund.deleteMany({});
            await tx.inventoryAdjustment.deleteMany({});
            await tx.purchaseInvoiceItem.deleteMany({});
            await tx.purchaseInvoice.deleteMany({});
            await tx.refillLog.deleteMany({});
            await tx.dispatchItem.deleteMany({});
            await tx.dispatch.deleteMany({});
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

export async function uploadItemImage(itemId: number, formData: FormData): Promise<ActionResult<string>> {
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
