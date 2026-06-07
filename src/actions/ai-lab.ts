"use server";

import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-utils";
import {
    ewma,
    mean,
    demandStdDev,
    zScore,
    daysUntilEmpty as calcDaysUntilEmpty,
    recommendReplenishment,
    confidenceFromObservations,
} from "@/lib/forecast";
import type { StockoutForecast, SilentFailureAlert } from "@/types";

/**
 * ============================================================================
 * AI LAB (read-only, super-admin only) — EXPERIMENTAL
 *
 * Two demand-driven features built on the strongest signal we capture,
 * RefillLog.items_sold_since_last_refill (refilled-minus-returns per
 * machine-item, timestamped):
 *
 *   1. getStockoutForecast()    → Stockout Radar: recency-weighted demand,
 *      days-until-empty, and a replenishment recommendation per machine-item.
 *   2. getSilentFailureAlerts() → Silent-Failure Watch: machines whose sales
 *      collapsed vs. their own baseline, demand spikes, overdue service, and
 *      abnormal shrinkage.
 *
 * Both are pure reads — no mutations, no audit rows (mirrors super-insights.ts).
 * The statistics live in src/lib/forecast.ts; this file only reconstructs the
 * numeric series from Prisma rows and classifies the results.
 *
 * Each closed refill interval (gap between two consecutive refills of the same
 * machine-item) is ONE observation of the average daily sales rate during that
 * interval. That per-interval rate is the unit every calculation here works in.
 * ============================================================================
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// --- Tunables -------------------------------------------------------------
const WINDOW_DAYS = 60; // history considered for demand reconstruction
const DEFAULT_CADENCE_DAYS = 7; // fallback lead time when cadence can't be measured
const MIN_INTERVAL_DAYS = 0.25; // clamp so same-day refills don't explode the rate
const RADAR_LIMIT = 30; // cap the radar to the most urgent rows

// Silent-Failure thresholds
const RECENT_SHRINK_DAYS = 14; // "recent" window for damage/expiry spikes
const COLLAPSE_FLOOR = 1.0; // baseline must have sold ≥1/day to call a drop a "collapse"
const MIN_BASELINE_INTERVALS = 3; // need this many prior intervals before judging the latest
const Z_OUTLIER = 2; // |z| beyond which the latest interval is an outlier
const MIN_SHRINK_UNITS = 5; // ignore tiny absolute damage/expiry counts
const SILENT_LIMIT = 40;

type RefillEvent = { at: Date; sold: number | null };

type Group = {
    machineId: number;
    itemId: number;
    machineName: string;
    district: string;
    itemName: string;
    currentAssignQty: number;
    events: RefillEvent[]; // ascending by `at`
};

const groupKey = (machineId: number, itemId: number) => `${machineId}-${itemId}`;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** YYYY-MM-DD as observed in Riyadh — used to collapse a machine's refills into visit-days. */
function riyadhYMD(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

/**
 * Per-interval daily sales rates and the interval lengths that produced them.
 * `events` must be ascending. Interval i runs (events[i-1], events[i]] and its
 * units sold are events[i].sold; intervals with a null count are skipped (we
 * can't measure them).
 */
function demandStats(events: RefillEvent[]): { rates: number[]; intervalDays: number[] } {
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
async function loadGroups(windowStart: Date): Promise<Map<string, Group>> {
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

/* ========================================================================== */
/* 1. STOCKOUT RADAR                                                          */
/* ========================================================================== */

export async function getStockoutForecast(): Promise<StockoutForecast[]> {
    await requireSuperAdmin();

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

/* ========================================================================== */
/* 2. SILENT-FAILURE WATCH                                                    */
/* ========================================================================== */

export async function getSilentFailureAlerts(): Promise<SilentFailureAlert[]> {
    await requireSuperAdmin();

    const now = Date.now();
    const windowStart = new Date(now - WINDOW_DAYS * MS_PER_DAY);
    const groups = await loadGroups(windowStart);

    const alerts: SilentFailureAlert[] = [];

    // --- Per machine-item: demand collapse / spike on the latest closed interval.
    for (const g of groups.values()) {
        const { rates } = demandStats(g.events);
        if (rates.length < MIN_BASELINE_INTERVALS + 1) continue; // need baseline + a latest

        const latest = rates[rates.length - 1];
        const baseline = rates.slice(0, -1);
        const bMean = mean(baseline);
        const bStd = demandStdDev(baseline);
        const z = zScore(latest, bMean, bStd);
        const confidence = confidenceFromObservations(rates.length);
        const pct = bMean > 0 ? Math.round(((latest - bMean) / bMean) * 100) : 0;

        // Collapse: a machine that genuinely sold has nearly stopped.
        if (bMean >= COLLAPSE_FLOOR && (z <= -Z_OUTLIER || latest <= bMean * 0.25)) {
            const dead = latest <= bMean * 0.1;
            alerts.push({
                id: `demand_collapse-${g.machineId}-${g.itemId}`,
                kind: "demand_collapse",
                severity: dead ? "critical" : "warning",
                machineId: g.machineId,
                machineName: g.machineName,
                district: g.district,
                itemId: g.itemId,
                itemName: g.itemName,
                headline: `${g.itemName} sales collapsed at ${g.machineName}`,
                detail: `Latest interval ran ~${round1(latest)}/day vs a ${round1(bMean)}/day baseline${dead ? " — effectively zero. Check for a jammed slot, fault, or relocation." : "."}`,
                metric: `${pct}%`,
                drillHref: "/admin/machine-stock",
                confidence,
            });
            continue; // one signal per machine-item is enough
        }

        // Spike: a sudden jump — restock opportunity, or a possible miscount to verify.
        if (bMean > 0 && z >= Z_OUTLIER && latest >= bMean * 1.75) {
            alerts.push({
                id: `demand_spike-${g.machineId}-${g.itemId}`,
                kind: "demand_spike",
                severity: "info",
                machineId: g.machineId,
                machineName: g.machineName,
                district: g.district,
                itemId: g.itemId,
                itemName: g.itemName,
                headline: `${g.itemName} demand spiked at ${g.machineName}`,
                detail: `Latest interval ran ~${round1(latest)}/day vs a ${round1(bMean)}/day baseline. Consider raising par, or verify the count.`,
                metric: `+${pct}%`,
                drillHref: "/admin/machine-stock",
                confidence,
            });
        }
    }

    // --- Per machine: overdue for service relative to its OWN visit rhythm.
    // (Distinct from super-insights' flat 14-day stale check — this is cadence-relative.)
    type MachineVisits = { machineId: number; machineName: string; district: string; days: Set<string>; lastAt: number; demand: number };
    const byMachine = new Map<number, MachineVisits>();
    for (const g of groups.values()) {
        let m = byMachine.get(g.machineId);
        if (!m) {
            m = { machineId: g.machineId, machineName: g.machineName, district: g.district, days: new Set(), lastAt: 0, demand: 0 };
            byMachine.set(g.machineId, m);
        }
        for (const e of g.events) {
            m.days.add(riyadhYMD(e.at));
            if (e.at.getTime() > m.lastAt) m.lastAt = e.at.getTime();
        }
        const { rates } = demandStats(g.events);
        m.demand += mean(rates); // rough machine-level throughput
    }
    for (const m of byMachine.values()) {
        const visitDays = [...m.days].sort();
        if (visitDays.length < 3 || m.demand < COLLAPSE_FLOOR) continue; // need rhythm + real throughput
        const gaps: number[] = [];
        for (let i = 1; i < visitDays.length; i++) {
            gaps.push((Date.parse(visitDays[i]) - Date.parse(visitDays[i - 1])) / MS_PER_DAY);
        }
        const cadence = mean(gaps);
        const daysSince = (now - m.lastAt) / MS_PER_DAY;
        if (cadence >= 1 && daysSince >= 7 && daysSince > cadence * 2) {
            const critical = daysSince > cadence * 3;
            alerts.push({
                id: `overdue_service-${m.machineId}`,
                kind: "overdue_service",
                severity: critical ? "critical" : "warning",
                machineId: m.machineId,
                machineName: m.machineName,
                district: m.district,
                itemId: null,
                itemName: null,
                headline: `${m.machineName} is overdue for service`,
                detail: `Last refilled ${Math.round(daysSince)} days ago; this machine is usually serviced every ~${Math.round(cadence)} days.`,
                metric: `${Math.round(daysSince)}d`,
                drillHref: "/admin/machine-stock",
                confidence: confidenceFromObservations(visitDays.length),
            });
        }
    }

    // --- Per machine-item: abnormal recent damage/expiry vs the window baseline.
    const returns = await prisma.returnVerification.findMany({
        where: {
            reported_at: { gte: windowStart },
            reason: { in: ["DAMAGED", "EXPIRED"] },
            machineId: { not: null },
        },
        select: {
            machineId: true,
            itemId: true,
            quantity: true,
            reported_at: true,
            machine: { select: { location_name: true, district: true } },
            item: { select: { name: true } },
        },
    });
    const recentCut = now - RECENT_SHRINK_DAYS * MS_PER_DAY;
    type Shrink = { machineId: number; itemId: number; machineName: string; district: string; itemName: string; recent: number; prior: number };
    const shrink = new Map<string, Shrink>();
    for (const r of returns) {
        if (r.machineId == null) continue;
        const key = groupKey(r.machineId, r.itemId);
        let s = shrink.get(key);
        if (!s) {
            s = { machineId: r.machineId, itemId: r.itemId, machineName: r.machine?.location_name ?? "Machine", district: r.machine?.district ?? "", itemName: r.item.name, recent: 0, prior: 0 };
            shrink.set(key, s);
        }
        if (r.reported_at.getTime() >= recentCut) s.recent += r.quantity;
        else s.prior += r.quantity;
    }
    const priorWindows = Math.max(1, (WINDOW_DAYS - RECENT_SHRINK_DAYS) / RECENT_SHRINK_DAYS);
    for (const s of shrink.values()) {
        if (s.recent < MIN_SHRINK_UNITS) continue;
        const priorAvg = s.prior / priorWindows; // expected units per RECENT_SHRINK_DAYS window
        const abnormal = priorAvg === 0 ? s.recent >= MIN_SHRINK_UNITS * 1.5 : s.recent >= priorAvg * 3;
        if (!abnormal) continue;
        alerts.push({
            id: `abnormal_shrinkage-${s.machineId}-${s.itemId}`,
            kind: "abnormal_shrinkage",
            severity: "warning",
            machineId: s.machineId,
            machineName: s.machineName,
            district: s.district,
            itemId: s.itemId,
            itemName: s.itemName,
            headline: `Unusual ${s.itemName} damage/expiry at ${s.machineName}`,
            detail: `${s.recent} units written off in the last ${RECENT_SHRINK_DAYS} days vs a ~${round1(priorAvg)}-unit baseline. Check shelf life, handling, or over-stocking.`,
            metric: `${s.recent}u`,
            drillHref: "/admin/returns",
            confidence: "medium",
        });
    }

    // Most severe first; stable within a severity band.
    const sevRank: Record<SilentFailureAlert["severity"], number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
    return alerts.slice(0, SILENT_LIMIT);
}
