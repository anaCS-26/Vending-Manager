"use server";

import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { getPredictedDepletion } from "@/actions/predictions";
import { startOfRiyadhDay } from "@/lib/utils";

export type AttentionAssignment = {
    id: number;
    driverName: string;
    itemName: string;
    quantity: number;
    assigned_at: Date;
};

export type AttentionReturn = {
    id: number;
    driverName: string;
    itemName: string;
    quantity: number;
    reason: string;
    reported_at: Date;
};

export type AtRiskMachine = {
    machineId: number;
    machineName: string;
    district: string;
    itemName: string;
    hoursUntilEmpty: number;
};

export type OverviewSnapshot = {
    revenueToday: number;
    refillsToday: number;
    distinctDriversToday: number;
    unitsSoldToday: number;
    machinesAtRiskCount: number;
    pendingReturnsCount: number;
    pendingAssignmentsCount: number;
    pendingAssignmentRows: AttentionAssignment[];
    pendingReturnRows: AttentionReturn[];
    atRiskMachineRows: AtRiskMachine[];
};

const AT_RISK_THRESHOLD_HOURS = 24;

export async function getOverviewSnapshot(): Promise<OverviewSnapshot> {
    await requireAdmin();

    const startOfDay = startOfRiyadhDay();

    const [
        todaysLogs,
        pendingReturnsCount,
        pendingAssignmentsCount,
        pendingAssignmentRowsRaw,
        pendingReturnRowsRaw,
        predictions,
    ] = await Promise.all([
        prisma.refillLog.findMany({
            where: { refilled_at: { gte: startOfDay } },
            select: {
                driverId: true,
                quantity_refilled: true,
                items_sold_since_last_refill: true,
                item: { select: { price_standard: true } },
            },
        }),
        prisma.returnVerification.count({ where: { status: "PENDING" } }),
        prisma.stockAssignment.count({ where: { status: "PENDING_ACK" } }),
        prisma.stockAssignment.findMany({
            where: { status: "PENDING_ACK" },
            orderBy: { assigned_at: "asc" },
            take: 5,
            include: {
                driver: { select: { name: true } },
                item: { select: { name: true } },
            },
        }),
        prisma.returnVerification.findMany({
            where: { status: "PENDING" },
            orderBy: { reported_at: "asc" },
            take: 5,
            include: {
                driver: { select: { name: true } },
                item: { select: { name: true } },
            },
        }),
        getPredictedDepletion(),
    ]);

    const revenueToday = todaysLogs.reduce(
        (acc, log) =>
            acc + (log.items_sold_since_last_refill || 0) * (log.item.price_standard || 0),
        0
    );
    const unitsSoldToday = todaysLogs.reduce(
        (acc, log) => acc + (log.items_sold_since_last_refill || 0),
        0
    );
    const refillsToday = todaysLogs.length;
    const distinctDriversToday = new Set(
        todaysLogs.map((l) => l.driverId).filter((id): id is number => id != null)
    ).size;

    // Predictions are per machine×item. Reduce to one row per machine using the
    // soonest-to-empty item for that machine.
    const perMachine = new Map<number, AtRiskMachine>();
    for (const p of predictions) {
        if (
            p.predictedHoursUntilEmpty == null ||
            p.predictedHoursUntilEmpty >= AT_RISK_THRESHOLD_HOURS
        )
            continue;
        const existing = perMachine.get(p.machineId);
        if (!existing || p.predictedHoursUntilEmpty < existing.hoursUntilEmpty) {
            perMachine.set(p.machineId, {
                machineId: p.machineId,
                machineName: p.machineName,
                district: p.district,
                itemName: p.itemName,
                hoursUntilEmpty: p.predictedHoursUntilEmpty,
            });
        }
    }
    const atRiskMachineRows = Array.from(perMachine.values())
        .sort((a, b) => a.hoursUntilEmpty - b.hoursUntilEmpty)
        .slice(0, 5);
    const machinesAtRiskCount = perMachine.size;

    const pendingAssignmentRows: AttentionAssignment[] = pendingAssignmentRowsRaw.map((a) => ({
        id: a.id,
        driverName: a.driver?.name ?? "Unknown",
        itemName: a.item?.name ?? "Unknown",
        quantity: a.quantity,
        assigned_at: a.assigned_at,
    }));

    const pendingReturnRows: AttentionReturn[] = pendingReturnRowsRaw.map((r) => ({
        id: r.id,
        driverName: r.driver?.name ?? "Unknown",
        itemName: r.item?.name ?? "Unknown",
        quantity: r.quantity,
        reason: r.reason,
        reported_at: r.reported_at,
    }));

    return {
        revenueToday,
        refillsToday,
        distinctDriversToday,
        unitsSoldToday,
        machinesAtRiskCount,
        pendingReturnsCount,
        pendingAssignmentsCount,
        pendingAssignmentRows,
        pendingReturnRows,
        atRiskMachineRows,
    };
}
