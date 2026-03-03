export const dynamic = 'force-dynamic';
import { PieChart, TrendingUp, Download, Building2, Package, MapPin, LayoutGrid } from "lucide-react";
import prisma from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export default async function FinancialsPage(props: { searchParams: Promise<{ view?: string }> }) {
    const searchParams = await props.searchParams;
    const currentView = searchParams.view || "machine";

    // 1. Fetch Master Data
    const refillLogsRaw = await prisma.refillLog.findMany({
        include: {
            item: true,
            machine: true,
            dispatch: { include: { warehouse: true } }
        }
    });

    const machinesRaw = await prisma.machine.findMany();
    const itemsRaw = await prisma.item.findMany();
    const warehousesRaw = await prisma.warehouse.findMany();

    // 2. Global Totals Calculation
    let totalRevenue = 0;
    refillLogsRaw.forEach(log => {
        totalRevenue += (log.items_sold_since_last_refill || 0) * (log.item.price || 0);
    });

    // Dummy logic for COGS and Rent as per prototype style
    const totalCOGS = totalRevenue * 0.50;
    const totalExpenses = machinesRaw.reduce((acc, m) => acc + (m.locationRent || 0) + (m.adminExpenses || 0), 0);
    const totalNetProfit = totalRevenue - totalCOGS - totalExpenses;

    // 3. Performance Aggregation Logic
    let displayData: any[] = [];

    if (currentView === "machine") {
        displayData = machinesRaw.map(m => {
            const mLogs = refillLogsRaw.filter(l => l.machineId === m.id);
            const revenue = mLogs.reduce((acc, l) => acc + (l.items_sold_since_last_refill || 0) * (l.item.price || 0), 0);
            const expenses = (m.locationRent || 0) + (m.adminExpenses || 0);
            return {
                id: m.id,
                label: m.location_name,
                subLabel: m.terminalId,
                revenue,
                cogs: revenue * 0.5,
                expenses,
                netProfit: revenue - (revenue * 0.5) - expenses
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }
    else if (currentView === "warehouse") {
        displayData = warehousesRaw.map(w => {
            const wLogs = refillLogsRaw.filter(l => l.dispatch.warehouseId === w.id);
            const revenue = wLogs.reduce((acc, l) => acc + (l.items_sold_since_last_refill || 0) * (l.item.price || 0), 0);
            // Prorate warehouse expenses based on volume or just show revenue/cogs
            return {
                id: w.id,
                label: w.name,
                subLabel: w.location,
                revenue,
                cogs: revenue * 0.5,
                expenses: 0, // In this model, we'll keep it focused on revenue/cogs
                netProfit: revenue - (revenue * 0.5)
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }
    else if (currentView === "item") {
        displayData = itemsRaw.map(i => {
            const iLogs = refillLogsRaw.filter(l => l.itemId === i.id);
            const revenue = iLogs.reduce((acc, l) => acc + (l.items_sold_since_last_refill || 0) * (l.item.price || 0), 0);
            const unitsSold = iLogs.reduce((acc, l) => acc + (l.items_sold_since_last_refill || 0), 0);
            return {
                id: i.id,
                label: i.name,
                subLabel: `${unitsSold} Units Reported`,
                revenue,
                cogs: revenue * 0.5,
                expenses: 0,
                netProfit: revenue - (revenue * 0.5)
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4 px-2">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        Financial Command Center
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                        Enterprise Profit & Loss across the entire asset clusters.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <a href="/api/export-zatca" className="px-5 py-2.5 bg-accent-green/10 hover:bg-accent-green/20 text-accent-green border border-accent-green/20 rounded-xl text-sm font-bold transition-all flex gap-2 items-center hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                        <Download className="w-4 h-4" />
                        Export ZATCA Tax Report
                    </a>
                </div>
            </div>

            {/* Global Financial Metrics Strip */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4">
                <MetricCard title="Total Gross Revenue" value={totalRevenue} color="text-emerald-400" icon={<TrendingUp className="w-4 h-4" />} />
                <MetricCard title="Est. Product COGS" value={totalCOGS} color="text-accent-pink" icon={<Package className="w-4 h-4" />} />
                <MetricCard title="Fixed Operating Exp." value={totalExpenses} color="text-accent-pink" icon={<Building2 className="w-4 h-4" />} />
                <MetricCard title="Global Net Profit" value={totalNetProfit} color="text-slate-900 dark:text-white" glow icon={<PieChart className="w-4 h-4" />} />
            </div>

            {/* Segmented Performance Analysis Section */}
            <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[2.5rem] overflow-hidden relative shadow-2xl">
                <div className="px-8 py-6 border-b border-slate-200 dark:border-white/5 bg-gradient-to-r from-white/[0.02] to-transparent flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-accent-blue/10 flex items-center justify-center border border-accent-blue/20">
                            <LayoutGrid className="w-5 h-5 text-accent-blue" />
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base tracking-widest uppercase">Performance Matrix</h3>
                    </div>

                    {/* View Toggle Group */}
                    <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-2xl border border-slate-200 dark:border-white/5">
                        <ViewOption active={currentView === "machine"} label="Machines" value="machine" icon={<MapPin className="w-3 h-3" />} />
                        <ViewOption active={currentView === "warehouse"} label="Warehouses" value="warehouse" icon={<Building2 className="w-3 h-3" />} />
                        <ViewOption active={currentView === "item"} label="Items" value="item" icon={<Package className="w-3 h-3" />} />
                    </div>
                </div>

                <div className="overflow-x-auto scroll-fade-right custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-black/20">
                                <th className="px-8 py-6">Segment Information</th>
                                <th className="px-8 py-6 text-right text-emerald-400/80">Captured Revenue</th>
                                <th className="px-8 py-6 text-right text-accent-pink/80">Est. COGS</th>
                                <th className="px-8 py-6 text-right text-accent-pink/80">Operating Exp</th>
                                <th className="px-8 py-6 text-right text-slate-900 dark:text-white">Net Benefit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-white/[0.03]">
                            {displayData.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">
                                        No telemetry matches selected segment filters.
                                    </td>
                                </tr>
                            ) : (
                                displayData.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 group border-b border-slate-200 dark:border-white/[0.03] last:border-0 border-l-[3px] border-l-transparent hover:border-l-accent-blue">
                                        <td className="px-8 py-5">
                                            <div className="font-black text-slate-900 dark:text-white text-sm group-hover:text-accent-blue transition-colors uppercase tracking-tight">{item.label}</div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold font-mono mt-0.5">{item.subLabel}</div>
                                        </td>
                                        <td className="px-8 py-5 text-right font-black text-slate-900 dark:text-white font-mono text-sm">
                                            {formatCurrency(item.revenue)}
                                        </td>
                                        <td className="px-8 py-5 text-right font-bold text-accent-pink/60 group-hover:text-accent-pink transition-colors font-mono text-xs">
                                            {formatCurrency(item.cogs)}
                                        </td>
                                        <td className="px-8 py-5 text-right font-bold text-accent-pink/30 group-hover:text-accent-pink/60 transition-colors font-mono text-xs">
                                            {formatCurrency(item.expenses)}
                                        </td>
                                        <td className="px-8 py-5 text-right font-black text-accent-green font-mono">
                                            {formatCurrency(item.netProfit)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ title, value, color, icon, glow = false }: { title: string, value: number, color: string, icon: React.ReactNode, glow?: boolean }) {
    return (
        <div className={`glass-panel p-6 rounded-[2rem] relative overflow-hidden group hover:scale-[1.02] transition-all duration-300 ${glow ? 'bg-gradient-to-br from-white/[0.05] to-accent-green/[0.02] border-accent-green/20' : 'border-slate-200 dark:border-white/5'}`}>
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-all ${color === 'text-emerald-400' ? 'bg-accent-green' : color === 'text-slate-900 dark:text-white' ? 'bg-accent-blue' : 'bg-accent-pink'}`}></div>
            <p className="text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">{icon} {title}</p>
            <p className={`text-3xl font-black ${color} tracking-tighter`}>{formatCurrency(value)}</p>
        </div>
    );
}

function ViewOption({ active, label, value, icon }: { active: boolean, label: string, value: string, icon: React.ReactNode }) {
    return (
        <Link
            href={`/admin/financials?view=${value}`}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${active ? 'bg-accent-blue text-slate-900 dark:text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-white/5'}`}
        >
            {icon}
            {label}
        </Link>
    );
}
