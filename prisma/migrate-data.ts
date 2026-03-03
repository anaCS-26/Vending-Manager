// prisma/migrate-data.ts
import { PrismaClient as PostgresClient } from '@prisma/client';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const postgres = new PostgresClient();

// Helper to open the local SQLite database
async function getSqliteDb() {
    return open({
        filename: path.join(__dirname, '../dev.db'),
        driver: sqlite3.Database,
    });
}

// Helper to safely fetch table data (ignoring missing tables if schema slightly drifted)
async function safeSelect(sqlite: any, tableName: string) {
    try {
        return await sqlite.all(`SELECT * FROM ${tableName}`);
    } catch (e) {
        console.warn(`Table ${tableName} not found in SQLite or error occurred. Skipping.`);
        return [];
    }
}

async function main() {
    console.log('Connecting to databases...');
    const sqlite = await getSqliteDb();
    await postgres.$connect();
    console.log('Connected.');

    try {
        // 1. Migrate Categories/Types that don't depend on anything
        console.log('Migrating Items...');
        const items = await safeSelect(sqlite, 'Item');
        if (items.length > 0) {
            await postgres.item.createMany({
                data: items,
                skipDuplicates: true,
            });
            console.log(`Migrated ${items.length} Items.`);
        }

        console.log('Migrating Warehouses...');
        const warehouses = await safeSelect(sqlite, 'Warehouse');
        if (warehouses.length > 0) {
            await postgres.warehouse.createMany({
                data: warehouses,
                skipDuplicates: true,
            });
            console.log(`Migrated ${warehouses.length} Warehouses.`);
        }

        console.log('Migrating Machines...');
        const machines = await safeSelect(sqlite, 'Machine');
        if (machines.length > 0) {
            await postgres.machine.createMany({
                data: machines.map((m: any) => ({
                    ...m,
                    // Convert any dates or booleans if needed
                })),
                skipDuplicates: true,
            });
            console.log(`Migrated ${machines.length} Machines.`);
        }

        console.log('Migrating Drivers...');
        const drivers = await safeSelect(sqlite, 'Driver');
        if (drivers.length > 0) {
            await postgres.driver.createMany({
                data: drivers,
                skipDuplicates: true,
            });
            console.log(`Migrated ${drivers.length} Drivers.`);
        }

        console.log('Migrating Suppliers...');
        const suppliers = await safeSelect(sqlite, 'Supplier');
        if (suppliers.length > 0) {
            await postgres.supplier.createMany({
                data: suppliers,
                skipDuplicates: true,
            });
            console.log(`Migrated ${suppliers.length} Suppliers.`);
        }

        // 2. Migrate Joins/Relationships
        console.log('Migrating WarehouseStock...');
        const warehouseStock = await safeSelect(sqlite, 'WarehouseStock');
        if (warehouseStock.length > 0) {
            await postgres.warehouseStock.createMany({
                data: warehouseStock,
                skipDuplicates: true,
            });
            console.log(`Migrated ${warehouseStock.length} WarehouseStock records.`);
        }

        console.log('Migrating MachineStock...');
        const machineStock = await safeSelect(sqlite, 'MachineStock');
        if (machineStock.length > 0) {
            await postgres.machineStock.createMany({
                data: machineStock.map((ms: any) => ({
                    ...ms,
                    last_refilled_at: new Date(ms.last_refilled_at)
                })),
                skipDuplicates: true,
            });
            console.log(`Migrated ${machineStock.length} MachineStock records.`);
        }

        // Dispatches (Handle Enum mapping)
        console.log('Migrating Dispatches...');
        const dispatches = await safeSelect(sqlite, 'Dispatch');
        if (dispatches.length > 0) {
            for (const dispatch of dispatches) {
                await postgres.dispatch.create({
                    data: {
                        id: dispatch.id,
                        driverId: dispatch.driverId,
                        warehouseId: dispatch.warehouseId,
                        dispatch_date: new Date(dispatch.dispatch_date),
                        // SQLite stored string 'OPEN'/'CLOSED', map to Enum directly
                        status: dispatch.status,
                    }
                });
            }
            console.log(`Migrated ${dispatches.length} Dispatches.`);
        }

        // Dispatch Items
        console.log('Migrating DispatchItems...');
        const dispatchItems = await safeSelect(sqlite, 'DispatchItem');
        if (dispatchItems.length > 0) {
            await postgres.dispatchItem.createMany({
                data: dispatchItems,
                skipDuplicates: true,
            });
            console.log(`Migrated ${dispatchItems.length} DispatchItems.`);
        }

        // RefillLogs
        console.log('Migrating RefillLogs...');
        const refillLogs = await safeSelect(sqlite, 'RefillLog');
        if (refillLogs.length > 0) {
            await postgres.refillLog.createMany({
                data: refillLogs.map((rl: any) => ({
                    ...rl,
                    refilled_at: new Date(rl.refilled_at)
                })),
                skipDuplicates: true,
            });
            console.log(`Migrated ${refillLogs.length} RefillLogs.`);
        }

        // ReturnVerifications (Enums)
        console.log('Migrating ReturnVerifications...');
        const returnVerifications = await safeSelect(sqlite, 'ReturnVerification');
        if (returnVerifications.length > 0) {
            for (const rv of returnVerifications) {
                await postgres.returnVerification.create({
                    data: {
                        id: rv.id,
                        dispatchId: rv.dispatchId,
                        itemId: rv.itemId,
                        quantity: rv.quantity,
                        notes: rv.notes,
                        reason: rv.reason, // DAMAGED, EXPIRED string maps to ENUM
                        status: rv.status, // PENDING, APPROVED string maps to ENUM
                        reported_at: new Date(rv.reported_at),
                        verified_at: rv.verified_at ? new Date(rv.verified_at) : null,
                    }
                })
            }
            console.log(`Migrated ${returnVerifications.length} ReturnVerifications.`);
        }

        // Purchase Invoices
        console.log('Migrating PurchaseInvoices...');
        const purchaseInvoices = await safeSelect(sqlite, 'PurchaseInvoice');
        if (purchaseInvoices.length > 0) {
            await postgres.purchaseInvoice.createMany({
                data: purchaseInvoices.map((pi: any) => ({
                    ...pi,
                    date: new Date(pi.date)
                })),
                skipDuplicates: true,
            });
            console.log(`Migrated ${purchaseInvoices.length} PurchaseInvoices.`);
        }

        // Purchase Invoice Items
        console.log('Migrating PurchaseInvoiceItems...');
        const purchaseInvoiceItems = await safeSelect(sqlite, 'PurchaseInvoiceItem');
        if (purchaseInvoiceItems.length > 0) {
            await postgres.purchaseInvoiceItem.createMany({
                data: purchaseInvoiceItems,
                skipDuplicates: true,
            });
            console.log(`Migrated ${purchaseInvoiceItems.length} PurchaseInvoiceItems.`);
        }

        // CustomerRefund (Enums)
        console.log('Migrating CustomerRefunds...');
        const customerRefunds = await safeSelect(sqlite, 'CustomerRefund');
        if (customerRefunds.length > 0) {
            for (const cr of customerRefunds) {
                await postgres.customerRefund.create({
                    data: {
                        id: cr.id,
                        refundNumber: cr.refundNumber,
                        phoneNumber: cr.phoneNumber,
                        itemPrice: cr.itemPrice,
                        status: cr.status,
                        receivedMoney: cr.receivedMoney,
                        dateReceived: cr.dateReceived ? new Date(cr.dateReceived) : null,
                        createdAt: new Date(cr.createdAt),
                        updatedAt: new Date(cr.updatedAt),
                    }
                })
            }
            console.log(`Migrated ${customerRefunds.length} CustomerRefunds.`);
        }

        // Inventory Adjustment (Enums)
        console.log('Migrating InventoryAdjustments...');
        const adjustments = await safeSelect(sqlite, 'InventoryAdjustment');
        if (adjustments.length > 0) {
            for (const adj of adjustments) {
                await postgres.inventoryAdjustment.create({
                    data: {
                        id: adj.id,
                        itemId: adj.itemId,
                        quantity: adj.quantity,
                        reason: adj.reason,
                        locationName: adj.locationName,
                        priceAtAdjustment: adj.priceAtAdjustment,
                        date: new Date(adj.date)
                    }
                })
            }
            console.log(`Migrated ${adjustments.length} InventoryAdjustments.`);
        }

        // Purchase Orders (Enums)
        console.log('Migrating PurchaseOrders...');
        const purchaseOrders = await safeSelect(sqlite, 'PurchaseOrder');
        if (purchaseOrders.length > 0) {
            for (const po of purchaseOrders) {
                await postgres.purchaseOrder.create({
                    data: {
                        id: po.id,
                        warehouseId: po.warehouseId,
                        status: po.status,
                        createdAt: new Date(po.createdAt),
                        completedAt: po.completedAt ? new Date(po.completedAt) : null,
                    }
                })
            }
            console.log(`Migrated ${purchaseOrders.length} PurchaseOrders.`);
        }

        // Purchase Order Items
        console.log('Migrating PurchaseOrderItems...');
        const purchaseOrderItems = await safeSelect(sqlite, 'PurchaseOrderItem');
        if (purchaseOrderItems.length > 0) {
            await postgres.purchaseOrderItem.createMany({
                data: purchaseOrderItems,
                skipDuplicates: true,
            });
            console.log(`Migrated ${purchaseOrderItems.length} PurchaseOrderItems.`);
        }

        console.log('🎉 Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await sqlite.close();
        await postgres.$disconnect();
    }
}

main();
