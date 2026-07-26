/**
 * SANDBOX SEED — for manually verifying the July 2026 security / data-integrity
 * and index branches. Shaped deliberately so each fix has something to test:
 *
 *  - 3 machines that all stock the SAME items, and a driver bag holding those
 *    items → the exact repro for the "staged counts bleed between machines" bug.
 *  - 60 SystemAuditLog rows → 3 pages at /super/audit, exercising the new
 *    timestamp index and skip/take pagination.
 *  - Pending ReturnVerification rows → /admin/returns has something to show.
 *  - A SUPER_ADMIN and a plain ADMIN → super-admin gating is visible.
 *
 * DESTRUCTIVE: wipes every table. Local/dev only — it refuses to run against a
 * non-local database.
 *
 *   npx tsx prisma/seed-sandbox.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'admin@nexgen.com'
const ADMIN_PASS = 'DemoAdmin2026!'
const STAFF_EMAIL = 'staff@nexgen.com'
const STAFF_PASS = 'DemoStaff2026!'
const DRIVER_PHONE = '5550100'
const DRIVER_PIN = '1234'

/** Refuse to wipe anything that isn't unmistakably a local database. */
function assertLocalDatabase() {
    const url = process.env.DATABASE_URL ?? ''
    const isLocal = /(127\.0\.0\.1|localhost)/.test(url)
    if (!isLocal) {
        throw new Error(
            `Refusing to run: DATABASE_URL does not point at localhost.\n` +
            `This script deletes every row. Host seen: ${url.replace(/:\/\/[^@]*@/, '://***@') || '(unset)'}`
        )
    }
}

async function wipe() {
    // Child-to-parent order to respect FKs.
    await prisma.systemAuditLog.deleteMany()
    await prisma.returnVerification.deleteMany()
    await prisma.refillLog.deleteMany()
    await prisma.dispatchItem.deleteMany()
    await prisma.dispatch.deleteMany()
    await prisma.dispatchTemplateItem.deleteMany()
    await prisma.dispatchTemplate.deleteMany()
    await prisma.stockAssignment.deleteMany()
    await prisma.driverStock.deleteMany()
    await prisma.machineStock.deleteMany()
    await prisma.warehouseStock.deleteMany()
    await prisma.purchaseOrderItem.deleteMany()
    await prisma.purchaseOrder.deleteMany()
    await prisma.purchaseInvoiceItem.deleteMany()
    await prisma.purchaseInvoice.deleteMany()
    await prisma.inventoryAdjustment.deleteMany()
    await prisma.supplier.deleteMany()
    await prisma.machine.deleteMany()
    await prisma.warehouse.deleteMany()
    await prisma.item.deleteMany()
    await prisma.driver.deleteMany()
    await prisma.admin.deleteMany()
}

async function main() {
    assertLocalDatabase()
    console.log('🧹 Wiping...')
    await wipe()

    console.log('👤 Accounts...')
    const superAdmin = await prisma.admin.create({
        data: {
            email: ADMIN_EMAIL,
            name: 'HQ Operations',
            password: await bcrypt.hash(ADMIN_PASS, 10),
            role: 'SUPER_ADMIN',
        },
    })
    await prisma.admin.create({
        data: {
            email: STAFF_EMAIL,
            name: 'Warehouse Staff',
            password: await bcrypt.hash(STAFF_PASS, 10),
            role: 'ADMIN',
        },
    })
    const driver = await prisma.driver.create({
        data: {
            name: 'John Doe',
            phone: DRIVER_PHONE,
            email: 'john@nexgen.com',
            pin: await bcrypt.hash(DRIVER_PIN, 10),
        },
    })

    console.log('📦 Catalog...')
    const items = await Promise.all([
        prisma.item.create({ data: { name: 'Red Bull Energy 250ml', category: 'Beverage', sku: 'BEV-RB-250', price_standard: 8.0, price_hospital: 7.0, price_hotel: 10.0, cost: 4.5, last_purchase_cost: 4.5, default_assignment_qty: 24 } }),
        prisma.item.create({ data: { name: 'Snickers Bar 50g', category: 'Snack', sku: 'SNK-SNK-50', price_standard: 4.0, price_hospital: 3.5, price_hotel: 5.0, cost: 2.0, last_purchase_cost: 2.0, default_assignment_qty: 36 } }),
        prisma.item.create({ data: { name: 'Lays Classic Chips', category: 'Snack', sku: 'SNK-LAY-100', price_standard: 5.0, price_hospital: 4.5, price_hotel: 6.0, cost: 2.5, last_purchase_cost: 2.5, default_assignment_qty: 20 } }),
        prisma.item.create({ data: { name: 'Aquafina Water 500ml', category: 'Beverage', sku: 'BEV-AQ-500', price_standard: 2.0, price_hospital: 1.5, price_hotel: 3.0, cost: 0.8, last_purchase_cost: 0.8, default_assignment_qty: 48 } }),
    ])

    console.log('🏭 Warehouse...')
    const warehouse = await prisma.warehouse.create({
        data: { name: 'Riyadh Central', location: 'Riyadh', address: 'Exit 18, Riyadh', operating_cost: 5000, rental_cost: 12000 },
    })
    for (const item of items) {
        await prisma.warehouseStock.create({
            data: { warehouseId: warehouse.id, itemId: item.id, quantity_on_hand: 500 },
        })
    }

    // Three machines on DIFFERENT tiers, all stocking the SAME items. The shared
    // items are what make the cross-machine bleed reproducible.
    console.log('🤖 Machines...')
    const machines = await Promise.all([
        prisma.machine.create({ data: { location_name: 'King Fahad Hospital - Lobby', district: 'Olaya', tier: 'HOSPITAL', operating_cost: 200, rental_cost: 800, latitude: 24.6944, longitude: 46.6858 } }),
        prisma.machine.create({ data: { location_name: 'Hilton Hotel - Gym', district: 'Malaz', tier: 'HOTEL', operating_cost: 250, rental_cost: 1200, latitude: 24.6748, longitude: 46.7261 } }),
        prisma.machine.create({ data: { location_name: 'Tech Park Tower B', district: 'Olaya', tier: 'STANDARD', operating_cost: 180, rental_cost: 900, latitude: 24.7136, longitude: 46.6753 } }),
    ])
    for (const machine of machines) {
        for (const item of items) {
            await prisma.machineStock.create({
                data: { machineId: machine.id, itemId: item.id, estimated_stock: 6 },
            })
        }
    }

    // Driver bag: generous, so you can stage large counts while testing.
    console.log('🎒 Driver bag...')
    for (const item of items) {
        await prisma.stockAssignment.create({
            data: {
                driverId: driver.id, itemId: item.id, warehouseId: warehouse.id,
                quantity: 40, status: 'ACKNOWLEDGED',
                assigned_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
                acknowledged_at: new Date(Date.now() - 90 * 60 * 1000),
                acknowledged_qty: 40,
            },
        })
        await prisma.driverStock.create({
            data: { driverId: driver.id, itemId: item.id, quantity_on_hand: 40 },
        })
    }

    // One PENDING_ACK assignment so the driver portal shows the ack banner.
    await prisma.stockAssignment.create({
        data: {
            driverId: driver.id, itemId: items[0].id, warehouseId: warehouse.id,
            quantity: 12, status: 'PENDING_ACK', assigned_at: new Date(),
        },
    })

    console.log('📜 History + returns...')
    for (let i = 0; i < 6; i++) {
        const machine = machines[i % machines.length]
        const item = items[i % items.length]
        await prisma.refillLog.create({
            data: {
                driverId: driver.id, machineId: machine.id, itemId: item.id,
                quantity_refilled: 10, items_sold_since_last_refill: 4,
                sales_revenue: 4 * item.price_standard,
                price_at_refill: item.price_standard, cost_at_refill: item.cost,
                refilled_at: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
                // Left NULL on purpose: mirrors legacy/online rows and proves the
                // new unique index tolerates many NULLs.
                clientRequestId: null,
            },
        })
    }
    for (let i = 0; i < 2; i++) {
        await prisma.returnVerification.create({
            data: {
                driverId: driver.id, machineId: machines[i].id, itemId: items[i].id,
                quantity: 3, reason: i === 0 ? 'DAMAGED' : 'EXPIRED', status: 'PENDING',
                reported_at: new Date(Date.now() - (i + 1) * 60 * 60 * 1000),
            },
        })
    }

    // 60 audit rows => 3 pages at 20/page, enough to feel the timestamp index.
    console.log('🗂️  Audit log (60 rows)...')
    const actions = ['UPDATE_ITEM', 'CREATE_DISPATCH', 'CALIBRATE_WAREHOUSE', 'ACK_ASSIGNMENT', 'CORRECT_ITEM_COST']
    await prisma.systemAuditLog.createMany({
        data: Array.from({ length: 60 }, (_, i) => ({
            actorId: superAdmin.id,
            actorRole: 'super_admin',
            actionType: actions[i % actions.length],
            entityType: 'Item',
            entityId: items[i % items.length].id,
            message: `Sandbox audit entry #${i + 1}`,
            timestamp: new Date(Date.now() - i * 30 * 60 * 1000),
        })),
    })

    console.log(`
============================================================
  SANDBOX READY
============================================================
  Super admin : ${ADMIN_EMAIL} / ${ADMIN_PASS}
  Admin       : ${STAFF_EMAIL} / ${STAFF_PASS}
  Driver      : phone ${DRIVER_PHONE} / PIN ${DRIVER_PIN}
------------------------------------------------------------
  3 machines, all stocking the same 4 items
  Driver bag : 40 of each item  (+1 pending assignment to ack)
  60 audit rows, 2 pending returns, 6 refill logs
============================================================
`)
}

main()
    .catch((e) => { console.error('Seed failed:', e); process.exit(1) })
    .finally(async () => { await prisma.$disconnect() })
