/**
 * Backfill driverId on legacy RefillLog and ReturnVerification rows.
 *
 * Phase B introduces a denormalized driverId column on both tables so the
 * dispatchless flow doesn't need to hop through Dispatch.driverId every time.
 * This script populates that column for rows written before the refactor.
 *
 * Safe to re-run — only touches rows where driverId is currently NULL and a
 * dispatch with a driverId is reachable.
 *
 *   npx tsx prisma/maintenance/backfill-driver-ids.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function backfillRefillLogs() {
    const candidates = await prisma.refillLog.findMany({
        where: { driverId: null, dispatchId: { not: null } },
        select: { id: true, dispatchId: true },
    })
    console.log(`[RefillLog] found ${candidates.length} legacy rows to backfill`)
    if (candidates.length === 0) return 0

    const dispatchIds = Array.from(new Set(candidates.map(r => r.dispatchId!).filter(Boolean)))
    const dispatches = await prisma.dispatch.findMany({
        where: { id: { in: dispatchIds } },
        select: { id: true, driverId: true },
    })
    const dispatchToDriver = new Map(dispatches.map(d => [d.id, d.driverId] as const))

    let updated = 0
    for (const row of candidates) {
        const driverId = dispatchToDriver.get(row.dispatchId!)
        if (!driverId) continue
        await prisma.refillLog.update({
            where: { id: row.id },
            data: { driverId },
        })
        updated++
    }
    console.log(`[RefillLog] backfilled ${updated} rows`)
    return updated
}

async function backfillReturnVerifications() {
    const candidates = await prisma.returnVerification.findMany({
        where: { driverId: null, dispatchId: { not: null } },
        select: { id: true, dispatchId: true },
    })
    console.log(`[ReturnVerification] found ${candidates.length} legacy rows to backfill`)
    if (candidates.length === 0) return 0

    const dispatchIds = Array.from(new Set(candidates.map(r => r.dispatchId!).filter(Boolean)))
    const dispatches = await prisma.dispatch.findMany({
        where: { id: { in: dispatchIds } },
        select: { id: true, driverId: true },
    })
    const dispatchToDriver = new Map(dispatches.map(d => [d.id, d.driverId] as const))

    let updated = 0
    for (const row of candidates) {
        const driverId = dispatchToDriver.get(row.dispatchId!)
        if (!driverId) continue
        await prisma.returnVerification.update({
            where: { id: row.id },
            data: { driverId },
        })
        updated++
    }
    console.log(`[ReturnVerification] backfilled ${updated} rows`)
    return updated
}

async function main() {
    console.log('Starting driverId backfill...')
    const r1 = await backfillRefillLogs()
    const r2 = await backfillReturnVerifications()
    console.log(`Done. RefillLog: ${r1}  ReturnVerification: ${r2}`)
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
