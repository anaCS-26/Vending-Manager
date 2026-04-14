export const revalidate = 60;
import { PieChart, TrendingUp, Download, Building2, Package, MapPin, LayoutGrid } from "lucide-react";
import prisma from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import ExportExcelButton from "@/components/ExportExcelButton";

export default async function FinancialsPage(props: { searchParams: Promise<{ view?: string }> }) {
    const searchParams = await props.searchParams;
    const currentView = searchParams.view || "machine";

    // 1. Fetch Master Data in Parallel
    const [refillLogsRaw, machinesRaw, itemsRaw, warehousesRaw, returnVerificationsRaw, dispatchItemsRaw] = await Promise.all([
        prisma.refillLog.findMany({
            include: {
                item: true,
                machine: true,
                dispatch: { include: { warehouse: true } }
            }
        }),
        prisma.machine.findMany(),
        prisma.item.findMany(),
        prisma.warehouse.findMany(),
        prisma.returnVerification.findMany({
            where: { status: "VERIFIED", reason: { in: ["DAMAGED", "EXPIRED"] } },
            include: { item: true, dispatch: true }
        }),
        prisma.dispatchItem.findMany({
            where: { quantity_damaged: { gt: 0 } },
            include: { item: true, dispatch: true }
        })
    ]);

    // 2. Global Totals Calculation
    let totalRevenue = 0;
    let totalSoldCOGS = 0;
    refillLogsRaw.forEach(log => {
        const sold = log.items_sold_since_last_refill || 0;
        const price = (log as any).price_at_refill ?? log.item.price_standard ?? 0;
        const cost = (log as any).cost_at_refill ?? (log.item as any).cost ?? 0;
        
        // Use exact sales revenue if captured offline, otherwise fallback to realtime logic
        totalRevenue += log.sales_revenue || (sold * price);
        totalSoldCOGS += sold * cost;
    });

    // Shrinkage calculations (using item's current WAC as standard)
    const shrinkageFromRoutes = returnVerificationsRaw.reduce((sum, rv) => sum + (rv.quantity * ((rv.item as any).cost || 0)), 0);
    const shrinkageFromReturns = dispatchItemsRaw.reduce((sum, di) => sum + ((di.quantity_damaged || 0) * ((di.item as any).cost || 0)), 0);
    const totalShrinkageCOGS = shrinkageFromRoutes + shrinkageFromReturns;

    const totalMachineExpenses = machinesRaw.reduce((acc, m) => acc + ((m as any).operating_cost || 0) + ((m as any).rental_cost || 0), 0);
    const totalWarehouseExpenses = warehousesRaw.reduce((acc, w) => acc + ((w as any).operating_cost || 0) + ((w as any).rental_cost || 0), 0);
    const totalExpenses = totalMachineExpenses + totalWarehouseExpenses;
    
    // Net Profit = Collected Revenue - Cost of Sold Items - Shrinkage Cost - Fixed Expenses
    const totalNetProfit = totalRevenue - totalSoldCOGS - totalShrinkageCOGS - totalExpenses;

    // 3. Performance Aggregation Logic
    let displayData: any[] = [];

    if (currentView === "machine") {
        displayData = machinesRaw.map(m => {
            const mLogs = refillLogsRaw.filter(l => l.machineId === m.id);
            let revenue = 0;
            let cogs = 0;
            let shrinkage = 0;
            mLogs.forEach(l => {
                const sold = l.items_sold_since_last_refill || 0;
                const price = (l as any).price_at_refill ?? l.item.price_standard ?? 0;
                const cost = (l as any).cost_at_refill ?? (l.item as any).cost ?? 0;
                revenue += l.sales_revenue || (sold * price);
                cogs += sold * cost;
                shrinkage += (l.damaged_quantity || 0) * cost;
            });
            const expenses = ((m as any).operating_cost || 0) + ((m as any).rental_cost || 0);
            return {
                id: m.id,
                label: m.location_name,
                subLabel: `M-${m.id.toString().padStart(4, '0')}`,
                revenue,
                cogs,
                shrinkage,
                expenses,
                netProfit: revenue - cogs - shrinkage - expenses
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }
    else if (currentView === "warehouse") {
        displayData = warehousesRaw.map(w => {
            const wLogs = refillLogsRaw.filter(l => l.dispatch?.warehouseId === w.id);
            const wReturnVerifs = returnVerificationsRaw.filter(rv => rv.dispatch?.warehouseId === w.id);
            const wDispatchItems = dispatchItemsRaw.filter(di => di.dispatch?.warehouseId === w.id);
            
            let revenue = 0;
            let cogs = 0;
            wLogs.forEach(l => {
                const sold = l.items_sold_since_last_refill || 0;
                const price = (l as any).price_at_refill ?? l.item.price_standard ?? 0;
                const cost = (l as any).cost_at_refill ?? (l.item as any).cost ?? 0;
                revenue += l.sales_revenue || (sold * price);
                cogs += sold * cost;
            });
            
            let shrinkage = 0;
            wReturnVerifs.forEach(rv => shrinkage += (rv.quantity * ((rv.item as any).cost || 0)));
            wDispatchItems.forEach(di => shrinkage += ((di.quantity_damaged || 0) * ((di.item as any).cost || 0)));

            const expenses = ((w as any).operating_cost || 0) + ((w as any).rental_cost || 0);
            return {
                id: w.id,
                label: w.name,
                subLabel: w.location,
                revenue,
                cogs,
                shrinkage,
                expenses,
                netProfit: revenue - cogs - shrinkage - expenses
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }
    else if (currentView === "item") {
        displayData = itemsRaw.map(i => {
            const iLogs = refillLogsRaw.filter(l => l.itemId === i.id);
            const iReturnVerifs = returnVerificationsRaw.filter(rv => rv.itemId === i.id);
            const iDispatchItems = dispatchItemsRaw.filter(di => di.itemId === i.id);

            let revenue = 0;
            let cogs = 0;
            let unitsSold = 0;
            iLogs.forEach(l => {
                const sold = l.items_sold_since_last_refill || 0;
                unitsSold += sold;
                const price = (l as any).price_at_refill ?? l.item.price_standard ?? 0;
                const cost = (l as any).cost_at_refill ?? (l.item as any).cost ?? 0;
                revenue += l.sales_revenue || (sold * price);
                cogs += sold * cost;
            });

            let shrinkage = 0;
            iReturnVerifs.forEach(rv => shrinkage += (rv.quantity * ((rv.item as any).cost || 0)));
            iDispatchItems.forEach(di => shrinkage += ((di.quantity_damaged || 0) * ((di.item as any).cost || 0)));

            return {
                id: i.id,
                label: i.name,
                subLabel: `${unitsSold} Units Reported`,
                revenue,
                cogs,
                shrinkage,
                expenses: 0,
                netProfit: revenue - cogs - shrinkage
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }

    // Prepare data specifically formatted nicely for Excel
    const excelData = displayData.map(item => ({
        "Name / Label": item.label,
        "Details": item.subLabel,
        "Est. Revenue": item.revenue.toFixed(2),
        "Cost of Goods": item.cogs.toFixed(2),
        "Operating Expenses": item.expenses ? item.expenses.toFixed(2) : "0.00",
        "Net Profit": item.netProfit.toFixed(2)
    }));

    return (
        <div className="space-y-8 pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Financial Command Center
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Enterprise Profit & Loss across entire asset clusters.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportExcelButton
                        data={excelData}
                        filename={`Financial_Report_${currentView.charAt(0).toUpperCase() + currentView.slice(1)}`}
                        label={`Export ${currentView.charAt(0).toUpperCase() + currentView.slice(1)}s (Excel)`}
                    />
                    <a href="/api/export-zatca" className="hidden sm:flex px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-xl text-sm font-bold transition-all gap-2 items-center shadow-[0_0_20px_rgba(59,130,246,0.2)] opacity-50 cursor-not-allowed" title="Coming soon">
                        <Download className="w-4 h-4" />
                        ZATCA XML
                    </a>
                </div>
            </div>

            {/* Global Financial Metrics Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <MetricCard title="Gross Revenue" value={totalRevenue} color="text-emerald-500" icon={<TrendingUp className="w-4 h-4" />} />
                <MetricCard title="Product COGS" value={totalSoldCOGS} color="text-slate-900 dark:text-white" icon={<Package className="w-4 h-4" />} />
                <MetricCard title="Shrinkage (Loss)" value={totalShrinkageCOGS} color="text-amber-500" icon={<Package className="w-4 h-4" />} />
                <MetricCard title="Fixed Operating Exp." value={totalExpenses} color="text-accent-pink" icon={<Building2 className="w-4 h-4" />} />
                <MetricCard title="Global Net Profit" value={totalNetProfit} color="text-brand-500" glow icon={<PieChart className="w-4 h-4" />} />
            </div>

            {/* Segmented Performance Analysis Section */}
            <div className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-6 lg:p-8 relative">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-8 pb-6 border-b border-slate-200 dark:border-white/5 gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center border border-brand-500/20">
                            <LayoutGrid className="w-5 h-5 text-brand-500" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight uppercase tracking-wider">Performance Matrix</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">View detailed metrics by segment</p>
                        </div>
                    </div>

                    {/* View Toggle Group */}
                    <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-2xl border border-slate-200 dark:border-white/10 relative">
                        <ViewOption active={currentView === "machine"} label="Machines" value="machine" icon={<MapPin className="w-4 h-4" />} />
                        <ViewOption active={currentView === "warehouse"} label="Warehouses" value="warehouse" icon={<Building2 className="w-4 h-4" />} />
                        <ViewOption active={currentView === "item"} label="Items" value="item" icon={<Package className="w-4 h-4" />} />
                    </div>
                </div>

                <div className="overflow-x-auto scroll-fade-right custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                <th className="py-4 pr-6">Segment Information</th>
                                <th className="py-4 px-6 text-right">Captured Revenue</th>
                                <th className="py-4 px-6 text-right">Est. COGS</th>
                                <th className="py-4 px-6 text-right">Shrinkage Loss</th>
                                <th className="py-4 px-6 text-right">Operating Exp</th>
                                <th className="py-4 pl-6 text-right">Net Benefit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-white/[0.03]">
                            {displayData.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">
                                        No telemetry matches selected segment filters.
                                    </td>
                                </tr>
                            ) : (
                                displayData.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 border-b border-slate-200 dark:border-white/[0.02] last:border-0 flex-row">
                                        <td className="py-5 pr-6">
                                            <div className="font-bold text-slate-900 dark:text-white text-sm uppercase">{item.label}</div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">{item.subLabel}</div>
                                        </td>
                                        <td className="py-5 px-6 text-right">
                                            <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{formatCurrency(item.revenue)}</span>
                                        </td>
                                        <td className="py-5 px-6 text-right">
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 font-mono">{formatCurrency(item.cogs)}</span>
                                        </td>
                                        <td className="py-5 px-6 text-right">
                                            <span className="text-sm font-medium text-amber-500/80 font-mono">-{formatCurrency(item.shrinkage)}</span>
                                        </td>
                                        <td className="py-5 px-6 text-right">
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 font-mono">{formatCurrency(item.expenses)}</span>
                                        </td>
                                        <td className="py-5 pl-6 text-right">
                                            <span className="text-base font-black text-brand-500 font-mono">{formatCurrency(item.netProfit)}</span>
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
        <div className={`bg-white dark:bg-black/20 border transition-all rounded-[2rem] p-6 group relative overflow-hidden ${glow ? 'border-brand-500/30 hover:border-brand-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'border-slate-300 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/20'}`}>
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-all ${color === 'text-emerald-500' ? 'bg-emerald-500' : color === 'text-brand-500' ? 'bg-brand-500' : color === 'text-accent-pink' ? 'bg-accent-pink' : 'bg-slate-500'}`}></div>
            <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${glow ? 'bg-brand-500/10 text-brand-500 border border-brand-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/5'}`}>
                    {icon}
                </div>
                <h3 className="font-bold text-slate-600 dark:text-slate-400 text-[10px] uppercase tracking-widest">{title}</h3>
            </div>
            <p className={`text-3xl font-black font-mono tracking-tight ${color}`}>{formatCurrency(value)}</p>
        </div>
    );
}

function ViewOption({ active, label, value, icon }: { active: boolean, label: string, value: string, icon: React.ReactNode }) {
    return (
        <Link
            href={`/admin/financials?view=${value}`}
            className={`relative px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${active ? 'text-slate-900 dark:text-white bg-white dark:bg-white/10 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
        >
            {icon}
            <span className="capitalize">{label}</span>
        </Link>
    );
}
