export const revalidate = 30; // 30 second background revalidation
import { getWarehouseInventory, getActiveDispatches } from "@/actions/inventory";
import { getWarehouses } from "@/actions/warehouses";
import { getPredictedDepletion } from "@/actions/predictions";
import { getRefillLogsPaginated } from "@/actions/history";
import { PackageOpen, Truck, AlertCircle, Activity, MapPin, Clock, ShieldCheck, CheckCircle2, TrendingUp, Package, Zap, ArrowDownRight, Wrench } from "lucide-react";
import Link from "next/link";
import prisma from "@/lib/prisma";
import MapVisualWrapper from "@/components/MapVisualWrapper";
import { formatSaudiTime } from "@/lib/utils";

export default async function AdminDashboard() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Parallelize ALL database calls
    const [
        dispatches,
        warehouses,
        todaysLogs,
        pendingReturnsCount,
        machines,
        warehousesWithStats,
        recentActivityPaginated,
        systemAuditLogs,
        predictions,
        recentLogsForSales
    ] = await Promise.all([
        getActiveDispatches(),
        getWarehouses(),
        prisma.refillLog.findMany({
            where: { refilled_at: { gte: startOfDay } },
            include: { item: true }
        }),
        prisma.returnVerification.count({
            where: { status: "PENDING" }
        }),
        prisma.machine.findMany({
            include: {
                RefillLogs: {
                    take: 5,
                    orderBy: { refilled_at: 'desc' },
                    include: { item: true }
                },
                Stock: {
                    include: { item: true }
                }
            }
        }),
        prisma.warehouse.findMany({
            include: {
                Stock: true,
                Dispatches: {
                    where: { status: "OPEN" }
                }
            },
            orderBy: { id: 'asc' }
        }),
        getRefillLogsPaginated({ page: 1, pageSize: 6 }),
        prisma.systemAuditLog.findMany({
            orderBy: { timestamp: 'desc' },
            take: 6
        }),
        getPredictedDepletion(),
        prisma.refillLog.findMany({
            where: { refilled_at: { gte: sevenDaysAgo } },
            include: { item: true }
        })
    ]);

    // --- Processing Logic ---
    const totalRevenueToday = todaysLogs.reduce((acc, log) =>
        acc + ((log.items_sold_since_last_refill || 0) * (log.item.price_standard || 0)), 0
    );

    const todayVolume = todaysLogs.reduce((acc, log) => acc + log.quantity_refilled, 0);
    const activeDispatchCount = dispatches.length;

    const nowAudit = new Date();
    const totalFleetCount = machines.length || 1;
    
    // Logic: Critical if not visited in 5 days, Warning if 2-5 days
    const criticalStock = machines.filter(m => {
        const lastRefill = m.RefillLogs[0]?.refilled_at;
        if (!lastRefill) return true;
        return (nowAudit.getTime() - lastRefill.getTime()) / (1000 * 60 * 60 * 24) > 5;
    }).length;

    const warningStock = machines.filter(m => {
        const lastRefill = m.RefillLogs[0]?.refilled_at;
        if (!lastRefill) return false;
        const daysSince = (nowAudit.getTime() - lastRefill.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 2 && daysSince <= 5;
    }).length;

    const healthyStock = Math.max(0, totalFleetCount - criticalStock - warningStock);

    const itemSales: Record<number, { name: string, quantity: number, category: string, price: number }> = {};
    recentLogsForSales.forEach(log => {
        if (!itemSales[log.itemId]) {
            itemSales[log.itemId] = { name: log.item.name, quantity: 0, category: log.item.category, price: log.item.price_standard };
        }
        itemSales[log.itemId].quantity += (log.items_sold_since_last_refill || 0);
    });

    const topSellingItems = Object.values(itemSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 4);

    type TimelineEvent = {
        id: string;
        type: 'REFILL' | 'RETURN' | 'ADMIN_ACTION';
        title: string;
        timestamp: Date;
        description: React.ReactNode;
        icon: React.ReactNode;
        colorClass: string;
    };

    const timelineEvents: TimelineEvent[] = [];

    // 1. Process operational history (Refills & Returns)
    recentActivityPaginated.data.forEach((log: any) => {
        if (log.isSurplusReturn) {
            timelineEvents.push({
                id: `ret_${log.id}`,
                type: 'RETURN',
                title: 'Driver Return',
                timestamp: log.refilled_at, // mapped from reported_at
                colorClass: 'text-accent-orange',
                icon: <ArrowDownRight className="w-3 h-3 text-accent-orange" />,
                description: (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        <span className="text-accent-blue font-bold">{log.driver?.name || "Driver"}</span> returned 
                        <span className="text-slate-900 dark:text-white mx-1 font-mono">{log.expired_quantity} units</span>
                        to warehouse.
                    </p>
                )
            });
        } else {
            timelineEvents.push({
                id: `ref_${log.id}`,
                type: 'REFILL',
                title: 'Machine Restocked',
                timestamp: log.refilled_at,
                colorClass: 'text-accent-purple',
                icon: <CheckCircle2 className="w-3 h-3 text-accent-purple" />,
                description: (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        <span className="text-accent-blue font-bold">{log.driver?.name || "System"}</span> refilled 
                        <span className="text-slate-900 dark:text-white mx-1 font-mono">{log.quantity_refilled} units</span>
                        at {log.machine?.location_name || "Unknown"}.
                    </p>
                )
            });
        }
    });

    // 2. Process admin audit logs
    systemAuditLogs.forEach((audit) => {
        let title = "System Action";
        let desc = "An administrative action was performed.";
        
        switch (audit.actionType) {
            case "CREATE_DISPATCH": title = "Dispatch Created"; desc = "A new dispatch was issued to a driver."; break;
            case "UPDATE_ITEM": title = "Item Updated"; desc = "Catalog item details were modified."; break;
            case "APPROVE_RETURN": title = "Return Verified"; desc = "An inventory return was successfully verified."; break;
            case "LOG_BATCH_REFILL": title = "Admin Logged Refill"; desc = "Admin manually logged an inventory refill."; break;
            case "UPDATE_MACHINE": title = "Machine Updated"; desc = "Machine configuration was modified."; break;
            case "UPDATE_WAREHOUSE": title = "Warehouse Updated"; desc = "Warehouse configuration was modified."; break;
            default: title = audit.actionType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()); break;
        }

        timelineEvents.push({
            id: `aud_${audit.id}`,
            type: 'ADMIN_ACTION',
            title: title,
            timestamp: audit.timestamp,
            colorClass: 'text-slate-400',
            icon: <Wrench className="w-3 h-3 text-slate-400" />,
            description: (
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <span className="text-slate-900 dark:text-white font-bold">{audit.actorRole === 'super_admin' ? 'Admin' : 'System'}</span>: {desc}
                </p>
            )
        });
    });

    // Sort and limit
    timelineEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const recentTimeline = timelineEvents.slice(0, 6);

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Administrative Command Center
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                        Real-time fleet intelligence and revenue performance matrix.
                    </p>
                </div>
            </div>

            {/* Cybernetic Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <GlassMetric
                    title="EST. REVENUE (TODAY)"
                    value={`⃁ ${totalRevenueToday.toLocaleString()}`}
                    icon={<Activity className="w-7 h-7 text-accent-green" />}
                    trend="Market Liquidity"
                    color="text-accent-green text-3xl"
                    glowClass="hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] border-transparent hover:border-accent-green/30"
                />
                <GlassMetric
                    title="ACTIVE FLEET"
                    value={activeDispatchCount.toString()}
                    icon={<Truck className="w-7 h-7 text-accent-blue" />}
                    trend="Dispatches in Transit"
                    color="text-accent-blue"
                    glowClass="hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] border-transparent hover:border-accent-blue/30"
                />
                <GlassMetric
                    title="OVERDUE VISITS"
                    value={criticalStock.toString()}
                    icon={<AlertCircle className="w-7 h-7 text-accent-pink" />}
                    trend="Audit Urgency"
                    alert={criticalStock > 0}
                    color="text-accent-pink"
                    glowClass="hover:shadow-[0_0_30px_rgba(236,72,153,0.3)] border-transparent hover:border-accent-pink/30"
                />
                <GlassMetric
                    title="PENDING RETURNS"
                    value={pendingReturnsCount.toString()}
                    icon={<ShieldCheck className="w-7 h-7 text-accent-orange" />}
                    trend="Quality Assurance"
                    alert={pendingReturnsCount > 3}
                    color="text-accent-orange"
                    glowClass="hover:shadow-[0_0_30px_rgba(255,165,0,0.3)] border-transparent hover:border-accent-orange/30"
                />
            </div>

            {/* Main Command Center: Map & Health Pulse */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">

                {/* 2/3 Map Visualization */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-accent-blue" />
                            Live Fleet Map & Dispatch Matrix
                        </h2>
                    </div>
                    <MapVisualWrapper machines={machines} predictions={predictions} warehouses={warehousesWithStats} />

                    {/* New Trending Items Section below Map */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                        <div className="glass-panel p-6 rounded-[2rem] border-slate-200 dark:border-white/5 bg-gradient-to-br from-slate-100 dark:from-black/40 to-white/5">
                            <h3 className="font-bold text-slate-500 dark:text-slate-400 dark:text-slate-300 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                Product Velocity (7D)
                            </h3>
                            <div className="space-y-4">
                                {topSellingItems.length > 0 ? topSellingItems.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:bg-white/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                                <Zap className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{item.name}</p>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">{item.category}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs font-mono font-bold text-slate-900 dark:text-white">+{item.quantity}</p>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">Units Sold</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="py-10 text-center text-slate-600 font-mono text-xs">NO MARKET DATA RECORDED</div>
                                )}
                            </div>
                        </div>

                        <div className="glass-panel p-6 rounded-[2rem] border-slate-200 dark:border-white/5 bg-gradient-to-br from-slate-100 dark:from-black/40 to-white/5">
                            <h3 className="font-bold text-slate-500 dark:text-slate-400 dark:text-slate-300 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                                <Package className="w-4 h-4 text-accent-blue" />
                                Logistics Overview
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-[1.5rem] bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/5 flex flex-col items-center text-center">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Total Volume</span>
                                    <span className="text-2xl font-black text-slate-900 dark:text-white">{todayVolume}</span>
                                    <span className="text-[10px] text-slate-600 mt-1 uppercase">Units Today</span>
                                </div>
                                <div className="p-4 rounded-[1.5rem] bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/5 flex flex-col items-center text-center">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Avg Price</span>
                                    <span className="text-2xl font-black text-accent-blue">2.5</span>
                                    <span className="text-[10px] text-slate-600 mt-1 uppercase">Per Unit</span>
                                </div>
                            </div>
                            <div className="mt-4 p-4 rounded-[1.5rem] bg-accent-blue/5 border border-accent-blue/10 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-accent-blue/20 flex items-center justify-center">
                                    <Truck className="w-5 h-5 text-accent-blue" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-900 dark:text-white">Supply Chain Status</p>
                                    <p className="text-[10px] text-accent-blue font-bold uppercase tracking-widest">Optimal Operations</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 1/3 Right Column: Health + Activity */}
                <div className="space-y-8">

                    {/* Inventory Health Pulse */}
                    <div className="glass-panel border-slate-200 dark:border-white/5 p-6 rounded-[2rem] shadow-xl group hover:border-accent-blue/20 transition-all duration-500 bg-gradient-to-b from-white/5 to-transparent">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 dark:text-slate-300 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            Network Health Pulse
                        </h3>

                        <div className="space-y-5">
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-2 text-slate-600 dark:text-slate-400">
                                    <span className="text-emerald-400 uppercase tracking-tighter">Recently Audited</span>
                                    <span className="text-slate-900 dark:text-white font-mono">{Math.round((healthyStock / totalFleetCount) * 100)}%</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-white/5 h-2 rounded-full overflow-hidden">
                                    <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(52,211,153,0.3)]" style={{ width: `${(healthyStock / totalFleetCount) * 100}%` }}></div>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-bold mb-2 text-slate-600 dark:text-slate-400">
                                    <span className="text-orange-400 uppercase tracking-tighter">Due for Visit</span>
                                    <span className="text-slate-900 dark:text-white font-mono">{Math.round((warningStock / totalFleetCount) * 100)}%</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-white/5 h-2 rounded-full overflow-hidden">
                                    <div className="bg-gradient-to-r from-orange-600 to-orange-400 h-full rounded-full transition-all duration-1000" style={{ width: `${(warningStock / totalFleetCount) * 100}%` }}></div>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs font-bold mb-2 text-slate-600 dark:text-slate-400">
                                    <span className="text-accent-pink uppercase tracking-tighter">Overdue Audit</span>
                                    <span className="text-slate-900 dark:text-white font-mono">{Math.round((criticalStock / totalFleetCount) * 100)}%</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-white/5 h-2 rounded-full overflow-hidden">
                                    <div className="bg-gradient-to-r from-pink-600 to-accent-pink h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(236,72,153,0.5)]" style={{ width: `${(criticalStock / totalFleetCount) * 100}%` }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/5 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Nodes Tracked</span>
                            <span className="text-lg font-black text-slate-900 dark:text-white font-mono">{totalFleetCount}</span>
                        </div>
                    </div>

                    {/* Live System Activity Timeline */}
                    <div className="glass-panel border-slate-200 dark:border-white/5 p-6 rounded-[2rem] shadow-xl flex-1 flex flex-col bg-gradient-to-t from-white/5 to-transparent">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 dark:text-slate-300 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                            <Clock className="w-4 h-4 text-accent-purple" />
                            Live System Activity
                        </h3>

                        <div className="flex-1 relative">
                            {/* Vertical timeline line */}
                            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200 dark:bg-white/10"></div>

                            <div className="space-y-6 relative z-10">
                                {recentTimeline.map((event) => (
                                    <div key={event.id} className="flex gap-4 group/timeline">
                                        <div className="mt-1 flex-shrink-0">
                                            <div className={`w-6 h-6 rounded-full bg-white dark:bg-black border-2 border-slate-200 dark:border-white/10 flex flex-col items-center justify-center group-hover/timeline:border-current group-hover/timeline:shadow-[0_0_10px_currentColor] transition-all ${event.colorClass}`}>
                                                {event.icon}
                                            </div>
                                        </div>
                                        <div className="flex-1 -mt-1">
                                            <div className="flex justify-between items-start mb-1">
                                                <p className={`text-sm font-semibold text-slate-900 dark:text-white group-hover/timeline:text-current transition-colors ${event.colorClass}`}>
                                                    {event.title}
                                                </p>
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                                    {formatSaudiTime(event.timestamp, { timeStyle: 'short' })}
                                                </span>
                                            </div>
                                            {event.description}
                                        </div>
                                    </div>
                                ))}

                                {recentTimeline.length === 0 && (
                                    <div className="text-center text-slate-500 dark:text-slate-400 font-mono text-xs py-8 border border-slate-200 dark:border-white/5 rounded-2xl border-dashed">
                                        SYSTEM IDLE. AWAITING FEED.
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

function GlassMetric({ title, value, icon, trend, alert = false, color, glowClass }: any) {
    return (
        <div className={`glass-panel border-slate-200 dark:border-white/10 rounded-[2.5rem] p-6 relative overflow-hidden group transition-all duration-500 hover:-translate-y-2 ${glowClass}`}>
            <div className="absolute -top-4 -right-4 p-8 opacity-5 transition-all duration-500 group-hover:opacity-10 group-hover:scale-150 rotate-12">
                {icon}
            </div>
            <div className="relative z-10">
                <div className={`w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mb-6 transition-all duration-300 ${alert ? 'border-accent-pink/50 bg-accent-pink/10 shadow-[0_0_20px_rgba(236,72,153,0.2)]' : ''}`}>
                    {icon}
                </div>
                <h3 className="text-slate-500 dark:text-slate-400 font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-1">{title}</h3>
                <div className={`text-4xl font-black text-slate-900 dark:text-white tracking-tighter transition-colors duration-300 ${color}`}>{value}</div>
                <div className={`flex items-center gap-1.5 text-[10px] mt-4 font-mono font-bold ${alert ? 'text-accent-pink' : 'text-slate-500 dark:text-slate-400'}`}>
                    <div className={`w-1 h-1 rounded-full ${alert ? 'bg-accent-pink animate-pulse' : 'bg-slate-700'}`} />
                    {trend}
                </div>
            </div>
        </div>
    )
}
