import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Performing System-Wide Inventory & History Reset...');

    try {
        // 1. Wipe Dispatch History
        console.log('🗑️  Wiping Dispatch History...');
        await prisma.returnVerification.deleteMany({});
        await prisma.refillLog.deleteMany({});
        await prisma.dispatchItem.deleteMany({});
        await prisma.dispatch.deleteMany({});
        await prisma.inventoryAdjustment.deleteMany({});
        await prisma.customerRefund.deleteMany({});
        console.log('✅ History wiped.');

        // 2. Reset Warehouse Stocks
        console.log('📦 Resetting Warehouse Stocks to 0...');
        await prisma.warehouseStock.updateMany({
            data: {
                quantity_on_hand: 0
            }
        });
        console.log('✅ Warehouse stocks zeroed.');

        // 3. Reset Machine Stocks
        console.log('📟 Resetting Machine Stocks to 0...');
        await prisma.machineStock.updateMany({
            data: {
                estimated_stock: 0,
                last_refilled_at: new Date()
            }
        });
        console.log('✅ Machine stocks zeroed.');

        console.log('✨ System successfully reset to clean state.');
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
