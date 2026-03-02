import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Resetting dispatch history...');

    // 1. Clear existing history data
    await prisma.returnVerification.deleteMany({});
    await prisma.refillLog.deleteMany({});
    await prisma.dispatchItem.deleteMany({});
    await prisma.dispatch.deleteMany({});

    console.log('✅ History cleared.');

    // 2. Fetch required entities
    const drivers = await prisma.driver.findMany();
    const warehouses = await prisma.warehouse.findMany();
    const machines = await prisma.machine.findMany();
    const items = await prisma.item.findMany();

    if (drivers.length === 0 || warehouses.length === 0 || machines.length === 0 || items.length === 0) {
        console.error('❌ Missing seed data (drivers, warehouses, machines, or items). Please seed the database first.');
        return;
    }

    console.log('🚀 Generating simulated dispatches...');

    // 3. Create dispatches
    for (let i = 0; i < 5; i++) {
        const driver = drivers[i % drivers.length];
        const warehouse = warehouses[i % warehouses.length];

        const dispatch = await prisma.dispatch.create({
            data: {
                driverId: driver.id,
                warehouseId: warehouse.id,
                status: i === 4 ? 'OPEN' : 'CLOSED', // One open dispatch
                dispatch_date: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // Spaced by days
            }
        });

        // Add 3 random items to each dispatch
        const selectedItems = items.sort(() => 0.5 - Math.random()).slice(0, 3);
        for (const item of selectedItems) {
            await prisma.dispatchItem.create({
                data: {
                    dispatchId: dispatch.id,
                    itemId: item.id,
                    quantity_given: 50,
                    quantity_returned: i === 4 ? 0 : 5, // Returned if closed
                    price_at_dispatch: item.price,
                }
            });

            // Simulation: Create a Refill Log for each item in the dispatch
            // Pick a random machine
            const machine = machines[Math.floor(Math.random() * machines.length)];

            const sold = Math.floor(Math.random() * 20) + 5;
            const refilled = sold + Math.floor(Math.random() * 5);
            const damaged = i % 2 === 0 ? 2 : 0; // Even dispatches have damages
            const expired = i % 3 === 0 ? 1 : 0; // i=0,3 have expired

            const log = await prisma.refillLog.create({
                data: {
                    dispatchId: dispatch.id,
                    machineId: machine.id,
                    itemId: item.id,
                    quantity_refilled: refilled,
                    items_sold_since_last_refill: sold,
                    refilled_at: new Date(dispatch.dispatch_date.getTime() + 2 * 60 * 60 * 1000), // 2 hours after dispatch
                }
            });

            // Simulation: If there were damages or expired items reported, create PENDING verifications
            if (damaged > 0) {
                await prisma.returnVerification.create({
                    data: {
                        dispatchId: dispatch.id,
                        itemId: item.id,
                        quantity: damaged,
                        reason: 'DAMAGED',
                        status: 'PENDING',
                        reported_at: log.refilled_at,
                        notes: `Field report: ${damaged} damaged units found at ${machine.location_name}`,
                    }
                });
            }

            if (expired > 0) {
                await prisma.returnVerification.create({
                    data: {
                        dispatchId: dispatch.id,
                        itemId: item.id,
                        quantity: expired,
                        reason: 'EXPIRED',
                        status: 'PENDING',
                        reported_at: log.refilled_at,
                        notes: `Field report: ${expired} expired units pulled from ${machine.location_name}`,
                    }
                });
            }
        }
    }

    console.log('✅ Simulation complete. New dispatches and pending verifications generated.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
