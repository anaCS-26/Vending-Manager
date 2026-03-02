import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('Generating dummy reporting history...')

    // Get real drivers, machines, warehouses, and items
    const drivers = await prisma.driver.findMany()
    const machines = await prisma.machine.findMany()
    const items = await prisma.item.findMany()
    const warehouses = await prisma.warehouse.findMany()

    if (drivers.length === 0 || machines.length === 0 || items.length === 0 || warehouses.length === 0) {
        console.error('Missing prerequisite data. Run seed first.')
        return
    }

    // Create a series of dispatches and refill logs over the last 3 days
    for (let i = 0; i < 15; i++) {
        const driver = drivers[Math.floor(Math.random() * drivers.length)]
        const warehouse = warehouses[Math.floor(Math.random() * warehouses.length)]
        const date = new Date()
        date.setHours(date.getHours() - (i * 4)) // Go back in time

        const dispatch = await prisma.dispatch.create({
            data: {
                driverId: driver.id,
                warehouseId: warehouse.id,
                dispatch_date: date,
                status: 'CLOSED'
            }
        })

        // Add 3-5 refill logs per dispatch
        const numRefills = 3 + Math.floor(Math.random() * 3)
        const shuffledMachines = [...machines].sort(() => 0.5 - Math.random())

        for (let j = 0; j < numRefills; j++) {
            const machine = shuffledMachines[j]
            const item = items[Math.floor(Math.random() * items.length)]
            const quantity = 5 + Math.floor(Math.random() * 15)
            const sold = Math.floor(quantity * 0.8)
            const damaged = Math.random() > 0.8 ? 1 : 0
            const expired = Math.random() > 0.9 ? 1 : 0

            await prisma.refillLog.create({
                data: {
                    dispatchId: dispatch.id,
                    machineId: machine.id,
                    itemId: item.id,
                    quantity_refilled: quantity,
                    items_sold_since_last_refill: sold,
                    damaged_quantity: damaged,
                    expired_quantity: expired,
                    refilled_at: date
                }
            })
        }
    }

    console.log('Successfully generated 15 dispatches and ~60 refill logs.')
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect())
