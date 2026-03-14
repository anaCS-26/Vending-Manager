"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { notifyClients, getDataVersion } from "@/lib/notify"
import type { ActionResult, PaginatedResult, DispatchWithRelations } from "@/types"
import { basename, isAbsolute, join, relative } from "path"
import { writeFile, mkdir } from "fs/promises"
import fs from "fs"

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

// ==========================================
// DISPATCH ACTIONS (Admin Assigning to Driver)
// ==========================================
export async function getDrivers() {
    return await prisma.driver.findMany()
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
            const hasAnomaly = (totalGiven - (totalRefilled + totalReturned)) !== 0

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
            // Fetch current item prices to lock them into the dispatch
            const itemIds = items.map(i => i.itemId)
            const dbItems = await tx.item.findMany({
                where: { id: { in: itemIds } }
            })

            await tx.dispatch.create({
                data: {
                    driverId,
                    warehouseId,
                    DispatchItems: {
                        create: items.map(i => {
                            const matchedItem = dbItems.find(dbI => dbI.id === i.itemId)
                            return {
                                itemId: i.itemId,
                                quantity_given: i.quantity,
                                price_at_dispatch: matchedItem?.price || 0.0
                            }
                        })
                    }
                }
            })

            // Deduct warehouse stock strictly from the originating warehouse
            for (const item of items) {
                const warehouseStock = await tx.warehouseStock.findFirst({
                    where: { itemId: item.itemId, warehouseId: warehouseId }
                })

                if (!warehouseStock || warehouseStock.quantity_on_hand < item.quantity) {
                    throw new Error(`Insufficient stock for item ${item.itemId} at selected warehouse`)
                }

                await tx.warehouseStock.update({
                    where: { id: warehouseStock.id },
                    data: { quantity_on_hand: { decrement: item.quantity } }
                })
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
    expired: number = 0
): Promise<ActionResult> {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Get current stock for sales calculation
            const currentStock = await tx.machineStock.findUnique({
                where: { machineId_itemId: { machineId, itemId } }
            });

            const previousEstimate = currentStock?.estimated_stock || 0;
            // Sales = What we thought was there - What the driver actually found
            const sales = Math.max(0, previousEstimate - quantity_before);

            // 2. Create the refill log
            await tx.refillLog.create({
                data: {
                    dispatchId,
                    machineId,
                    itemId,
                    quantity_refilled,
                    items_sold_since_last_refill: sales,
                    damaged_quantity: damaged,
                    expired_quantity: expired
                }
            })

            // 3. Update or Create MachineStock
            const finalStockAfterRefill = (quantity_before - damaged - expired) + quantity_refilled;

            await tx.machineStock.upsert({
                where: { machineId_itemId: { machineId, itemId } },
                update: {
                    estimated_stock: Math.max(0, finalStockAfterRefill),
                    last_refilled_at: new Date()
                },
                create: {
                    machineId,
                    itemId,
                    estimated_stock: Math.max(0, finalStockAfterRefill),
                    last_refilled_at: new Date()
                }
            });

            // 4. Add Damaged/Expired items to Return Verification (existing logic)
            if (damaged > 0) {
                await tx.returnVerification.create({
                    data: { dispatchId, itemId, quantity: damaged, reason: "DAMAGED", status: "PENDING" }
                });
            }

            if (expired > 0) {
                await tx.returnVerification.create({
                    data: { dispatchId, itemId, quantity: expired, reason: "EXPIRED", status: "PENDING" }
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
    items: { itemId: number, refilled: number, expired: number, capacity: number }[]
): Promise<ActionResult> {
    try {
        await prisma.$transaction(async (tx) => {
            for (const item of items) {
                if (item.refilled === 0 && item.expired === 0) continue;

                const currentStock = await tx.machineStock.findUnique({
                    where: { machineId_itemId: { machineId, itemId: item.itemId } }
                });

                // Assumed logic: Driver tops off to Capacity. 
                // Found before refill = capacity - refilled + expired
                let assumedFound = item.capacity - item.refilled + item.expired;
                assumedFound = Math.min(item.capacity, Math.max(0, assumedFound));

                const previousEstimate = currentStock?.estimated_stock || item.capacity;
                const sales = Math.max(0, Math.round(previousEstimate - assumedFound));

                await tx.refillLog.create({
                    data: {
                        dispatchId,
                        machineId,
                        itemId: item.itemId,
                        quantity_refilled: item.refilled,
                        items_sold_since_last_refill: sales,
                        damaged_quantity: 0,
                        expired_quantity: item.expired
                    }
                });

                const finalStock = (assumedFound - item.expired) + item.refilled;

                await tx.machineStock.upsert({
                    where: { machineId_itemId: { machineId, itemId: item.itemId } },
                    update: {
                        capacity: item.capacity,
                        estimated_stock: Math.max(0, Math.min(item.capacity, finalStock)),
                        last_refilled_at: new Date()
                    },
                    create: {
                        machineId,
                        itemId: item.itemId,
                        capacity: item.capacity,
                        estimated_stock: Math.max(0, Math.min(item.capacity, finalStock)),
                        last_refilled_at: new Date()
                    }
                });

                if (item.expired > 0) {
                    await tx.returnVerification.create({
                        data: { dispatchId, itemId: item.itemId, quantity: item.expired, reason: "EXPIRED", status: "PENDING" }
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
            for (const ret of returns) {
                if (ret.quantity_returned < 0 || ret.quantity_damaged < 0) {
                    throw new Error("Quantities cannot be negative")
                }

                const dispatchItem = await tx.dispatchItem.update({
                    where: { id: ret.dispatchItemId },
                    data: {
                        quantity_returned: ret.quantity_returned,
                        quantity_damaged: ret.quantity_damaged
                    } as any
                })

                const dispatch = await tx.dispatch.findUnique({
                    where: { id: dispatchId }
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

                const delta = edit.new_quantity_returned - dispatchItem.quantity_returned;

                if (delta !== 0) {
                    await tx.dispatchItem.update({
                        where: { id: edit.dispatchItemId },
                        data: { quantity_returned: edit.new_quantity_returned }
                    })

                    const dispatch = await tx.dispatch.findUnique({
                        where: { id: dispatchId }
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

export async function createDriver(name: string, phone?: string, email?: string): Promise<ActionResult> {
    try {
        await prisma.driver.create({ data: { name, phone, email } })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create driver" }
    }
}

export async function updateDriver(id: number, name: string, phone?: string, email?: string): Promise<ActionResult> {
    try {
        await prisma.driver.update({ where: { id }, data: { name, phone, email } })
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

export async function createMachine(location_name: string, district: string, address?: string, notes?: string, latitude?: number, longitude?: number, terminalId?: string): Promise<ActionResult> {
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
                longitude: finalLon
            }
        })
        revalidatePath('/admin/manage')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create machine" }
    }
}

export async function updateMachine(id: number, location_name: string, district: string, address?: string, notes?: string, latitude?: number, longitude?: number, terminalId?: string): Promise<ActionResult> {
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
                longitude: finalLon
            }
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

export async function createItem(name: string, category: string, sku: string, price: number, warehouseId?: number, initialStock: number = 0, bulk_format?: string): Promise<ActionResult> {
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
                        data: { name, category, price, bulk_format }
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
                    data: { name, category, sku, price, bulk_format }
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

export async function updateItem(id: number, name: string, category: string, sku: string, price: number, bulk_format?: string): Promise<ActionResult> {
    try {
        await prisma.item.update({ where: { id }, data: { name, category, sku, price, bulk_format } })
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

export async function createWarehouseItem(warehouseId: number, name: string, category: string, sku: string, price: number, initialStock: number, bulk_format?: string): Promise<ActionResult> {
    try {
        if (initialStock < 0) throw new Error("Initial stock cannot be negative");

        await prisma.$transaction(async (tx) => {
            // First create the unified item
            const item = await tx.item.create({
                data: { name, category, sku, price, bulk_format }
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
        const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
        if (!allowedMimeTypes.has(file.type)) {
            throw new Error("Unsupported image type. Allowed types: JPEG, PNG, WEBP, GIF");
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const maxBytes = 5 * 1024 * 1024;
        if (buffer.length === 0) throw new Error("Uploaded image is empty");
        if (buffer.length > maxBytes) throw new Error("Image size exceeds 5MB limit");

        const extByMime: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif"
        };
        const extension = extByMime[file.type];
        const filename = `item-${itemId}-${Date.now()}.${extension}`;
        const uploadDir = join(process.cwd(), 'public', 'uploads');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const path = join(uploadDir, filename);
        await writeFile(path, buffer);

        const imageUrl = `/uploads/${filename}`;

        const existingItem = await prisma.item.findUnique({ where: { id: itemId } }) as any;
        if (existingItem?.imageUrl?.startsWith('/uploads/')) {
            const oldFileName = basename(existingItem.imageUrl);
            const oldPath = join(uploadDir, oldFileName);
            const relativeToUploadDir = relative(uploadDir, oldPath);
            const isWithinUploadDir = relativeToUploadDir && !relativeToUploadDir.startsWith('..') && !isAbsolute(relativeToUploadDir);
            if (isWithinUploadDir && fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

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
