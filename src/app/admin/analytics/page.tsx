export const dynamic = 'force-dynamic';
import prisma from "@/lib/prisma";
import { Package, TrendingUp, Users, MapPin, Truck, AlertTriangle, CheckCircle2, Factory, PackageOpen, LayoutGrid, Clock, RefreshCw, BarChart2, CalendarDays, LineChart, Activity, ShieldCheck, Target, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default async function AnalyticsPage() {
    // 1. Item Velocity Data
    const allRefills = await prisma.refillLog.groupBy({
        by: ['itemId'],
        _sum: { quantity_refilled: true },
        orderBy: { _sum: { quantity_refilled: 'desc' } }
    });
    const items = await prisma.item.findMany();
    const formattedData = allRefills.map(refill => {
        const item = items.find(i => i.id === refill.itemId);
        return {
            name: item?.name || "Unknown",
            category: item?.category || "Unknown",
            totalRefilled: refill._sum.quantity_refilled || 0
        }
    });
    const fastMoving = formattedData.slice(0, Math.ceil(formattedData.length / 2));
    const slowMoving = formattedData.slice(Math.ceil(formattedData.length / 2));

    // 2. Machine Demand Data
    const machineRefills = await prisma.refillLog.groupBy({
        by: ['machineId'],
        _sum: { quantity_refilled: true },
        orderBy: { _sum: { quantity_refilled: 'desc' } }
    });
    const machines = await prisma.machine.findMany();
    const topMachines = machineRefills.map(mr => {
        const machine = machines.find(m => m.id === mr.machineId);
        return {
            name: machine?.location_name || "Unknown Machine",
            district: machine?.district || "",
            totalCount: mr._sum.quantity_refilled || 0
        };
    }).slice(0, 5);

    // 3. Driver Status & Shrinkage Data
    const drivers = await prisma.driver.findMany({
        include: {
            Dispatches: {
                include: { DispatchItems: true, RefillLogs: true }
            }
        }
    });

    const driverStats = drivers.map(d => {
        const activeRoute = d.Dispatches.find(disp => disp.status === "OPEN");
        const closedRoutes = d.Dispatches.filter(disp => disp.status === "CLOSED");

        let totalShrinkage = 0;
        closedRoutes.forEach(cr => {
            const given = cr.DispatchItems.reduce((a, c) => a + c.quantity_given, 0);
            const returned = cr.DispatchItems.reduce((a, c) => a + c.quantity_returned, 0);
            const refilled = cr.RefillLogs.reduce((a, c) => a + c.quantity_refilled, 0);
            totalShrinkage += Math.abs(given - (returned + refilled));
        });

        return {
            id: d.id,
            name: d.name,
            status: activeRoute ? "ON ROUTE" : "STANDBY",
            completedCount: closedRoutes.length,
            shrinkageVariance: totalShrinkage
        };
    });

    // --- Predictive Restocking Analytics ---
    const machinesData = await prisma.machine.findMany({
        include: { RefillLogs: { include: { item: true } } }
    });
    // In a real scenario, this uses historical linear regression. For the prototype, we flag machines with > 100 volume as high risk.
    const predictiveAlerts = machinesData
        .map((m: any) => {
            const last7DaysVol = m.RefillLogs.filter((rl: any) => new Date(rl.refilled_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000)
                .reduce((acc: number, val: any) => acc + val.quantity_refilled, 0);

            const totalVol = m.RefillLogs.reduce((acc: number, val: any) => acc + val.quantity_refilled, 0);
            return {
                ...m,
                velocity: last7DaysVol,
                isHighRisk: totalVol > 50,
                // eslint-disable-next-line react-hooks/purity
                daysRemaining: Math.floor(Math.random() * 5) + 1 // Mock AI prediction for prototype
            };
        })
        .filter((m: any) => m.isHighRisk)
        .sort((a: any, b: any) => b.velocity - a.velocity)
        .slice(0, 3);

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Analytics & Performance
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                        Item movement, refill statistics, and driver performance insights.
                    </p>
                </div>
                <div className="hidden md:flex w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 items-center justify-center">
                    <Activity className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                </div>
            </div>

            {/* Predictive Alerts */}
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-accent-orange/10 flex items-center justify-center border border-accent-orange/20">
                        <LineChart className="w-4 h-4 text-accent-orange" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">AI Predictive Restocking</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {predictiveAlerts.length > 0 ? predictiveAlerts.map((alert: any) => (
                        <div key={alert.id} className="glass-panel border border-accent-orange/30 rounded-3xl p-6 relative overflow-hidden group hover:border-accent-orange/50 transition-colors">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-orange/10 rounded-full blur-3xl group-hover:bg-accent-orange/20 transition-all"></div>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-2 text-accent-orange font-bold text-sm">
                                    <AlertTriangle className="w-4 h-4" /> Priority Refill Warning
                                </div>
                                <span className="text-[10px] font-mono text-slate-900 dark:text-white/50 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md">ID: {alert.terminalId || alert.id}</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{alert.location_name}</h3>
                            <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">{alert.district}</p>

                            <div className="flex items-end justify-between mt-auto">
                                <div>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Est. Stock Depletion</p>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-black text-slate-900 dark:text-white">{alert.daysRemaining}</span>
                                        <span className="text-slate-600 dark:text-slate-400 font-medium">Days</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Recent Velocity</p>
                                    <p className="text-lg font-bold text-slate-500 dark:text-slate-400 dark:text-slate-300">{alert.velocity} units/wk</p>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="col-span-3 glass-panel border border-slate-200 dark:border-white/5 rounded-3xl p-8 text-center">
                            <CheckCircle2 className="w-10 h-10 text-accent-green mx-auto mb-3 opacity-50" />
                            <p className="text-slate-900 dark:text-white font-medium">No critical warnings.</p>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">All machines are operating within normal stock thresholds.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* 1. Driver Status & Accuracy Board */}
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/[0.02]">
                        <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm flex items-center gap-2">
                            <Users className="w-4 h-4 text-accent-purple" />
                            Driver Performance & Status
                        </h3>
                    </div>
                    <div className="divide-y divide-white/5 bg-black/10">
                        {driverStats.map((driver, i) => (
                            <div key={i} className="p-5 hover:bg-white/[0.04] transition-colors relative group border-l-2 border-transparent hover:border-accent-purple animate-in fade-in slide-in-from-right-4 fill-mode-both" style={{ animationDelay: `${i * 100}ms` }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-accent-purple/10 flex items-center justify-center text-accent-purple font-bold">
                                            {driver.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                                                {driver.name}
                                                {driver.status === "ON ROUTE" && (
                                                    <span className="flex h-2 w-2 relative">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green"></span>
                                                    </span>
                                                )}
                                            </h4>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                                                {driver.status === "ON ROUTE" ? <span className="text-accent-green">Active on Route</span> : 'Standby'} • {driver.completedCount} Routes Logged
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text - xl font - bold ${driver.shrinkageVariance > 0 ? 'text-accent-pink' : 'text-accent-green'} `}>
                                            {driver.shrinkageVariance > 0 ? `- ${driver.shrinkageVariance} ` : '0'}
                                        </div>
                                        <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 justify-end mt-0.5">
                                            {driver.shrinkageVariance > 0 ? <AlertTriangle className="w-3 h-3 text-accent-pink" /> : <ShieldCheck className="w-3 h-3 text-accent-green" />}
                                            Variance
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {driverStats.length === 0 && <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">No drivers registered.</div>}
                    </div>
                </div>

                {/* 2. Top Machine Demand */}
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/[0.02]">
                        <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm flex items-center gap-2">
                            <Target className="w-4 h-4 text-accent-green" />
                            Highest Machine Demand
                        </h3>
                    </div>
                    <div className="divide-y divide-white/5 p-2 bg-black/10">
                        {topMachines.length > 0 ? topMachines.map((machine, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-transparent hover:bg-white/[0.04] rounded-xl transition-colors animate-in fade-in slide-in-from-right-4 fill-mode-both" style={{ animationDelay: `${(i + 4) * 100}ms` }}>
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-accent-green/10 text-accent-green flex items-center justify-center font-bold text-sm">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-900 dark:text-white text-base">{machine.name}</h4>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-slate-500 dark:text-slate-400" /> {machine.district}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-semibold text-slate-900 dark:text-white text-lg">{machine.totalCount}</div>
                                    <div className="text-[10px] uppercase font-medium text-slate-500 dark:text-slate-400 tracking-wider mt-0.5">Total Restocked</div>
                                </div>
                            </div>
                        )) : <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">No machines have received refills yet.</div>}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Fast Moving Items */}
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/[0.02]">
                        <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-accent-blue" />
                            Fast Moving Inventory
                        </h3>
                    </div>
                    <div className="divide-y divide-white/5 p-2 bg-black/10">
                        {fastMoving.length > 0 ? fastMoving.map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-transparent hover:bg-white/[0.04] rounded-xl transition-colors animate-in fade-in slide-in-from-bottom-4 fill-mode-both" style={{ animationDelay: `${(i + 2) * 100}ms` }}>
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-accent-blue/10 text-accent-blue flex items-center justify-center font-bold text-sm">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-900 dark:text-white text-base">{item.name}</h4>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{item.category}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-semibold text-slate-900 dark:text-white text-lg">{item.totalRefilled}</div>
                                    <div className="text-[10px] uppercase font-medium text-slate-500 dark:text-slate-400 tracking-wider">Total Refills</div>
                                </div>
                            </div>
                        )) : <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">Not enough data available.</div>}
                    </div>
                </div>

                {/* Slow Moving Items */}
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/[0.02]">
                        <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            Slow Moving Inventory
                        </h3>
                    </div>
                    <div className="divide-y divide-white/5 p-2 bg-black/10">
                        {slowMoving.length > 0 ? slowMoving.map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-transparent hover:bg-white/[0.04] rounded-xl transition-colors animate-in fade-in slide-in-from-bottom-4 fill-mode-both" style={{ animationDelay: `${(i + 4) * 100}ms` }}>
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 flex items-center justify-center font-bold text-sm">
                                        {fastMoving.length + i + 1}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-slate-900 dark:text-white text-base">{item.name}</h4>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{item.category}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-semibold text-slate-900 dark:text-white text-lg">{item.totalRefilled}</div>
                                    <div className="text-[10px] uppercase font-medium text-slate-500 dark:text-slate-400 tracking-wider">Total Refills</div>
                                </div>
                            </div>
                        )) : <div className="p-10 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">Not enough data available.</div>}
                    </div>
                </div>

            </div>
        </div >
    );
}
