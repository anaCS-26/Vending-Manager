import prisma from "@/lib/prisma";
import {
    ewma,
    mean,
    demandStdDev,
    daysUntilEmpty as calcDaysUntilEmpty,
    recommendReplenishment,
    confidenceFromObservations,
} from "@/lib/forecast";
import type { StockoutForecast } from "@/types";

/**
 * ============================================================================
 * DEMAND SERIES RECONSTRUCTION + STOCKOUT FORECAST
 *
 * The layer between raw RefillLog rows and the pure statistics in
 * src/lib/forecast.ts: it turns Prisma rows into the per-interval numeric
 * series those functions consume, and classifies the result.
 *
 * This lived inside src/actions/ai-lab.ts, which is `"use server"` and gated
 * behind ENABLE_AI_LAB. The stock-alert cron needs exactly the same
 * computation but has no session and must run whether or not the experimental
 * lab is switched on, so the shared half moved here. ai-lab.ts still owns the
 * super-admin action wrapper and the Silent-Failure Watch.
 *
 * Each closed refill interval (the gap between two consecutive refills of the
 * same machine-item) is ONE observation of the average daily sales rate during
 * that interval. That per-interval rate is the unit everything here works in.
 * "Demand" is refilled-minus-returns, NOT point-of-sale telemetry.
 * ============================================================================
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** History considered for demand reconstruction. */
export const WINDOW_DAYS = 60;
/** Fallback lead time when a machine-item's visit cadence can't be measured. */
export const DEFAULT_CADENCE_DAYS = 7;
/** Clamp so two same-day refills don't produce an explosive daily rate. */
const MIN_INTERVAL_DAYS = 0.25;
/** Cap the radar to the most urgent rows. */
const RADAR_LIMIT = 30;

export type RefillEvent = { at: Date; sold: number | null };

export type Group = {
    machineId: number;
    itemId: number;
    machineName: string;
    district: string;
    itemName: string;
    currentAssignQty: number;
    events: RefillEvent[]; // ascending by `at`
};

export const groupKey = (machineId: number, itemId: number) => `${machineId}-${itemId}`;

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Per-interval daily sales rates and the interval lengths that produced them.
 * `events` must be ascending. Interval i runs (events[i-1], events[i]] and its
 * units sold are events[i].sold; intervals with a null count are skipped (we
 * can't measure them).
 */
export function demandStats(events: RefillEvent[]): { rates: number[]; intervalDays: number[] } {
    const rates: number[] = [];
    const intervalDays: number[] = [];
    for (let i = 1; i < events.length; i++) {
        const sold = events[i].sold;
        if (sold == null) continue;
        const days = Math.max(
            MIN_INTERVAL_DAYS,
            (events[i].at.getTime() - events[i - 1].at.getTime()) / MS_PER_DAY,
        );
        rates.push(sold / days);
        intervalDays.push(days);
    }
    return { rates, intervalDays };
}

/** Pulls window refills and groups them per machine-item (ascending events). */
export async function loadGroups(windowStart: Date): Promise<Map<string, Group>> {
    const refills = await prisma.refillLog.findMany({
        where: {
            refilled_at: { gte: windowStart },
            machine: { isActive: true },
            item: { isActive: true },
        },
        select: {
            machineId: true,
            itemId: true,
            refilled_at: true,
            items_sold_since_last_refill: true,
            machine: { select: { location_name: true, district: true } },
            item: { select: { name: true, default_assignment_qty: true } },
        },
        orderBy: { refilled_at: "asc" },
    });

    const groups = new Map<string, Group>();
    for (const r of refills) {
        const key = groupKey(r.machineId, r.itemId);
        let g = groups.get(key);
        if (!g) {
            g = {
                machineId: r.machineId,
                itemId: r.itemId,
                machineName: r.machine.location_name,
                district: r.machine.district,
                itemName: r.item.name,
                currentAssignQty: r.item.default_assignment_qty,
                events: [],
            };
            groups.set(key, g);
        }
        g.events.push({ at: r.refilled_at, sold: r.items_sold_since_last_refill });
    }
    return groups;
}

/**
 * Per-machine-item demand forecast, sorted most-urgent first.
 *
 * `riskLevel` is measured against each machine-item's OWN visit cadence rather
 * than a fixed unit threshold: a slot that sells 2/day and is visited weekly is
 * in trouble at 10 units, while one that sells 0.2/day is not. "critical" means
 * it is projected to run dry before the next visit is due.
 */
export async function computeStockoutForecast(): Promise<StockoutForecast[]> {
    const windowStart = new Date(Date.now() - WINDOW_DAYS * MS_PER_DAY);
    const groups = await loadGroups(windowStart);
    if (groups.size === 0) return [];

    // Current on-hand for the involved machine-items (estimated, not measured).
    const machineIds = [...new Set([...groups.values()].map((g) => g.machineId))];
    const itemIds = [...new Set([...groups.values()].map((g) => g.itemId))];
    const stocks = await prisma.machineStock.findMany({
        where: { machineId: { in: machineIds }, itemId: { in: itemIds } },
        select: { machineId: true, itemId: true, estimated_stock: true },
    });
    const stockMap = new Map<string, number>();
    for (const s of stocks) stockMap.set(groupKey(s.machineId, s.itemId), s.estimated_stock);

    const out: StockoutForecast[] = [];
    for (const [key, g] of groups) {
        const { rates, intervalDays } = demandStats(g.events);
        if (rates.length === 0) continue; // no measurable demand history

        const estDailyDemand = ewma(rates, 0.5); // recency-weighted demand level
        if (estDailyDemand <= 0) continue;

        const std = demandStdDev(rates);
        const cadence = intervalDays.length ? mean(intervalDays) : DEFAULT_CADENCE_DAYS;
        const currentStock = stockMap.get(key) ?? 0;
        const dte = calcDaysUntilEmpty(currentStock, estDailyDemand);

        let riskLevel: StockoutForecast["riskLevel"] = "ok";
        if (dte != null) {
            if (dte < cadence) riskLevel = "critical"; // will run dry before the next expected visit
            else if (dte < cadence * 1.5) riskLevel = "warning";
        }

        out.push({
            machineId: g.machineId,
            machineName: g.machineName,
            district: g.district,
            itemId: g.itemId,
            itemName: g.itemName,
            currentStock,
            estDailyDemand: round1(estDailyDemand),
            daysUntilEmpty: dte == null ? null : round1(dte),
            visitCadenceDays: Math.max(1, Math.round(cadence)),
            currentAssignQty: g.currentAssignQty,
            recommendedAssignQty: recommendReplenishment({ dailyDemand: estDailyDemand, std, leadDays: cadence }),
            riskLevel,
            confidence: confidenceFromObservations(rates.length),
            observations: rates.length,
        });
    }

    // At-risk first, then soonest-empty; rows with no finite ETA sink to the bottom.
    const rank: Record<StockoutForecast["riskLevel"], number> = { critical: 0, warning: 1, ok: 2 };
    out.sort((a, b) => {
        if (rank[a.riskLevel] !== rank[b.riskLevel]) return rank[a.riskLevel] - rank[b.riskLevel];
        if (a.daysUntilEmpty == null) return 1;
        if (b.daysUntilEmpty == null) return -1;
        return a.daysUntilEmpty - b.daysUntilEmpty;
    });

    return out.slice(0, RADAR_LIMIT);
}
