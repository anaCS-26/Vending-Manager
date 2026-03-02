"use server"

import prisma from "@/lib/prisma"
import type { DepletionPrediction } from "@/types"

/**
 * Predictive Restocking Prototype
 * 
 * Calculates predicted machine depletion based on today's refill data.
 * Since this is a prototype without a MachineSlot model, we estimate:
 * - consumption_rate = total units refilled today / hours elapsed today
 * - A default machine capacity of 20 units per item slot
 * - predicted_hours_until_empty = capacity / consumption_rate
 * 
 * For a production system, this would use multi-day rolling averages
 * and actual machine slot current quantities.
 */
export async function getPredictedDepletion(): Promise<DepletionPrediction[]> {
    // Get today's date range
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const hoursElapsed = Math.max(1, (now.getTime() - todayStart.getTime()) / (1000 * 60 * 60))

    // Default capacity per machine slot (since we don't have MachineSlot model yet)
    const DEFAULT_SLOT_CAPACITY = 20

    // Fetch today's refill logs grouped by machine and item
    const todayRefills = await prisma.refillLog.findMany({
        where: {
            refilled_at: {
                gte: todayStart
            }
        },
        include: {
            machine: true,
            item: true,
        }
    })

    if (todayRefills.length === 0) return []

    // Group by machine × item
    const groupKey = (machineId: number, itemId: number) => `${machineId}-${itemId}`
    const groups = new Map<string, {
        machineId: number
        machineName: string
        district: string
        itemId: number
        itemName: string
        totalRefilled: number
    }>()

    for (const log of todayRefills) {
        const key = groupKey(log.machineId, log.itemId)
        const existing = groups.get(key)

        if (existing) {
            existing.totalRefilled += log.quantity_refilled
        } else {
            groups.set(key, {
                machineId: log.machineId,
                machineName: log.machine.location_name,
                district: log.machine.district,
                itemId: log.itemId,
                itemName: log.item.name,
                totalRefilled: log.quantity_refilled,
            })
        }
    }

    // Calculate predictions
    const predictions: DepletionPrediction[] = []

    for (const group of groups.values()) {
        // Consumption rate = how fast this machine consumes this item
        // We infer this from how frequently it needs refilling
        const consumptionRate = group.totalRefilled / hoursElapsed

        // Predicted hours until empty from a full slot
        const predictedHoursUntilEmpty = consumptionRate > 0
            ? DEFAULT_SLOT_CAPACITY / consumptionRate
            : null

        predictions.push({
            machineId: group.machineId,
            machineName: group.machineName,
            district: group.district,
            itemId: group.itemId,
            itemName: group.itemName,
            refillsToday: group.totalRefilled,
            consumptionRate: Math.round(consumptionRate * 100) / 100,
            predictedHoursUntilEmpty: predictedHoursUntilEmpty
                ? Math.round(predictedHoursUntilEmpty * 10) / 10
                : null,
        })
    }

    // Sort by urgency — machines that will run out soonest first
    predictions.sort((a, b) => {
        if (a.predictedHoursUntilEmpty === null) return 1
        if (b.predictedHoursUntilEmpty === null) return -1
        return a.predictedHoursUntilEmpty - b.predictedHoursUntilEmpty
    })

    return predictions
}
