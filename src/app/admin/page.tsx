export const revalidate = 30; // 30 second background revalidation
import { getWarehouseInventory } from "@/actions/inventory";
import { getWarehouses } from "@/actions/warehouses";
import { getPredictedDepletion } from "@/actions/predictions";
import { getRefillLogsPaginated } from "@/actions/history";
import { getOverviewSnapshot } from "@/actions/overview";
import { auth } from "@/proxy";
import LiveClock from "@/components/LiveClock";
import {
    AlertCircle,
    Activity,
    MapPin,
    Clock,
    CheckCircle2,
    TrendingUp,
    Zap,
    ArrowDownRight,
    Wrench,
    Repeat,
    ShieldCheck,
    Inbox,
    UserCheck,
    Battery,
    ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import prisma from "@/lib/prisma";
import MapVisualWrapper from "@/components/MapVisualWrapper";
import KpiCard from "@/components/KpiCard";
import { Money } from "@/components/RiyalSymbol";
import { formatSaudiDate, formatSaudiTime, startOfRiyadhDay } from "@/lib/utils";
import type { OverviewSnapshot, AttentionAssignment, AttentionReturn, AtRiskMachine } from "@/actions/overview";

export default async function AdminDashboard() {
    const startOfDay = startOfRiyadhDay();
    // YYYY-MM-DD in Riyadh — used as the dateFrom filter for the activity feed
    const startOfDayISO = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
        session,
        snapshot,
        warehouses,
        machines,
        warehousesWithStats,
        recentActivityPaginated,
        systemAuditLogs,
        predictions,
        recentLogsForSales,
        admins,
        drivers,
    ] = await Promise.all([
        auth(),
        getOverviewSnapshot(),
        getWarehouses(),
        prisma.machine.findMany({
            include: {
                RefillLogs: {
                    take: 5,
                    orderBy: { refilled_at: "desc" },
                    include: { item: true },
                },
                Stock: { include: { item: true } },
            },
        }),
        prisma.warehouse.findMany({
            include: {
                Stock: true,
                Dispatches: { where: { status: "OPEN" } },
            },
            orderBy: { id: "asc" },
        }),
        // Pull a wider window so the per-machine grouping below has enough
        // rows to collapse — a single refill session emits one row per item.
        getRefillLogsPaginated({ page: 1, pageSize: 50, dateFrom: startOfDayISO }),
        prisma.systemAuditLog.findMany({
            where: { timestamp: { gte: startOfDay } },
            orderBy: { timestamp: "desc" },
            take: 12,
        }),
        getPredictedDepletion(),
        prisma.refillLog.findMany({
            where: { refilled_at: { gte: sevenDaysAgo } },
            include: { item: true },
        }),
        prisma.admin.findMany({ select: { id: true, name: true, email: true } }),
        prisma.driver.findMany({ select: { id: true, name: true } }),
    ]);

    const adminNames = new Map(admins.map((a) => [a.id, a.name?.split(" ")[0] || a.email.split("@")[0]] as const));
    const driverNames = new Map(drivers.map((d) => [d.id, d.name.split(" ")[0]] as const));

    // Resolve driver context for StockAssignment-targeted audit rows so we can
    // say "Sarah's assignment" instead of "an assignment".
    const assignmentIds = systemAuditLogs
        .filter((a) => a.entityType === "StockAssignment" && a.entityId != null)
        .map((a) => a.entityId as number);
    const assignmentDriverMap = new Map<number, number>();
    if (assignmentIds.length > 0) {
        const rows = await prisma.stockAssignment.findMany({
            where: { id: { in: assignmentIds } },
            select: { id: true, driverId: true },
        });
        rows.forEach((r) => assignmentDriverMap.set(r.id, r.driverId));
    }

    const {
        revenueToday,
        refillsToday,
        distinctDriversToday,
        machinesAtRiskCount,
        pendingReturnsCount,
        pendingAssignmentsCount,
        pendingAssignmentRows,
        pendingReturnRows,
        atRiskMachineRows,
    }: OverviewSnapshot = snapshot;

    // 7-day product velocity
    const itemSales: Record<number, { name: string; quantity: number; category: string; price: number }> = {};
    recentLogsForSales.forEach((log) => {
        if (!itemSales[log.itemId]) {
            itemSales[log.itemId] = {
                name: log.item.name,
                quantity: 0,
                category: log.item.category,
                price: log.item.price_standard,
            };
        }
        itemSales[log.itemId].quantity += log.items_sold_since_last_refill || 0;
    });
    const topSellingItems = Object.values(itemSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 4);

    // Today's activity timeline
    type TimelineEvent = {
        id: string;
        title: string;
        timestamp: Date;
        description: React.ReactNode;
        icon: React.ReactNode;
        colorClass: string;
        // Used to merge consecutive identical events into a single row with a count.
        groupKey?: string;
        count?: number;
        // Re-render the line when count > 1. Receives the merged count.
        pluralBody?: (count: number) => string;
    };
    const timelineEvents: TimelineEvent[] = [];

    // Bucket refill rows by (driver, machine, 10-min window). One physical
    // refill session emits N rows (one per item slot); the admin perceives it
    // as a single event, so collapse before rendering.
    type RefillBucket = {
        driverName: string;
        machineName: string;
        machineId: number;
        totalUnits: number;
        itemCount: number;
        latest: Date;
    };
    const REFILL_BUCKET_MS = 10 * 60 * 1000;
    const refillBuckets = new Map<string, RefillBucket>();

    recentActivityPaginated.data.forEach((log: any) => {
        if (log.isSurplusReturn) {
            timelineEvents.push({
                id: `ret_${log.id}`,
                title: "Driver Return",
                timestamp: log.refilled_at,
                colorClass: "text-accent-orange",
                icon: <ArrowDownRight className="w-3 h-3 text-accent-orange" />,
                description: (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        <span className="text-accent-blue font-bold">{log.driver?.name || "Driver"}</span>{" "}
                        returned
                        <span className="text-slate-900 dark:text-white mx-1 font-mono">
                            {log.expired_quantity} units
                        </span>
                        to warehouse.
                    </p>
                ),
            });
            return;
        }

        const ts = new Date(log.refilled_at);
        const bucketIdx = Math.floor(ts.getTime() / REFILL_BUCKET_MS);
        const key = `${log.driverId ?? "sys"}:${log.machineId}:${bucketIdx}`;
        const existing = refillBuckets.get(key);
        if (existing) {
            existing.totalUnits += log.quantity_refilled || 0;
            existing.itemCount += 1;
            if (ts > existing.latest) existing.latest = ts;
        } else {
            refillBuckets.set(key, {
                driverName: log.driver?.name || "System",
                machineName: log.machine?.location_name || "Unknown",
                machineId: log.machineId,
                totalUnits: log.quantity_refilled || 0,
                itemCount: 1,
                latest: ts,
            });
        }
    });

    refillBuckets.forEach((b, key) => {
        timelineEvents.push({
            id: `refgrp_${key}`,
            title: "Machine Restocked",
            timestamp: b.latest,
            colorClass: "text-accent-purple",
            icon: <CheckCircle2 className="w-3 h-3 text-accent-purple" />,
            description: (
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <span className="text-accent-blue font-bold">{b.driverName}</span>{" "}
                    refilled
                    <span className="text-slate-900 dark:text-white mx-1 font-mono">
                        {b.totalUnits} units
                    </span>
                    {b.itemCount > 1 && (
                        <span className="text-slate-500 dark:text-slate-400">
                            across {b.itemCount} items{" "}
                        </span>
                    )}
                    at {b.machineName}{" "}
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                        #{b.machineId}
                    </span>
                    .
                </p>
            ),
        });
    });

    // Audit rows that just shadow what the refill/return feed already shows.
    // Hiding them here keeps the overview a glance card; the full audit log
    // page still surfaces them.
    const REDUNDANT_AUDIT_TYPES = new Set([
        "LOG_BATCH_REFILL",
        "LOG_REFILL",
        "SUBMIT_UNVERIFIED_RETURN",
        "EDIT_UNVERIFIED_RETURN",
    ]);

    systemAuditLogs.forEach((audit) => {
        if (REDUNDANT_AUDIT_TYPES.has(audit.actionType)) return;
        const actorRole = (audit.actorRole || "").toLowerCase();
        const isDriverActor = actorRole === "driver";
        const isAdminActor = actorRole === "admin" || actorRole === "super_admin";
        const actorName =
            (isDriverActor && audit.actorId != null && driverNames.get(audit.actorId)) ||
            (isAdminActor && audit.actorId != null && adminNames.get(audit.actorId)) ||
            (isAdminActor ? "An admin" : isDriverActor ? "A driver" : "System");

        // Try to surface the relevant driver name when the entity is driver-scoped.
        let targetDriver: string | undefined;
        if (audit.entityType === "Driver" && audit.entityId != null) {
            targetDriver = driverNames.get(audit.entityId);
        } else if (audit.entityType === "StockAssignment" && audit.entityId != null) {
            const did = assignmentDriverMap.get(audit.entityId);
            if (did != null) targetDriver = driverNames.get(did);
        }

        const newState = (audit.newState as any) || {};
        const oldState = (audit.oldState as any) || {};

        // entityName: a short label for things like items, machines, warehouses
        const entityName: string | undefined =
            newState?.name ||
            newState?.location_name ||
            oldState?.name ||
            oldState?.location_name;

        let title = "System Action";
        let body = "";
        let pluralBody: ((n: number) => string) | undefined;
        let icon = <Wrench className="w-3 h-3 text-slate-400" />;
        let colorClass = "text-slate-400";
        // Group key collapses repeats from the same actor performing the same
        // action against the same target. Anything sharing a key within
        // ~30min becomes one row with a count.
        const targetKey = audit.entityType === "StockAssignment"
            ? `drv:${assignmentDriverMap.get(audit.entityId ?? -1) ?? "?"}`
            : audit.entityType === "Driver"
            ? `drv:${audit.entityId ?? "?"}`
            : `${audit.entityType}:${audit.entityId ?? "?"}`;
        let groupKey: string | undefined = `${audit.actionType}:${audit.actorId ?? "?"}:${targetKey}`;

        switch (audit.actionType) {
            case "ASSIGN_STOCK": {
                title = "Stock Assigned";
                colorClass = "text-accent-blue";
                icon = <UserCheck className="w-3 h-3 text-accent-blue" />;
                const items = Array.isArray(newState?.items) ? newState.items : [];
                const totalQty = items.reduce((s: number, i: any) => s + (Number(i?.quantity) || 0), 0);
                const lines = items.length;
                body = `${actorName} assigned ${totalQty || lines} ${totalQty ? "unit" : "item"}${
                    (totalQty || lines) === 1 ? "" : "s"
                } to ${targetDriver || "a driver"}.`;
                break;
            }
            case "ACK_ASSIGNMENT":
                title = "Driver Acknowledged";
                colorClass = "text-accent-green";
                icon = <CheckCircle2 className="w-3 h-3 text-accent-green" />;
                body = `${actorName} acknowledged 1 assignment.`;
                pluralBody = (n) => `${actorName} acknowledged ${n} assignments.`;
                break;
            case "DENY_ASSIGNMENT":
                title = "Driver Denied";
                colorClass = "text-accent-pink";
                icon = <AlertCircle className="w-3 h-3 text-accent-pink" />;
                body = `${actorName} denied 1 assignment.`;
                pluralBody = (n) => `${actorName} denied ${n} assignments.`;
                break;
            case "DISMISS_ASSIGNMENT":
                title = "Assignment Dismissed";
                body = `${actorName} dismissed ${targetDriver ? `${targetDriver}'s` : "a"} denied assignment.`;
                pluralBody = (n) =>
                    `${actorName} dismissed ${n} ${targetDriver ? `${targetDriver}'s` : ""} denied assignments.`;
                break;
            case "DRIVER_RETURN_SUBMIT":
                title = "Driver Submitted Return";
                colorClass = "text-accent-orange";
                icon = <ArrowDownRight className="w-3 h-3 text-accent-orange" />;
                body = `${actorName} submitted a return.`;
                pluralBody = (n) => `${actorName} submitted ${n} returns.`;
                break;
            case "APPROVE_RETURN":
                title = "Return Approved";
                colorClass = "text-accent-green";
                icon = <ShieldCheck className="w-3 h-3 text-accent-green" />;
                body = `${actorName} approved a return.`;
                pluralBody = (n) => `${actorName} approved ${n} returns.`;
                break;
            case "REJECT_RETURN":
                title = "Return Rejected";
                colorClass = "text-accent-pink";
                icon = <ShieldCheck className="w-3 h-3 text-accent-pink" />;
                body = `${actorName} rejected a return.`;
                pluralBody = (n) => `${actorName} rejected ${n} returns.`;
                break;
            case "LOG_BATCH_REFILL":
                title = "Refill Logged";
                colorClass = "text-accent-purple";
                icon = <CheckCircle2 className="w-3 h-3 text-accent-purple" />;
                body = `${actorName} logged a refill${targetDriver ? ` for ${targetDriver}` : ""}.`;
                pluralBody = (n) =>
                    `${actorName} logged ${n} refills${targetDriver ? ` for ${targetDriver}` : ""}.`;
                break;
            case "LOG_REFILL":
                title = "Refill Logged";
                colorClass = "text-accent-purple";
                icon = <CheckCircle2 className="w-3 h-3 text-accent-purple" />;
                body = `${actorName} logged a machine refill.`;
                pluralBody = (n) => `${actorName} logged ${n} machine refills.`;
                break;
            case "CREATE_DISPATCH":
                title = "Dispatch Created";
                body = `${actorName} dispatched stock${targetDriver ? ` to ${targetDriver}` : ""}.`;
                break;
            case "SUBMIT_UNVERIFIED_RETURN":
                title = "Return Submitted";
                body = `${actorName} submitted an unverified return.`;
                break;
            case "EDIT_UNVERIFIED_RETURN":
                title = "Return Edited";
                body = `${actorName} edited a pending return.`;
                break;
            case "UPDATE_ITEM":
                title = "Item Updated";
                body = `${actorName} updated item${entityName ? ` ${entityName}` : ""}.`;
                break;
            case "CREATE_QUICK_ITEM":
                title = "Item Added";
                body = `${actorName} added item${entityName ? ` ${entityName}` : ""}.`;
                break;
            case "UPDATE_MACHINE":
                title = "Machine Updated";
                body = `${actorName} updated machine${entityName ? ` ${entityName}` : ""}.`;
                break;
            case "DELETE_MACHINE":
                title = "Machine Deleted";
                body = `${actorName} deleted machine${entityName ? ` ${entityName}` : ""}.`;
                break;
            case "CREATE_WAREHOUSE":
                title = "Warehouse Added";
                body = `${actorName} added warehouse${entityName ? ` ${entityName}` : ""}.`;
                break;
            case "UPDATE_WAREHOUSE":
                title = "Warehouse Updated";
                body = `${actorName} updated warehouse${entityName ? ` ${entityName}` : ""}.`;
                break;
            case "DELETE_WAREHOUSE":
                title = "Warehouse Deleted";
                body = `${actorName} deleted warehouse${entityName ? ` ${entityName}` : ""}.`;
                break;
            case "CREATE_PURCHASE_ORDER":
                title = "PO Created";
                body = `${actorName} created a purchase order.`;
                break;
            case "COMPLETE_PURCHASE_ORDER":
                title = "PO Received";
                colorClass = "text-accent-green";
                icon = <CheckCircle2 className="w-3 h-3 text-accent-green" />;
                body = `${actorName} marked a purchase order received.`;
                break;
            case "CANCEL_PURCHASE_ORDER":
                title = "PO Cancelled";
                body = `${actorName} cancelled a purchase order.`;
                break;
            case "CHANGE_DRIVER_PIN":
                title = "Driver PIN Changed";
                body = `${actorName} changed ${targetDriver ? `${targetDriver}'s` : "a driver"} PIN.`;
                break;
            default: {
                const pretty = audit.actionType
                    .replace(/_/g, " ")
                    .toLowerCase()
                    .replace(/\b\w/g, (l) => l.toUpperCase());
                title = pretty;
                body = `${actorName} performed ${pretty.toLowerCase()}.`;
                groupKey = undefined;
                break;
            }
        }

        timelineEvents.push({
            id: `aud_${audit.id}`,
            title,
            timestamp: audit.timestamp,
            colorClass,
            icon,
            count: 1,
            groupKey,
            pluralBody,
            description: (
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{body}</p>
            ),
        });
    });

    timelineEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Collapse runs of consecutive same-key events (e.g. "Chito acknowledged"
    // 20 times in a row) into a single row with a count. The 30-min window
    // keeps unrelated bursts from merging if a key happens to repeat hours
    // later.
    const mergedTimeline: TimelineEvent[] = [];
    const COLLAPSE_WINDOW_MS = 30 * 60 * 1000;
    for (const ev of timelineEvents) {
        const last = mergedTimeline[mergedTimeline.length - 1];
        if (
            last &&
            ev.groupKey &&
            last.groupKey === ev.groupKey &&
            last.timestamp.getTime() - ev.timestamp.getTime() <= COLLAPSE_WINDOW_MS
        ) {
            last.count = (last.count ?? 1) + 1;
            if (last.pluralBody) {
                const merged = last.pluralBody(last.count);
                last.description = (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {merged}
                    </p>
                );
            }
            continue;
        }
        mergedTimeline.push({ ...ev });
    }

    const recentTimeline = mergedTimeline.slice(0, 8);

    const today = formatSaudiDate(new Date(), {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    // Compute greeting from current Asia/Riyadh hour
    const riyadhHourStr = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Riyadh",
        hour: "2-digit",
        hour12: false,
    });
    const riyadhHour = parseInt(riyadhHourStr, 10);
    const greeting =
        riyadhHour >= 5 && riyadhHour < 12
            ? "Good morning"
            : riyadhHour >= 12 && riyadhHour < 17
            ? "Good afternoon"
            : riyadhHour >= 17 && riyadhHour < 22
            ? "Good evening"
            : "Working late";

    const adminName = (session?.user?.name as string | undefined)?.split(" ")[0] ?? "Admin";

    return (
        <div className="space-y-6 md:space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-6 md:pb-20">

            {/* Header — orientation, not data. On a phone the greeting and the
                clock sit on one row: stacked at the old sizes they burned ~180px
                of a 780px viewport to say nothing the user didn't know. */}
            <div className="flex flex-row items-end justify-between gap-3 md:gap-4 py-1 md:py-4">
                <div className="min-w-0">
                    <h1 className="text-2xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight truncate">
                        {greeting},{" "}
                        <span className="text-accent-blue">{adminName}</span>
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 md:mt-2 truncate">
                        {today}
                    </p>
                </div>
                <div className="md:text-right shrink-0">
                    <LiveClock />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <KpiCard
                    href="/admin/analytics"
                    title="REVENUE TODAY"
                    value={<Money amount={revenueToday} decimals={0} />}
                    subtitle="Sales reported today"
                    icon={<Activity className="w-7 h-7 text-accent-green" />}
                    color="text-accent-green"
                    glowClass="hover:border-accent-green/30 dark:hover:shadow-[0_0_30px_rgba(34,197,94,0.3)]"
                />
                <KpiCard
                    href="/admin/history"
                    title="REFILLS TODAY"
                    value={refillsToday.toString()}
                    subtitle={`${distinctDriversToday} driver${distinctDriversToday === 1 ? "" : "s"} active`}
                    icon={<Repeat className="w-7 h-7 text-accent-blue" />}
                    color="text-accent-blue"
                    glowClass="hover:border-accent-blue/30 dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]"
                />
                <KpiCard
                    href="/admin/machine-stock"
                    title="MACHINES AT RISK"
                    value={machinesAtRiskCount.toString()}
                    subtitle="Predicted to run dry < 24h"
                    icon={<Battery className="w-7 h-7 text-accent-pink" />}
                    color="text-accent-pink"
                    alert={machinesAtRiskCount > 0}
                    glowClass="hover:border-accent-pink/30 dark:hover:shadow-[0_0_30px_rgba(236,72,153,0.3)]"
                />
                <KpiCard
                    href="/admin/returns"
                    title="PENDING RETURNS"
                    value={pendingReturnsCount.toString()}
                    subtitle="Awaiting verification"
                    icon={<ShieldCheck className="w-7 h-7 text-accent-orange" />}
                    color="text-accent-orange"
                    alert={pendingReturnsCount > 0}
                    glowClass="hover:border-accent-orange/30 dark:hover:shadow-[0_0_30px_rgba(255,165,0,0.3)]"
                />
            </div>

            {/* Main grid: Map + Velocity (2/3) | Attention + Activity (1/3).
                The columns swap order below `lg`: on a phone the work queue is
                what the admin opened the page for, and the fleet map — the least
                useful thing on a 390px screen — shouldn't be the wall they scroll
                past to reach it. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

                {/* Left: 2/3 */}
                <div className="lg:col-span-2 space-y-4 sm:space-y-6 order-2 lg:order-1">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-accent-blue" />
                            Live Fleet Map
                        </h2>
                    </div>
                    <MapVisualWrapper
                        machines={machines}
                        predictions={predictions}
                        warehouses={warehousesWithStats}
                    />

                    <div className="glass-panel p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] border-slate-200 dark:border-white/5 bg-gradient-to-br from-slate-100 dark:from-black/40 to-white/5">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-4 sm:mb-6">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            Product Velocity (7D)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {topSellingItems.length > 0 ? (
                                topSellingItems.map((item, i) => (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:bg-white/10 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                                <Zap className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                                                    {item.name}
                                                </p>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                                    {item.category}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                                                +{item.quantity}
                                            </p>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                                Units Sold
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="md:col-span-2 py-10 text-center text-slate-500 dark:text-slate-400 text-xs">
                                    No sales data in the last 7 days.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: 1/3 */}
                <div className="space-y-6 lg:space-y-8 order-1 lg:order-2">

                    {/* Needs your attention */}
                    <AttentionPanel
                        assignments={pendingAssignmentRows}
                        assignmentsTotal={pendingAssignmentsCount}
                        returns={pendingReturnRows}
                        returnsTotal={pendingReturnsCount}
                        atRisk={atRiskMachineRows}
                        atRiskTotal={machinesAtRiskCount}
                    />

                    {/* Today's Activity */}
                    <div className="glass-panel border-slate-200 dark:border-white/5 p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] shadow-xl flex-1 flex flex-col bg-gradient-to-t from-white/5 to-transparent">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-4 sm:mb-6">
                            <Clock className="w-4 h-4 text-accent-purple" />
                            Today&apos;s Activity
                        </h3>

                        <div className="flex-1 relative">
                            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200 dark:bg-white/10"></div>

                            <div className="space-y-4 relative z-10">
                                {recentTimeline.map((event) => (
                                    <div key={event.id} className="flex gap-4 group/timeline">
                                        <div className="mt-1 flex-shrink-0">
                                            <div
                                                className={`w-6 h-6 rounded-full bg-white dark:bg-black border-2 border-slate-200 dark:border-white/10 flex flex-col items-center justify-center group-hover/timeline:border-current group-hover/timeline:shadow-[0_0_10px_currentColor] transition-all ${event.colorClass}`}
                                            >
                                                {event.icon}
                                            </div>
                                        </div>
                                        <div className="flex-1 -mt-1">
                                            <div className="flex justify-between items-start mb-1">
                                                <p
                                                    className={`text-sm font-semibold text-slate-900 dark:text-white group-hover/timeline:text-current transition-colors ${event.colorClass} flex items-center gap-2`}
                                                >
                                                    {event.title}
                                                    {(event.count ?? 1) > 1 && (
                                                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                                                            ×{event.count}
                                                        </span>
                                                    )}
                                                </p>
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                                                    {Date.now() - event.timestamp.getTime() < 60 * 60 * 1000
                                                        ? relativeAge(event.timestamp)
                                                        : formatSaudiTime(event.timestamp, { timeStyle: "short" })}
                                                </span>
                                            </div>
                                            {event.description}
                                        </div>
                                    </div>
                                ))}

                                {recentTimeline.length === 0 && (
                                    <div className="text-center text-slate-500 dark:text-slate-400 text-xs py-8 border border-slate-200 dark:border-white/5 rounded-2xl border-dashed">
                                        No activity yet today.
                                    </div>
                                )}
                            </div>
                        </div>

                        <Link href="/admin/history" className="mt-6 sm:mt-8 w-full block">
                            <button className="w-full py-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest transition-all border border-slate-200 dark:border-white/5">
                                View Full Audit Log
                            </button>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Components ---

function relativeAge(date: Date): string {
    const ms = Date.now() - new Date(date).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function AttentionPanel({
    assignments,
    assignmentsTotal,
    returns,
    returnsTotal,
    atRisk,
    atRiskTotal,
}: {
    assignments: AttentionAssignment[];
    assignmentsTotal: number;
    returns: AttentionReturn[];
    returnsTotal: number;
    atRisk: AtRiskMachine[];
    atRiskTotal: number;
}) {
    const total = assignmentsTotal + returnsTotal + atRiskTotal;

    return (
        <div className="glass-panel border-slate-200 dark:border-white/5 p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] shadow-xl bg-gradient-to-b from-white/5 to-transparent">
            <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-4 sm:mb-6">
                <Inbox className="w-4 h-4 text-accent-pink" />
                Needs your attention
                {total > 0 && (
                    <span className="ml-auto text-[10px] font-mono font-bold text-accent-pink bg-accent-pink/10 px-2 py-0.5 rounded-full">
                        {total}
                    </span>
                )}
            </h3>

            {total === 0 ? (
                <div className="py-10 flex flex-col items-center text-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">All clear</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        No pending acks, returns, or at-risk machines.
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {atRiskTotal > 0 && (
                        <AttentionSection
                            icon={<Battery className="w-3.5 h-3.5 text-accent-pink" />}
                            label="Machines running low"
                            count={atRiskTotal}
                            shown={atRisk.length}
                            href="/admin/machine-stock"
                        >
                            {atRisk.map((m) => (
                                <Link
                                    key={m.machineId}
                                    href={`/admin/machine-stock`}
                                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:bg-accent-pink/5 hover:border-accent-pink/20 transition-all"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                            {m.machineName}
                                        </p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                            {m.itemName} • {m.district}
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-mono font-bold text-accent-pink whitespace-nowrap">
                                        {m.hoursUntilEmpty.toFixed(1)}h
                                    </span>
                                </Link>
                            ))}
                        </AttentionSection>
                    )}

                    {assignmentsTotal > 0 && (
                        <AttentionSection
                            icon={<UserCheck className="w-3.5 h-3.5 text-accent-blue" />}
                            label="Pending driver acks"
                            count={assignmentsTotal}
                            shown={assignments.length}
                            href="/admin/driver-stock"
                        >
                            {assignments.map((a) => (
                                <Link
                                    key={a.id}
                                    href="/admin/driver-stock"
                                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:bg-accent-blue/5 hover:border-accent-blue/20 transition-all"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                            {a.driverName}
                                        </p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                            {a.quantity} × {a.itemName}
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {relativeAge(a.assigned_at)}
                                    </span>
                                </Link>
                            ))}
                        </AttentionSection>
                    )}

                    {returnsTotal > 0 && (
                        <AttentionSection
                            icon={<ShieldCheck className="w-3.5 h-3.5 text-accent-orange" />}
                            label="Returns to verify"
                            count={returnsTotal}
                            shown={returns.length}
                            href="/admin/returns"
                        >
                            {returns.map((r) => (
                                <Link
                                    key={r.id}
                                    href="/admin/returns"
                                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:bg-accent-orange/5 hover:border-accent-orange/20 transition-all"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                            {r.driverName}
                                        </p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                            {r.quantity} × {r.itemName} • {r.reason}
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {relativeAge(r.reported_at)}
                                    </span>
                                </Link>
                            ))}
                        </AttentionSection>
                    )}
                </div>
            )}
        </div>
    );
}

function AttentionSection({
    icon,
    label,
    count,
    shown,
    href,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    count: number;
    shown: number;
    href: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {label}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                        ({count})
                    </span>
                </div>
                {count > shown && (
                    <Link
                        href={href}
                        className="text-[10px] font-bold text-accent-blue hover:underline flex items-center gap-1"
                    >
                        View all
                        <ArrowUpRight className="w-3 h-3" />
                    </Link>
                )}
            </div>
            <div className="space-y-2">{children}</div>
        </div>
    );
}
