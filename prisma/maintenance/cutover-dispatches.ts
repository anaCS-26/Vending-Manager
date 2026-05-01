import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = !args.includes('--execute')

  console.log(`Starting dispatch cutover... (Dry Run: ${isDryRun})`)

  const openDispatches = await prisma.dispatch.findMany({
    where: { status: 'OPEN' },
    include: {
      DispatchItems: true,
      driver: true
    }
  })

  console.log(`Found ${openDispatches.length} OPEN dispatches.`)

  for (const dispatch of openDispatches) {
    console.log(`\nProcessing Dispatch ID: ${dispatch.id} for Driver: ${dispatch.driver.name} (ID: ${dispatch.driverId})`)
    
    for (const dispatchItem of dispatch.DispatchItems) {
      const refillAgg = await prisma.refillLog.aggregate({
        where: { dispatchId: dispatch.id, itemId: dispatchItem.itemId },
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
        
      const remaining = dispatchItem.quantity_given - usedInRoute - dispatchItem.quantity_returned - dispatchItem.quantity_damaged

      if (remaining > 0) {
        console.log(`  Item ID: ${dispatchItem.itemId} -> Moving ${remaining} units to DriverStock`)
        
        if (!isDryRun) {
          await prisma.driverStock.upsert({
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
          })
        }
      }
    }
    
    if (!isDryRun) {
      await prisma.dispatch.update({
        where: { id: dispatch.id },
        data: { status: 'CLOSED' }
      })
      await prisma.systemAuditLog.create({
        data: {
          actorRole: 'SYSTEM',
          actionType: 'MIGRATE_DISPATCH_TO_STOCK',
          entityType: 'Dispatch',
          entityId: dispatch.id,
          newState: { status: 'CLOSED', migratedToDriverStock: true },
          message: `Closed dispatch and migrated remaining items to DriverStock for driver ${dispatch.driverId}`
        }
      })
      console.log(`  => Marked Dispatch ${dispatch.id} as CLOSED and logged audit.`)
    }
  }

  console.log('\nMigration script complete.')
  if (isDryRun) {
    console.log('Run with --execute to apply changes.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
