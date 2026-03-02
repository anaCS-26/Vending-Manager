import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Resetting System to Operational Initial State...');

    try {
        // 1. Clear History (as requested)
        console.log('🗑️  Wiping Dispatch History...');
        await prisma.returnVerification.deleteMany({});
        await prisma.refillLog.deleteMany({});
        await prisma.dispatchItem.deleteMany({});
        await prisma.dispatch.deleteMany({});
        await prisma.inventoryAdjustment.deleteMany({});
        await prisma.customerRefund.deleteMany({});
        console.log('✅ History wiped.');

        // 2. Initializing Warehouse Stocks (Restocking to 500 units)
        console.log('📦 Initializing Warehouse Stocks to 500 units...');
        const warehouses = await prisma.warehouse.findMany();
        const items = await prisma.item.findMany();

        for (const wh of warehouses) {
            for (const item of items) {
                await prisma.warehouseStock.upsert({
                    where: {
                        warehouseId_itemId: {
                            warehouseId: wh.id,
                            itemId: item.id
                        }
                    },
                    update: { quantity_on_hand: 500 },
                    create: {
                        warehouseId: wh.id,
                        itemId: item.id,
                        quantity_on_hand: 500
                    }
                });
            }
        }
        console.log('✅ Warehouse stocks restocked.');

        // 3. Initializing Machine Stocks (Baseline of 30 units for active state)
        console.log('📟 Initializing Machine Stocks to 30 units...');
        const machines = await prisma.machine.findMany();

        for (const machine of machines) {
            // Each machine gets a random subset of 8 items at 30 units each
            const machineItems = items.sort(() => 0.5 - Math.random()).slice(0, 8);
            for (const item of machineItems) {
                await prisma.machineStock.upsert({
                    where: {
                        machineId_itemId: {
                            machineId: machine.id,
                            itemId: item.id
                        }
                    },
                    update: { estimated_stock: 30, last_refilled_at: new Date() },
                    create: {
                        machineId: machine.id,
                        itemId: item.id,
                        estimated_stock: 30,
                        last_refilled_at: new Date()
                    }
                });
            }
        }
        console.log('✅ Machine stocks initialized.');

        console.log('✨ System successfully reset to operational baseline.');
    } catch (error) {
        console.error('❌ Reset failed:', error);
        process.exit(1);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
