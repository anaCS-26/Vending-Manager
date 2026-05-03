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
        getRefillLogsPaginated({ page: 1, pageSize: 8, dateFrom: startOfDayISO }),
        prisma.systemAuditLog.findMany({
            where: { timestamp: { gte: startOfDay } },
            orderBy: { timestamp: "desc" },
            take: 8,
        }),
        getPredictedDepletion(),
        prisma.refillLog.findMany({
            where: { refilled_at: { gte: sevenDaysAgo } },
            include: { item: true },
        }),
    ]);

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
    };
    const timelineEvents: TimelineEvent[] = [];

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
        } else {
            timelineEvents.push({
                id: `ref_${log.id}`,
                title: "Machine Restocked",
                timestamp: log.refilled_at,
                colorClass: "text-accent-purple",
                icon: <CheckCircle2 className="w-3 h-3 text-accent-purple" />,
                description: (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        <span className="text-accent-blue font-bold">{log.driver?.name || "System"}</span>{" "}
                        refilled
                        <span className="text-slate-900 dark:text-white mx-1 font-mono">
                            {log.quantity_refilled} units
                        </span>
                        at {log.machine?.location_name || "Unknown"}.
                    </p>
                ),
            });
        }
    });

    systemAuditLogs.forEach((audit) => {
        let title = "System Action";
        let desc = "An administrative action was performed.";
        switch (audit.actionType) {
            case "CREATE_DISPATCH":
                title = "Dispatch Created";
                desc = "A new dispatch was issued to a driver.";
                break;
            case "UPDATE_ITEM":
                title = "Item Updated";
                desc = "Catalog item details were modified.";
                break;
            case "APPROVE_RETURN":
                title = "Return Verified";
                desc = "An inventory return was successfully verified.";
                break;
            case "LOG_BATCH_REFILL":
                title = "Admin Logged Refill";
                desc = "Admin manually logged an inventory refill.";
                break;
            case "UPDATE_MACHINE":
                title = "Machine Updated";
                desc = "Machine configuration was modified.";
                break;
            case "UPDATE_WAREHOUSE":
                title = "Warehouse Updated";
                desc = "Warehouse configuration was modified.";
                break;
            default:
                title = audit.actionType
                    .replace(/_/g, " ")
                    .toLowerCase()
                    .replace(/\b\w/g, (l) => l.toUpperCase());
                break;
        }
        timelineEvents.push({
            id: `aud_${audit.id}`,
            title,
            timestamp: audit.timestamp,
            colorClass: "text-slate-400",
            icon: <Wrench className="w-3 h-3 text-slate-400" />,
            description: (
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <span className="text-slate-900 dark:text-white font-bold">
                        {audit.actorRole === "super_admin" ? "Admin" : "System"}
                    </span>
                    : {desc}
                </p>
            ),
        });
    });

    timelineEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const recentTimeline = timelineEvents.slice(0, 8);

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
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">

            {/* Header — orientation, not data */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 py-4">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                        {greeting},{" "}
                        <span className="text-accent-blue">{adminName}</span>
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                        {today}
                    </p>
                </div>
                <div className="md:text-right">
                    <LiveClock />
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    href="/admin/analytics"
                    title="REVENUE TODAY"
                    value={`⃁ ${revenueToday.toLocaleString()}`}
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

            {/* Main grid: Map + Velocity (2/3) | Attention + Activity (1/3) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left: 2/3 */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-accent-blue" />
                            Live Fleet Map
                        </h2>
                    </div>
                    <MapVisualWrapper
                        machines={machines}
                        predictions={predictions}
                        warehouses={warehousesWithStats}
                    />

                    <div className="glass-panel p-6 rounded-[2rem] border-slate-200 dark:border-white/5 bg-gradient-to-br from-slate-100 dark:from-black/40 to-white/5">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
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
                <div className="space-y-8">

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
                    <div className="glass-panel border-slate-200 dark:border-white/5 p-6 rounded-[2rem] shadow-xl flex-1 flex flex-col bg-gradient-to-t from-white/5 to-transparent">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                            <Clock className="w-4 h-4 text-accent-purple" />
                            Today&apos;s Activity
                        </h3>

                        <div className="flex-1 relative">
                            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200 dark:bg-white/10"></div>

                            <div className="space-y-6 relative z-10">
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
                                                    className={`text-sm font-semibold text-slate-900 dark:text-white group-hover/timeline:text-current transition-colors ${event.colorClass}`}
                                                >
                                                    {event.title}
                                                </p>
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                                    {formatSaudiTime(event.timestamp, { timeStyle: "short" })}
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

                        <Link href="/admin/history" className="mt-8 w-full block">
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

function KpiCard({
    href,
    title,
    value,
    subtitle,
    icon,
    color,
    alert = false,
    glowClass,
}: {
    href: string;
    title: string;
    value: string;
    subtitle: string;
    icon: React.ReactNode;
    color: string;
    alert?: boolean;
    glowClass: string;
}) {
    return (
        <Link href={href} className="group block">
            <div
                className={`glass-panel border border-slate-200 dark:border-white/10 rounded-[2.5rem] p-6 relative overflow-hidden transition-all duration-500 group-hover:-translate-y-2 ${glowClass}`}
            >
                <div className="absolute -top-4 -right-4 p-8 opacity-5 transition-all duration-500 group-hover:opacity-10 group-hover:scale-150 rotate-12">
                    {icon}
                </div>
                <div className="relative z-10">
                    <div
                        className={`w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mb-6 transition-all duration-300 ${
                            alert ? "border-accent-pink/50 bg-accent-pink/10 shadow-[0_0_20px_rgba(236,72,153,0.2)]" : ""
                        }`}
                    >
                        {icon}
                    </div>
                    <h3 className="text-slate-500 dark:text-slate-400 font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-1">
                        {title}
                    </h3>
                    <div className={`text-4xl font-black tracking-tighter transition-colors duration-300 ${color}`}>
                        {value}
                    </div>
                    <div
                        className={`flex items-center gap-1.5 text-[10px] mt-4 font-mono font-bold ${
                            alert ? "text-accent-pink" : "text-slate-500 dark:text-slate-400"
                        }`}
                    >
                        <div
                            className={`w-1 h-1 rounded-full ${
                                alert ? "bg-accent-pink animate-pulse" : "bg-slate-700"
                            }`}
                        />
                        {subtitle}
                    </div>
                </div>
            </div>
        </Link>
    );
}

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
        <div className="glass-panel border-slate-200 dark:border-white/5 p-6 rounded-[2rem] shadow-xl bg-gradient-to-b from-white/5 to-transparent">
            <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
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
