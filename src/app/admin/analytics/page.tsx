export const revalidate = 60; // Revalidate every minute for background updating
import prisma from "@/lib/prisma";
import {
    Package, TrendingUp, Users, MapPin, AlertTriangle, CheckCircle2,
    Activity, ShieldCheck, Target, ArrowUp, ArrowDown, Minus,
    DollarSign, BarChart3, Database
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import AnalyticsDashboardClient from "@/components/AnalyticsDashboardClient";
import TabbedContainer from "@/components/TabbedContainer";

type PulseTotals = { revenue: number; cost: number; items: number; shrinkage: number };

function summarizeWindow(
    refills: { sales_revenue: number; cost_at_refill: number; items_sold_since_last_refill: number | null }[],
    returns: { quantity: number; item: { cost: number } }[]
): PulseTotals {
    const t: PulseTotals = { revenue: 0, cost: 0, items: 0, shrinkage: 0 };
    refills.forEach(r => {
        t.revenue += r.sales_revenue;
        t.cost += r.cost_at_refill * (r.items_sold_since_last_refill || 0);
        t.items += r.items_sold_since_last_refill || 0;
    });
    returns.forEach(r => { t.shrinkage += r.quantity * r.item.cost; });
    return t;
}

function deltaPct(curr: number, prev: number): number | null {
    if (prev === 0) return curr === 0 ? 0 : null; // null => "no comparison" rather than fake 100%
    return ((curr - prev) / prev) * 100;
}

// Small chip that shows week-over-week change in plain language.
// `lowerIsBetter` flips the color logic for metrics like shrinkage where a drop is good.
function WoWChip({ delta, lowerIsBetter = false, suffix = "%" }: { delta: number | null; lowerIsBetter?: boolean; suffix?: string }) {
    if (delta === null) {
        return (
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Minus className="w-3 h-3" /> No data last week
            </div>
        );
    }
    const rounded = Math.abs(delta) < 0.1 ? 0 : delta;
    const isFlat = rounded === 0;
    const isUp = rounded > 0;
    const isGood = isFlat ? null : (lowerIsBetter ? !isUp : isUp);
    const colorClass = isFlat
        ? "text-slate-500 dark:text-slate-400"
        : isGood ? "text-accent-green" : "text-accent-pink";
    const Icon = isFlat ? Minus : (isUp ? ArrowUp : ArrowDown);
    const sign = isFlat ? "" : (isUp ? "+" : "");
    return (
        <div className={`flex items-center gap-1 text-[11px] font-semibold ${colorClass}`}>
            <Icon className="w-3 h-3" />
            <span>{sign}{rounded.toFixed(1)}{suffix} vs last week</span>
        </div>
    );
}

export default async function AnalyticsPage() {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    // Parallelize all initial database fetches
    const [
        allRefills, items, machineRefills, machines, drivers, machinesData,
        recentRefills, recentReturns, prevRefills, prevReturns,
        machineStockTotals, deadStock
    ] = await Promise.all([
        prisma.refillLog.groupBy({
            by: ['itemId'],
            _sum: { sales_revenue: true },
            orderBy: { _sum: { sales_revenue: 'desc' } }
        }),
        prisma.item.findMany(),
        prisma.refillLog.groupBy({
            by: ['machineId'],
            _sum: { sales_revenue: true },
            orderBy: { _sum: { sales_revenue: 'desc' } }
        }),
        prisma.machine.findMany(),
        prisma.driver.findMany({
            include: {
                RefillLogs: true,
                ReturnVerifications: {
                    where: { reason: { in: ['DAMAGED', 'EXPIRED'] } },
                    include: { item: { select: { cost: true } } }
                }
            }
        }),
        prisma.machine.findMany({
            include: { RefillLogs: { include: { item: true } } }
        }),
        // Pulse: current window (last 7 days)
        prisma.refillLog.findMany({
            where: { refilled_at: { gte: sevenDaysAgo } },
            select: { sales_revenue: true, cost_at_refill: true, items_sold_since_last_refill: true }
        }),
        prisma.returnVerification.findMany({
            where: { reported_at: { gte: sevenDaysAgo }, reason: { in: ['DAMAGED', 'EXPIRED'] } },
            include: { item: { select: { cost: true } } }
        }),
        // Pulse: previous window (7-14 days ago) for week-over-week comparison
        prisma.refillLog.findMany({
            where: { refilled_at: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
            select: { sales_revenue: true, cost_at_refill: true, items_sold_since_last_refill: true }
        }),
        prisma.returnVerification.findMany({
            where: { reported_at: { gte: fourteenDaysAgo, lt: sevenDaysAgo }, reason: { in: ['DAMAGED', 'EXPIRED'] } },
            include: { item: { select: { cost: true } } }
        }),
        // Stock totals per machine (for real depletion math)
        prisma.machineStock.groupBy({
            by: ['machineId'],
            _sum: { estimated_stock: true }
        }),
        // Dead Stock Data
        prisma.machineStock.findMany({
            where: { estimated_stock: { gt: 0 } },
            orderBy: { last_refilled_at: 'asc' },
            include: { item: true, machine: true },
            take: 10
        })
    ]);

    // --- Pulse KPIs with week-over-week deltas ---
    const pulse = summarizeWindow(recentRefills, recentReturns);
    const prev = summarizeWindow(prevRefills, prevReturns);

    const pulseMargin = pulse.revenue > 0 ? ((pulse.revenue - pulse.cost) / pulse.revenue) * 100 : 0;
    const prevMargin = prev.revenue > 0 ? ((prev.revenue - prev.cost) / prev.revenue) * 100 : 0;

    const wow = {
        revenue: deltaPct(pulse.revenue, prev.revenue),
        margin: prevMargin === 0 ? null : pulseMargin - prevMargin, // margin delta in percentage points
        items: deltaPct(pulse.items, prev.items),
        shrinkage: deltaPct(pulse.shrinkage, prev.shrinkage)
    };

    // --- Tab 3 & 4 Data (Processing) ---
    const formattedData = allRefills.map(refill => {
        const item = items.find(i => i.id === refill.itemId);
        return {
            name: item?.name || "Unknown",
            sku: item?.sku || "",
            category: item?.category || "Unknown",
            totalRevenue: refill._sum.sales_revenue || 0
        }
    });
    const fastMoving = formattedData.slice(0, 10);

    // --- Tab 2: Machine Demand Data (Processing) ---
    const topMachines = machineRefills.map(mr => {
        const machine = machines.find(m => m.id === mr.machineId);
        return {
            id: mr.machineId,
            name: machine?.location_name || "Unknown Machine",
            district: machine?.district || "",
            totalRevenue: mr._sum.sales_revenue || 0
        };
    }).slice(0, 10);

    // --- Tab 1: Driver Performance Data (Processing) ---
    const driverStats = drivers.map(d => {
        const totalRefilled = d.RefillLogs.reduce((acc, log) => acc + log.quantity_refilled, 0);
        const locationsVisited = new Set(d.RefillLogs.map(log => log.machineId)).size;
        const totalShrinkageValue = d.ReturnVerifications.reduce((acc, ret) => acc + (ret.quantity * ret.item.cost), 0);

        return {
            id: d.id,
            name: d.name,
            totalRefilled,
            locationsVisited,
            shrinkageValue: totalShrinkageValue
        };
    });

    // --- Depletion alerts (real math, not mocked) ---
    // Estimate daily sales velocity from items_sold_since_last_refill in the last 7 days,
    // then divide current machine stock by it. Machines projected to run dry within 7 days surface here.
    const stockByMachine = new Map(
        machineStockTotals.map(s => [s.machineId, s._sum.estimated_stock || 0])
    );
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const predictiveAlerts = machinesData
        .map((m: any) => {
            const last7Sold = m.RefillLogs
                .filter((rl: any) => now - new Date(rl.refilled_at).getTime() < sevenDaysMs)
                .reduce((acc: number, rl: any) => acc + (rl.items_sold_since_last_refill || 0), 0);
            const dailyVelocity = last7Sold / 7;
            const stock = stockByMachine.get(m.id) || 0;
            const daysRemaining = dailyVelocity > 0 ? Math.ceil(stock / dailyVelocity) : Infinity;
            return { ...m, dailyVelocity, stock, daysRemaining };
        })
        .filter((m: any) => m.dailyVelocity > 0 && m.daysRemaining <= 7)
        .sort((a: any, b: any) => a.daysRemaining - b.daysRemaining)
        .slice(0, 3);


    // TAB CONTENT PREPARATION
    const tabData = [
        {
            id: "drivers",
            label: "Drivers",
            icon: <Users className="w-4 h-4" />,
            content: (
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/[0.02]">
                        <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm flex items-center gap-2">
                            <Users className="w-4 h-4 text-accent-purple" />
                            Driver Performance &amp; Losses
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-white/5 p-2 bg-slate-50/50 dark:bg-black/10">
                        {driverStats.map((driver, i) => (
                            <div key={i} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-transparent hover:bg-slate-100 dark:hover:bg-white/[0.04] rounded-xl transition-colors animate-in fade-in slide-in-from-right-4 fill-mode-both" style={{ animationDelay: `${i * 100}ms` }}>
                                <div className="flex items-center gap-4 mb-4 md:mb-0">
                                    <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center text-accent-purple font-bold">
                                        {driver.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                                            {driver.name}
                                        </h4>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                                            {driver.locationsVisited} Locations Serviced
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                                    <div className="text-right">
                                        <div className="text-xl font-bold text-accent-blue">
                                            {driver.totalRefilled}
                                        </div>
                                        <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-end mt-0.5">
                                            <Package className="w-3 h-3 text-slate-400" /> Units Refilled
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-xl font-bold ${driver.shrinkageValue > 0 ? 'text-accent-pink' : 'text-accent-green'}`}>
                                            {formatCurrency(driver.shrinkageValue)}
                                        </div>
                                        <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-end mt-0.5">
                                            {driver.shrinkageValue > 0 ? <AlertTriangle className="w-3 h-3 text-accent-pink" /> : <ShieldCheck className="w-3 h-3 text-accent-green" />}
                                            Damaged / Expired
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {driverStats.length === 0 && <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">No drivers registered.</div>}
                    </div>
                </div>
            )
        },
        {
            id: "machines",
            label: "Machines",
            icon: <Target className="w-4 h-4" />,
            content: (
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/[0.02]">
                        <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm flex items-center gap-2">
                            <Target className="w-4 h-4 text-accent-green" />
                            Highest Revenue Machines
                        </h3>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-white/5 p-2 bg-slate-50/50 dark:bg-black/10">
                        {topMachines.length > 0 ? topMachines.map((machine, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-transparent hover:bg-slate-100 dark:hover:bg-white/[0.04] rounded-xl transition-colors animate-in fade-in slide-in-from-right-4 fill-mode-both" style={{ animationDelay: `${i * 100}ms` }}>
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-accent-green/10 text-accent-green flex items-center justify-center font-bold text-sm">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-medium text-slate-900 dark:text-white text-base">{machine.name}</h4>
                                            <span className="text-[10px] font-mono text-slate-700 dark:text-white/60 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                                M-{machine.id.toString().padStart(4, '0')}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-slate-500 dark:text-slate-400" /> {machine.district}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-semibold text-accent-green text-lg">{formatCurrency(machine.totalRevenue)}</div>
                                    <div className="text-[10px] uppercase font-medium text-slate-500 dark:text-slate-400 tracking-wider mt-0.5">Total Revenue Generated</div>
                                </div>
                            </div>
                        )) : <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">No machines have generated revenue yet.</div>}
                    </div>
                </div>
            )
        },
        {
            id: "inventory",
            label: "Inventory",
            icon: <TrendingUp className="w-4 h-4" />,
            content: (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Fast Moving Items */}
                    <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/[0.02]">
                            <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-accent-blue" />
                                Top-Selling Items
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-200 dark:divide-white/5 p-2 bg-slate-50/50 dark:bg-black/10">
                            {fastMoving.length > 0 ? fastMoving.map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-4 bg-transparent hover:bg-slate-100 dark:hover:bg-white/[0.04] rounded-xl transition-colors animate-in fade-in slide-in-from-bottom-4 fill-mode-both" style={{ animationDelay: `${i * 100}ms` }}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-accent-blue/10 text-accent-blue flex items-center justify-center font-bold text-sm">
                                            {i + 1}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="font-medium text-slate-900 dark:text-white text-base">{item.name}</h4>
                                                {item.sku && (
                                                    <span className="text-[10px] font-mono text-slate-700 dark:text-white/60 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                                        {item.sku}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{item.category}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-semibold text-accent-blue text-lg">{formatCurrency(item.totalRevenue)}</div>
                                        <div className="text-[10px] uppercase font-medium text-slate-500 dark:text-slate-400 tracking-wider">Total Revenue Generated</div>
                                    </div>
                                </div>
                            )) : <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">Not enough data available.</div>}
                        </div>
                    </div>

                    {/* Dead Stock */}
                    <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/[0.02]">
                            <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm flex items-center gap-2">
                                <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                                Items Sitting Too Long
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-200 dark:divide-white/5 p-2 bg-slate-50/50 dark:bg-black/10">
                            {deadStock.length > 0 ? deadStock.map((ds, i) => {
                                const daysStagnant = Math.floor((Date.now() - new Date(ds.last_refilled_at).getTime()) / (1000 * 60 * 60 * 24));
                                return (
                                <div key={i} className="flex items-center justify-between p-4 bg-transparent hover:bg-slate-100 dark:hover:bg-white/[0.04] rounded-xl transition-colors animate-in fade-in slide-in-from-bottom-4 fill-mode-both" style={{ animationDelay: `${i * 100}ms` }}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 flex items-center justify-center font-bold text-sm">
                                            {i + 1}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="font-medium text-slate-900 dark:text-white text-base">{ds.item.name}</h4>
                                                {ds.item.sku && (
                                                    <span className="text-[10px] font-mono text-slate-700 dark:text-white/60 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                                        {ds.item.sku}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                                                <span>{ds.machine.location_name}</span>
                                                <span className="text-[10px] font-mono text-slate-700 dark:text-white/60 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                                    M-{ds.machine.id.toString().padStart(4, '0')}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-semibold text-slate-900 dark:text-white text-lg">{daysStagnant} Days</div>
                                        <div className="text-[10px] uppercase font-medium text-slate-500 dark:text-slate-400 tracking-wider">Stagnant Time</div>
                                    </div>
                                </div>
                            )}) : <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">No dead stock detected.</div>}
                        </div>
                    </div>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Analytics & Performance
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                        What needs attention, how the business is doing, and where to dig deeper.
                    </p>
                </div>
                <div className="hidden md:flex w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 items-center justify-center">
                    <Activity className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                </div>
            </div>

            {/* TIER 1: Action Required — machines projected to run dry within 7 days */}
            <div className="mb-8">
                <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent-orange/10 flex items-center justify-center border border-accent-orange/20">
                            <AlertTriangle className="w-4 h-4 text-accent-orange" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Action Required</h2>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden md:block">
                        Based on the last 7 days of sales velocity
                    </p>
                </div>

                {predictiveAlerts.length > 0 ? (
                    <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
                        {predictiveAlerts.map((alert: any) => (
                            <div key={alert.id} className="min-w-[300px] max-w-[350px] snap-start shrink-0 glass-panel border border-accent-orange/30 rounded-3xl p-5 relative overflow-hidden group hover:border-accent-orange/50 transition-colors">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-accent-orange/10 rounded-full blur-3xl group-hover:bg-accent-orange/20 transition-all"></div>
                                <div className="flex items-center gap-2 text-accent-orange font-bold text-xs mb-3">
                                    <AlertTriangle className="w-3 h-3" /> Refill Soon
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 truncate">{alert.location_name}</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                                    Selling ~{alert.dailyVelocity.toFixed(1)} items/day · {alert.stock} units left
                                </p>
                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Runs Out In</p>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-black text-slate-900 dark:text-white">{alert.daysRemaining}</span>
                                            <span className="text-slate-600 dark:text-slate-400 font-medium text-sm">{alert.daysRemaining === 1 ? "day" : "days"}</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-900 dark:text-white/50 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md">M-{alert.id.toString().padStart(4, '0')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-green/10 border border-accent-green/20 text-accent-green text-sm font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        Nothing urgent — no machines projected to run out within 7 days
                    </div>
                )}
            </div>

            {/* TIER 2: The Pulse (High-Level KPIs) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-2xl p-5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Revenue (Last 7 Days)</p>
                        <DollarSign className="w-4 h-4 text-accent-green" />
                    </div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white mb-2">{formatCurrency(pulse.revenue)}</p>
                    <WoWChip delta={wow.revenue} />
                </div>

                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-2xl p-5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Profit Margin (Last 7 Days)</p>
                        <BarChart3 className="w-4 h-4 text-accent-blue" />
                    </div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white mb-2">{pulseMargin.toFixed(1)}%</p>
                    <WoWChip delta={wow.margin} suffix=" pts" />
                </div>

                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-2xl p-5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Items Sold (Last 7 Days)</p>
                        <Package className="w-4 h-4 text-accent-purple" />
                    </div>
                    <p className="text-3xl font-black text-slate-900 dark:text-white mb-2">{pulse.items}</p>
                    <WoWChip delta={wow.items} />
                </div>

                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-2xl p-5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Damaged / Expired Loss (7D)</p>
                        <AlertTriangle className="w-4 h-4 text-accent-pink" />
                    </div>
                    <p className="text-3xl font-black text-accent-pink mb-2">{formatCurrency(pulse.shrinkage)}</p>
                    <WoWChip delta={wow.shrinkage} lowerIsBetter />
                </div>
            </div>

            {/* TIER 3: Trends */}
            <div className="mb-10">
                <AnalyticsDashboardClient machinesData={machinesData} allRefillsData={formattedData.map(d => ({ name: d.name, category: d.category, totalRefilled: d.totalRevenue }))} />
            </div>

            {/* TIER 4: Detailed Breakdown (Tabs) */}
            <div className="pt-4 border-t border-slate-200 dark:border-white/10">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Detailed Breakdown</h2>
                    <p className="text-slate-600 dark:text-slate-400 text-sm">Switch between drivers, machines, and inventory.</p>
                </div>
                <TabbedContainer tabs={tabData} />
            </div>

        </div>
    );
}
