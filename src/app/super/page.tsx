export const dynamic = "force-dynamic";

import Link from "next/link";
import { TrendingUp, Wallet, Percent, Package, Activity, Eye, ShieldAlert, ArrowUpRight } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import SuperRevenueTrend from "@/components/super/SuperRevenueTrend";
import SystemHealthPanel from "@/components/super/SystemHealthPanel";
import SensitiveFeed from "@/components/super/SensitiveFeed";
import { getExecutiveKpis, getSystemHealth, getIntegrityAlerts, getOversightSummary, type ExecutiveRange } from "@/actions/super-insights";
import { formatCurrency, cn } from "@/lib/utils";

const RANGES: { value: ExecutiveRange; label: string }[] = [
    { value: "7days", label: "7D" },
    { value: "30days", label: "30D" },
    { value: "ytd", label: "YTD" },
    { value: "all", label: "ALL" },
];
const RANGE_SUBTITLE: Record<ExecutiveRange, string> = {
    "7days": "Last 7 days",
    "30days": "Last 30 days",
    ytd: "Year to date",
    all: "All time",
};

export default async function SuperOverviewPage(props: { searchParams: Promise<{ range?: string }> }) {
    const sp = await props.searchParams;
    const range: ExecutiveRange = (["7days", "30days", "ytd", "all"] as const).includes(sp.range as ExecutiveRange)
        ? (sp.range as ExecutiveRange)
        : "30days";

    const [kpis, health, integrity, oversight] = await Promise.all([
        getExecutiveKpis(range),
        getSystemHealth(),
        getIntegrityAlerts(),
        getOversightSummary(),
    ]);

    const openIssues = integrity.reduce((s, c) => s + c.count, 0);
    const criticalIssues = integrity.filter((c) => c.severity === "critical").reduce((s, c) => s + c.count, 0);
    const sub = RANGE_SUBTITLE[range];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header + range toggle */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Provider Overview</h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">System health, business performance, and what needs your attention.</p>
                </div>
                <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-2xl border border-slate-200 dark:border-white/10">
                    {RANGES.map((r) => (
                        <Link
                            key={r.value}
                            href={`/super?range=${r.value}`}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all",
                                range === r.value
                                    ? "text-slate-900 dark:text-white bg-white dark:bg-white/10 shadow-sm border border-slate-200 dark:border-white/10"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white",
                            )}
                        >
                            {r.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                <KpiCard
                    href="/admin/financials"
                    title="Revenue"
                    value={formatCurrency(kpis.revenue)}
                    subtitle={sub}
                    icon={<TrendingUp className="w-6 h-6 text-accent-green" />}
                    color="text-accent-green"
                    glowClass="hover:border-accent-green/30 dark:hover:shadow-[0_0_30px_rgba(16,185,129,0.25)]"
                />
                <KpiCard
                    href="/admin/financials"
                    title="Net Profit"
                    value={formatCurrency(kpis.netProfit)}
                    subtitle={sub}
                    icon={<Wallet className="w-6 h-6 text-accent-blue" />}
                    color={kpis.netProfit >= 0 ? "text-accent-blue" : "text-accent-pink"}
                    alert={kpis.netProfit < 0}
                    glowClass="hover:border-accent-blue/30 dark:hover:shadow-[0_0_30px_rgba(59,130,246,0.25)]"
                />
                <KpiCard
                    href="/admin/analytics"
                    title="Gross Margin"
                    value={`${(kpis.grossMargin * 100).toFixed(1)}%`}
                    subtitle="Revenue minus COGS"
                    icon={<Percent className="w-6 h-6 text-accent-purple" />}
                    color="text-accent-purple"
                    glowClass="hover:border-accent-purple/30 dark:hover:shadow-[0_0_30px_rgba(99,102,241,0.25)]"
                />
                <KpiCard
                    href="/admin/warehouse"
                    title="Inventory Value"
                    value={formatCurrency(kpis.inventoryValue)}
                    subtitle="Warehouse on-hand at WAC"
                    icon={<Package className="w-6 h-6 text-accent-orange" />}
                    color="text-accent-orange"
                    glowClass="hover:border-accent-orange/30 dark:hover:shadow-[0_0_30px_rgba(249,115,22,0.25)]"
                />
            </div>

            {/* Revenue trend + system health */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl">
                    <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                        <TrendingUp className="w-4 h-4 text-accent-green" /> Revenue · last 14 days
                    </h3>
                    <SuperRevenueTrend data={kpis.revenueTrend} />
                </div>
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2">
                            <Activity className="w-4 h-4 text-accent-blue" /> System Health
                        </h3>
                        <Link href="/super/system" className="text-xs font-bold text-accent-blue hover:underline flex items-center gap-1">
                            Detail <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <SystemHealthPanel health={health} variant="compact" />
                    <div className="mt-auto pt-6 grid grid-cols-3 gap-3 text-center">
                        <MiniStat label="Machines" value={kpis.activeMachines} />
                        <MiniStat label="Drivers" value={kpis.activeDrivers} />
                        <MiniStat label="Items" value={kpis.activeItems} />
                    </div>
                </div>
            </div>

            {/* Integrity summary + sensitive feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-accent-pink" /> Integrity
                            {criticalIssues > 0 && (
                                <span className="ml-1 text-[10px] font-mono font-bold text-accent-pink bg-accent-pink/10 px-2 py-0.5 rounded-full">
                                    {criticalIssues} critical
                                </span>
                            )}
                        </h3>
                        <Link href="/super/integrity" className="text-xs font-bold text-accent-blue hover:underline flex items-center gap-1">
                            Review <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    {openIssues === 0 ? (
                        <p className="text-sm text-accent-green font-medium py-6 text-center">All clear — no anomalies detected.</p>
                    ) : (
                        <ul className="space-y-2">
                            {integrity.filter((c) => c.count > 0).map((c) => (
                                <li key={c.key} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{c.label}</span>
                                    <span className={cn(
                                        "text-sm font-mono font-bold",
                                        c.severity === "critical" ? "text-accent-pink" : c.severity === "warning" ? "text-accent-orange" : "text-accent-blue",
                                    )}>{c.count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2">
                            <Eye className="w-4 h-4 text-accent-purple" /> Recent Sensitive Actions
                        </h3>
                        <Link href="/super/oversight" className="text-xs font-bold text-accent-blue hover:underline flex items-center gap-1">
                            Oversight <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
                    <SensitiveFeed events={oversight.sensitiveEvents} limit={6} />
                </div>
            </div>
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.03] py-3">
            <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">{label}</p>
        </div>
    );
}
