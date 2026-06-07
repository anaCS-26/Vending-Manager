"use server";

import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-utils";
import { computePnLTotals, rangeMultiplier } from "@/lib/pnl";
import { startOfRiyadhYear } from "@/lib/utils";

/**
 * ============================================================================
 * SUPER-ADMIN INSIGHTS (read-only)
 * Provider-grade oversight: real system health, executive KPIs, integrity /
 * anomaly alerts, and admin accountability. Every export is super-admin gated
 * and writes nothing — these are pure reads over the operational data.
 * ============================================================================
 */

// SystemMeta row key bumped by notifyClients() — keep in sync with src/lib/notify.ts.
const REALTIME_VERSION_KEY = "realtime_version";

// High-blast-radius actions a provider should watch (drives the oversight feed).
// Module-local: a "use server" file may only export async functions.
const SENSITIVE_ACTIONS = [
    "COST_CORRECTION",
    "WAREHOUSE_RECOUNT",
    "MACHINE_AUDIT",
    "DELETE_MACHINE",
    "DELETE_ITEM",
    "DELETE_WAREHOUSE",
] as const;

const STALE_MACHINE_DAYS = 14;
const QUEUE_SLA_DAYS = 2;

/** YYYY-MM-DD for an instant as observed in Riyadh (private util mirror). */
function riyadhYMD(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

/* ========================================================================== */
/* 1. SYSTEM HEALTH                                                           */
/* ========================================================================== */

export type SystemHealth = {
    db: { ok: boolean; latencyMs: number | null; error: string | null };
    realtime: { configured: boolean; version: string | null; lastBumpAt: Date | null };
    env: { supabaseUrl: boolean; supabaseAnonKey: boolean; blobToken: boolean };
    lastActivity: { lastRefillAt: Date | null; lastAuditAt: Date | null };
    rowCounts: { label: string; count: number }[];
};

/** Real infrastructure status — replaces the old hardcoded "Healthy" card. */
export async function getSystemHealth(): Promise<SystemHealth> {
    await requireSuperAdmin();

    // DB ping with latency.
    let dbOk = false;
    let latencyMs: number | null = null;
    let dbError: string | null = null;
    try {
        const t0 = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        latencyMs = Date.now() - t0;
        dbOk = true;
    } catch (e) {
        dbError = e instanceof Error ? e.message : "Unknown DB error";
    }

    const [meta, lastRefill, lastAudit, ...counts] = await Promise.all([
        prisma.systemMeta.findUnique({ where: { key: REALTIME_VERSION_KEY } }),
        prisma.refillLog.findFirst({ orderBy: { refilled_at: "desc" }, select: { refilled_at: true } }),
        prisma.systemAuditLog.findFirst({ orderBy: { timestamp: "desc" }, select: { timestamp: true } }),
        // Exact counts: cheap at this scale. If the ledgers grow into the millions,
        // swap RefillLog/SystemAuditLog for pg_class.reltuples estimates.
        prisma.machine.count({ where: { isActive: true } }),
        prisma.item.count({ where: { isActive: true } }),
        prisma.driver.count({ where: { isActive: true } }),
        prisma.admin.count(),
        prisma.refillLog.count(),
        prisma.systemAuditLog.count(),
        prisma.inventoryAdjustment.count(),
    ]);

    const [machines, items, drivers, admins, refills, audits, adjustments] = counts;

    return {
        db: { ok: dbOk, latencyMs, error: dbError },
        realtime: {
            configured: !!meta,
            version: meta ? meta.version.toString() : null,
            lastBumpAt: meta?.updatedAt ?? null,
        },
        env: {
            supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
            supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            blobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
        },
        lastActivity: {
            lastRefillAt: lastRefill?.refilled_at ?? null,
            lastAuditAt: lastAudit?.timestamp ?? null,
        },
        rowCounts: [
            { label: "Active Machines", count: machines },
            { label: "Active Items", count: items },
            { label: "Active Drivers", count: drivers },
            { label: "Admin Accounts", count: admins },
            { label: "Refill Logs", count: refills },
            { label: "Audit Entries", count: audits },
            { label: "Inventory Adjustments", count: adjustments },
        ],
    };
}

/* ========================================================================== */
/* 2. EXECUTIVE KPIs                                                          */
/* ========================================================================== */

export type ExecutiveRange = "7days" | "30days" | "ytd" | "all";

export type ExecutiveKpis = {
    range: ExecutiveRange;
    since: Date;
    revenue: number;
    cogs: number;
    shrinkage: number;
    expenses: number;
    netProfit: number;
    grossMargin: number; // (revenue - cogs) / revenue, 0..1
    activeMachines: number;
    activeDrivers: number;
    activeItems: number;
    inventoryValue: number; // Σ warehouse on-hand × WAC
    revenueTrend: { date: string; revenue: number }[]; // last 14 Riyadh days
};

/** Top-line business health for the provider Overview. Reuses shared P&L math. */
export async function getExecutiveKpis(range: ExecutiveRange = "all"): Promise<ExecutiveKpis> {
    await requireSuperAdmin();

    const now = new Date();
    let since = new Date(0);
    let expenseMultiplier = 1;

    if (range === "7days") {
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        expenseMultiplier = rangeMultiplier(7);
    } else if (range === "30days") {
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        expenseMultiplier = 1;
    } else if (range === "ytd") {
        since = startOfRiyadhYear(now);
        const days = Math.max(1, (now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));
        expenseMultiplier = rangeMultiplier(days);
    } else {
        const earliest = await prisma.refillLog.findFirst({ orderBy: { refilled_at: "asc" }, select: { refilled_at: true } });
        if (earliest) {
            const days = Math.max(1, (now.getTime() - earliest.refilled_at.getTime()) / (1000 * 60 * 60 * 24));
            expenseMultiplier = rangeMultiplier(days);
        }
    }

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [refillLogs, approvedReturns, damagedDispatchItems, machines, warehouses, activeMachines, activeDrivers, activeItems, warehouseStock, trendLogs] =
        await Promise.all([
            prisma.refillLog.findMany({
                where: { refilled_at: { gte: since } },
                select: {
                    items_sold_since_last_refill: true,
                    sales_revenue: true,
                    price_at_refill: true,
                    cost_at_refill: true,
                    item: { select: { price_standard: true, cost: true } },
                },
            }),
            prisma.returnVerification.findMany({
                where: { status: "APPROVED", reported_at: { gte: since } },
                select: { quantity: true, item: { select: { cost: true } } },
            }),
            prisma.dispatchItem.findMany({
                where: { quantity_damaged: { gt: 0 }, dispatch: { dispatch_date: { gte: since } } },
                select: { quantity_damaged: true, item: { select: { cost: true } } },
            }),
            prisma.machine.findMany({ select: { operating_cost: true, rental_cost: true } }),
            prisma.warehouse.findMany({ select: { operating_cost: true, rental_cost: true } }),
            prisma.machine.count({ where: { isActive: true } }),
            prisma.driver.count({ where: { isActive: true } }),
            prisma.item.count({ where: { isActive: true } }),
            prisma.warehouseStock.findMany({ select: { quantity_on_hand: true, item: { select: { cost: true } } } }),
            prisma.refillLog.findMany({
                where: { refilled_at: { gte: fourteenDaysAgo } },
                select: {
                    refilled_at: true,
                    items_sold_since_last_refill: true,
                    sales_revenue: true,
                    price_at_refill: true,
                    item: { select: { price_standard: true } },
                },
            }),
        ]);

    const totals = computePnLTotals({ refillLogs, approvedReturns, damagedDispatchItems, machines, warehouses, expenseMultiplier });

    const inventoryValue = warehouseStock.reduce((sum, ws) => sum + ws.quantity_on_hand * (ws.item.cost || 0), 0);

    // Build a continuous 14-day window so the sparkline has no gaps.
    const dayTotals = new Map<string, number>();
    for (const log of trendLogs) {
        const key = riyadhYMD(log.refilled_at);
        const sold = log.items_sold_since_last_refill || 0;
        const rev = log.sales_revenue || sold * (log.price_at_refill ?? log.item.price_standard ?? 0);
        dayTotals.set(key, (dayTotals.get(key) ?? 0) + rev);
    }
    const revenueTrend: { date: string; revenue: number }[] = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = riyadhYMD(d);
        revenueTrend.push({ date: key, revenue: Math.round((dayTotals.get(key) ?? 0) * 100) / 100 });
    }

    return {
        range,
        since,
        ...totals,
        grossMargin: totals.revenue > 0 ? (totals.revenue - totals.cogs) / totals.revenue : 0,
        activeMachines,
        activeDrivers,
        activeItems,
        inventoryValue,
        revenueTrend,
    };
}

/* ========================================================================== */
/* 3. INTEGRITY ALERTS                                                        */
/* ========================================================================== */

export type IntegritySeverity = "critical" | "warning" | "info";

export type IntegrityRow = {
    id: string;
    title: string;
    detail: string;
    metric: string;
};

export type IntegrityCategory = {
    key: string;
    label: string;
    description: string;
    severity: IntegritySeverity;
    count: number;
    drillHref: string;
    drillLabel: string;
    rows: IntegrityRow[];
};

const SAMPLE = 6;

/** Categorised, actionable anomaly board. Each category links to where it gets fixed. */
export async function getIntegrityAlerts(): Promise<IntegrityCategory[]> {
    await requireSuperAdmin();

    const staleCutoff = new Date(Date.now() - STALE_MACHINE_DAYS * 24 * 60 * 60 * 1000);

    const [items, deficits, staleGroups, pendingReturns, pendingAssignments] = await Promise.all([
        prisma.item.findMany({
            where: { isActive: true },
            select: { id: true, name: true, sku: true, bulk_format: true, cost: true, price_standard: true },
        }),
        prisma.warehouseStock.findMany({
            where: { pending_deficit: { gt: 0 } },
            select: { pending_deficit: true, item: { select: { name: true } }, warehouse: { select: { name: true } } },
            orderBy: { pending_deficit: "desc" },
        }),
        // Per-machine most-recent service time (one row per machine); filtered to the
        // cutoff in JS below to avoid Prisma's brittle DateTime `having` aggregate.
        prisma.machineStock.groupBy({
            by: ["machineId"],
            _max: { last_refilled_at: true },
        }),
        prisma.returnVerification.findMany({
            where: { status: "PENDING" },
            orderBy: { reported_at: "asc" },
            select: { id: true, reported_at: true, quantity: true, reason: true, item: { select: { name: true } }, driver: { select: { name: true } } },
        }),
        prisma.stockAssignment.findMany({
            where: { status: "PENDING_ACK" },
            orderBy: { assigned_at: "asc" },
            select: { id: true, assigned_at: true, quantity: true, item: { select: { name: true } }, driver: { select: { name: true } } },
        }),
    ]);

    // --- Suspect costs: WAC above sell price (almost always a case price entered per-unit).
    const suspects = items
        .filter((i) => i.price_standard > 0 && i.cost > i.price_standard)
        .sort((a, b) => b.cost / b.price_standard - a.cost / a.price_standard);

    // --- Pricing gaps: active items that would sell for nothing or carry no cost basis.
    const pricingGaps = items.filter((i) => i.price_standard <= 0 || i.cost <= 0);

    // --- Stale machines: keep groups whose newest service is older than the cutoff.
    const staleGroupsFiltered = staleGroups.filter(
        (g) => g._max.last_refilled_at != null && g._max.last_refilled_at < staleCutoff,
    );
    const staleIds = staleGroupsFiltered.map((g) => g.machineId);
    const staleMachines = staleIds.length
        ? await prisma.machine.findMany({
              where: { id: { in: staleIds }, isActive: true },
              select: { id: true, location_name: true, district: true },
          })
        : [];
    const staleMaxById = new Map(staleGroupsFiltered.map((g) => [g.machineId, g._max.last_refilled_at]));

    const ageDays = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));

    const categories: IntegrityCategory[] = [
        {
            key: "suspect_costs",
            label: "Suspect Costs",
            description: "Unit WAC is higher than the standard sell price — usually a case price entered per-unit. Corrupts COGS and P&L.",
            severity: "critical",
            count: suspects.length,
            drillHref: "/admin/warehouse",
            drillLabel: "Correct cost",
            rows: suspects.slice(0, SAMPLE).map((i) => ({
                id: `item-${i.id}`,
                title: i.name,
                detail: `${i.sku}${i.bulk_format ? ` · ${i.bulk_format}` : ""}`,
                metric: `cost ⃁${i.cost.toFixed(2)} > sell ⃁${i.price_standard.toFixed(2)} (${(i.cost / i.price_standard).toFixed(1)}×)`,
            })),
        },
        {
            key: "pricing_gaps",
            label: "Pricing Gaps",
            description: "Active items with no sell price (sells for free) or no cost basis (COGS understated).",
            severity: "warning",
            count: pricingGaps.length,
            drillHref: "/admin/manage",
            drillLabel: "Edit item",
            rows: pricingGaps.slice(0, SAMPLE).map((i) => ({
                id: `item-${i.id}`,
                title: i.name,
                detail: i.sku,
                metric: i.price_standard <= 0 ? "no sell price" : "no cost basis",
            })),
        },
        {
            key: "pending_deficits",
            label: "Supplier Deficits",
            description: "Stock owed from short-shipped POs. Sits as pending_deficit until reconciled by the next receipt.",
            severity: "warning",
            count: deficits.length,
            drillHref: "/admin/warehouse",
            drillLabel: "Review warehouse",
            rows: deficits.slice(0, SAMPLE).map((d, idx) => ({
                id: `deficit-${idx}`,
                title: d.item.name,
                detail: d.warehouse.name,
                metric: `${d.pending_deficit} units owed`,
            })),
        },
        {
            key: "stale_machines",
            label: "Stale Machines",
            description: `Machines not serviced in over ${STALE_MACHINE_DAYS} days — possible offline units or lost coverage.`,
            severity: "warning",
            count: staleMachines.length,
            drillHref: "/admin/machine-stock",
            drillLabel: "View machines",
            rows: staleMachines
                .map((m) => ({ m, last: staleMaxById.get(m.id) }))
                .sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0))
                .slice(0, SAMPLE)
                .map(({ m, last }) => ({
                    id: `machine-${m.id}`,
                    title: m.location_name,
                    detail: m.district,
                    metric: last ? `last serviced ${ageDays(last)}d ago` : "never serviced",
                })),
        },
        {
            key: "aging_returns",
            label: "Aging Approvals",
            description: `Driver-reported returns and stock pushes awaiting admin action (SLA ${QUEUE_SLA_DAYS}d).`,
            severity:
                pendingReturns.some((r) => ageDays(r.reported_at) >= QUEUE_SLA_DAYS) ||
                pendingAssignments.some((a) => ageDays(a.assigned_at) >= QUEUE_SLA_DAYS)
                    ? "warning"
                    : "info",
            count: pendingReturns.length + pendingAssignments.length,
            drillHref: "/admin/returns",
            drillLabel: "Process queue",
            rows: [
                ...pendingReturns.slice(0, 3).map((r) => ({
                    id: `return-${r.id}`,
                    title: `Return · ${r.item.name}`,
                    detail: `${r.driver?.name ?? "Unknown"} · ${r.reason}`,
                    metric: `${r.quantity} units · ${ageDays(r.reported_at)}d old`,
                })),
                ...pendingAssignments.slice(0, 3).map((a) => ({
                    id: `assign-${a.id}`,
                    title: `Assignment · ${a.item.name}`,
                    detail: a.driver?.name ?? "Unknown",
                    metric: `${a.quantity} units · ${ageDays(a.assigned_at)}d unacked`,
                })),
            ],
        },
    ];

    return categories;
}

/* ========================================================================== */
/* 4. OVERSIGHT SUMMARY (admin accountability)                               */
/* ========================================================================== */

export type ActorActivity = { actorId: number | null; name: string; role: string; count: number };
export type ActionTypeCount = { actionType: string; count: number };
export type SensitiveEvent = {
    id: number;
    actorName: string;
    actorRole: string;
    actionType: string;
    entityType: string;
    entityId: number | null;
    message: string | null;
    timestamp: Date;
};

export type OversightSummary = {
    windowDays: number;
    totalActions: number;
    actorLeaderboard: ActorActivity[];
    actionDistribution: ActionTypeCount[];
    sensitiveEvents: SensitiveEvent[];
};

/** Who-did-what accountability over a rolling 30-day window. */
export async function getOversightSummary(windowDays = 30): Promise<OversightSummary> {
    await requireSuperAdmin();

    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [byActor, byType, sensitiveRaw, admins] = await Promise.all([
        prisma.systemAuditLog.groupBy({
            by: ["actorId", "actorRole"],
            where: { timestamp: { gte: cutoff } },
            _count: { _all: true },
        }),
        prisma.systemAuditLog.groupBy({
            by: ["actionType"],
            where: { timestamp: { gte: cutoff } },
            _count: { _all: true },
        }),
        prisma.systemAuditLog.findMany({
            where: { actionType: { in: [...SENSITIVE_ACTIONS] } },
            orderBy: { timestamp: "desc" },
            take: 15,
        }),
        prisma.admin.findMany({ select: { id: true, name: true, email: true } }),
    ]);

    const adminName = new Map(admins.map((a) => [a.id, a.name || a.email]));
    const resolveActor = (id: number | null, role: string) => {
        if (id == null) return role === "system" ? "System" : "Unknown";
        return adminName.get(id) ?? `#${id}`;
    };

    // Collapse per-(actor,role) rows to per-actor totals.
    const actorMap = new Map<string, ActorActivity>();
    for (const r of byActor) {
        const key = `${r.actorId ?? "null"}`;
        const existing = actorMap.get(key);
        const add = r._count._all;
        if (existing) {
            existing.count += add;
        } else {
            actorMap.set(key, {
                actorId: r.actorId,
                name: resolveActor(r.actorId, r.actorRole),
                role: r.actorRole,
                count: add,
            });
        }
    }
    const actorLeaderboard = Array.from(actorMap.values()).sort((a, b) => b.count - a.count);

    const actionDistribution = byType
        .map((t) => ({ actionType: t.actionType, count: t._count._all }))
        .sort((a, b) => b.count - a.count);

    const totalActions = actionDistribution.reduce((s, t) => s + t.count, 0);

    const sensitiveEvents: SensitiveEvent[] = sensitiveRaw.map((e) => ({
        id: e.id,
        actorName: resolveActor(e.actorId, e.actorRole),
        actorRole: e.actorRole,
        actionType: e.actionType,
        entityType: e.entityType,
        entityId: e.entityId,
        message: e.message,
        timestamp: e.timestamp,
    }));

    return { windowDays, totalActions, actorLeaderboard, actionDistribution, sensitiveEvents };
}
