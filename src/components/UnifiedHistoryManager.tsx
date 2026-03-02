"use client";

import { useState, useMemo, useTransition } from "react";
import {
    History,
    Truck,
    Zap,
    Search,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    CheckCircle2,
    MapPin,
    User,
    Clock,
    ShieldCheck,
    Edit2,
    Save,
    X,
    LayoutList,
    Activity
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { formatCurrency, formatID } from "@/lib/utils";
import { editDispatchReturn } from "@/actions/inventory";
import { EditLogModal } from "./EditLogModal";
import type { DispatchWithRelations, DispatchItemWithItem, RefillLogWithMachine } from "@/types";

type UnifiedHistoryManagerProps = {
    dispatches: DispatchWithRelations[];
    logs: any[]; // Specific type for granular logs
};

const PAGE_SIZE = 10;

export default function UnifiedHistoryManager({ dispatches, logs }: UnifiedHistoryManagerProps) {
    const [activeView, setActiveView] = useState<"ROUTES" | "EVENTS">("ROUTES");
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState<"ALL" | "ISSUES" | "MATCHES">("ALL");
    const [currentPage, setCurrentPage] = useState(1);

    // Edit state for Routes
    const [editingDispatchId, setEditingDispatchId] = useState<number | null>(null);
    const [editQtys, setEditQtys] = useState<Record<number, number>>({});
    const [isPending, startTransition] = useTransition();

    const handleStartEdit = (dispatch: DispatchWithRelations) => {
        const initialQtys = dispatch.DispatchItems.reduce((acc: Record<number, number>, curr: DispatchItemWithItem) => {
            acc[curr.id] = curr.quantity_returned;
            return acc;
        }, {});
        setEditQtys(initialQtys);
        setEditingDispatchId(dispatch.id);
    };

    const handleSaveEdit = (dispatchId: number) => {
        startTransition(async () => {
            const edits = Object.keys(editQtys).map(id => ({
                dispatchItemId: parseInt(id),
                new_quantity_returned: editQtys[parseInt(id)]
            }));
            const result = await editDispatchReturn(dispatchId, edits);
            if (result.success) {
                toast.success("Log updated successfully", {
                    description: `Inventory records for Dispatch #${formatID(dispatchId)} have been updated.`,
                });
                setEditingDispatchId(null);
            } else {
                toast.error("Update failed", {
                    description: result.error,
                });
            }
        });
    };

    // --- Filter Logic for ROUTES ---
    const filteredDispatches = useMemo(() => {
        let result = dispatches;
        if (activeFilter !== "ALL") {
            result = result.filter(d => {
                const totalGiven = d.DispatchItems.reduce((acc: number, curr: DispatchItemWithItem) => acc + curr.quantity_given, 0);
                const totalReturned = d.DispatchItems.reduce((acc: number, curr: DispatchItemWithItem) => acc + curr.quantity_returned, 0);
                const totalRefilled = (d.RefillLogs as RefillLogWithMachine[]).reduce((acc: number, curr) => acc + curr.quantity_refilled, 0);
                const hasAnomaly = (totalGiven - (totalRefilled + totalReturned)) !== 0;
                return activeFilter === "ISSUES" ? hasAnomaly : !hasAnomaly;
            });
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(d =>
                d.driver.name.toLowerCase().includes(q) ||
                formatID(d.id).includes(q) ||
                d.DispatchItems.some(di => di.item.name.toLowerCase().includes(q))
            );
        }
        return result;
    }, [dispatches, searchQuery, activeFilter]);

    // --- Filter Logic for EVENTS ---
    const filteredLogs = useMemo(() => {
        let result = logs;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(l =>
                l.machine.location_name.toLowerCase().includes(q) ||
                l.item.name.toLowerCase().includes(q) ||
                l.dispatch.driver.name.toLowerCase().includes(q)
            );
        }
        return result;
    }, [logs, searchQuery]);

    const activeListLength = activeView === "ROUTES" ? filteredDispatches.length : filteredLogs.length;
    const totalPages = Math.max(1, Math.ceil(activeListLength / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);

    const paginatedDispatches = filteredDispatches.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    const paginatedLogs = filteredLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const handleViewChange = (view: "ROUTES" | "EVENTS") => {
        setActiveView(view);
        setCurrentPage(1);
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Unified Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <History className="w-8 h-8 text-accent-blue" />
                        Operations Archive
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm font-medium">
                        Comprehensive ledger of completed routes, restock events, and audit verifications.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                    {/* View Switcher */}
                    <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-2xl border border-slate-200 dark:border-white/5 w-full sm:w-auto">
                        <button
                            onClick={() => handleViewChange("ROUTES")}
                            className={`flex-1 sm:flex-none px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeView === "ROUTES" ? 'bg-accent-blue text-slate-900 dark:text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                        >
                            <Truck className="w-3.5 h-3.5" />
                            By Route
                        </button>
                        <button
                            onClick={() => handleViewChange("EVENTS")}
                            className={`flex-1 sm:flex-none px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeView === "EVENTS" ? 'bg-accent-purple text-slate-900 dark:text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                        >
                            <Activity className="w-3.5 h-3.5" />
                            By Event
                        </button>
                    </div>

                    {/* Search */}
                    <div className="w-full sm:w-64 glass-panel border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-2 flex items-center gap-2 focus-within:border-accent-blue/50 transition-all">
                        <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Search archive..."
                            className="bg-transparent border-none text-xs text-slate-900 dark:text-white focus:outline-none w-full placeholder:text-slate-600 font-medium"
                        />
                    </div>
                </div>
            </div>

            {/* Quick Filters (Only for Routes for now) */}
            {activeView === "ROUTES" && (
                <div className="flex flex-wrap items-center gap-2">
                    <FilterButton active={activeFilter === "ALL"} onClick={() => { setActiveFilter("ALL"); setCurrentPage(1); }}>All Routes</FilterButton>
                    <FilterButton active={activeFilter === "ISSUES"} onClick={() => { setActiveFilter("ISSUES"); setCurrentPage(1); }} color="text-accent-pink" icon={<AlertTriangle className="w-3.5 h-3.5" />}>Issues Detected</FilterButton>
                    <FilterButton active={activeFilter === "MATCHES"} onClick={() => { setActiveFilter("MATCHES"); setCurrentPage(1); }} color="text-accent-green" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>Perfect Sync</FilterButton>
                </div>
            )}

            {/* Content Area */}
            <div className="relative min-h-[500px]">
                <AnimatePresence mode="wait">
                    {activeView === "ROUTES" ? (
                        <motion.div
                            key="routes-view"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            {paginatedDispatches.length === 0 ? (
                                <EmptyState icon={<Truck className="w-12 h-12" />} title="No Routes Found" />
                            ) : (
                                paginatedDispatches.map((dispatch) => (
                                    <RouteCard
                                        key={dispatch.id}
                                        dispatch={dispatch}
                                        isEditing={editingDispatchId === dispatch.id}
                                        onEdit={() => handleStartEdit(dispatch)}
                                        onSave={() => handleSaveEdit(dispatch.id)}
                                        onCancel={() => setEditingDispatchId(null)}
                                        editQtys={editQtys}
                                        setEditQtys={setEditQtys}
                                        isPending={isPending}
                                    />
                                ))
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="events-view"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="glass-panel border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl"
                        >
                            <div className="overflow-x-auto overflow-y-hidden">
                                <table className="w-full text-left border-collapse min-w-[1000px]">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Timestamp</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Personnel</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Machine Location</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Product Asset</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 text-center">Telemetry Adjust</th>
                                            <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">Verification</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-white/[0.03]">
                                        {paginatedLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-20 text-center text-slate-600 font-mono text-xs italic uppercase tracking-widest">No matching events recorded</td>
                                            </tr>
                                        ) : (
                                            paginatedLogs.map((log) => (
                                                <EventRow key={log.id} log={log} />
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-6">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="p-2.5 rounded-xl glass-panel border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-all"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button
                            key={p}
                            onClick={() => setCurrentPage(p)}
                            className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${p === safePage ? 'bg-accent-blue text-slate-900 dark:text-white shadow-lg' : 'glass-panel border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                        >
                            {p}
                        </button>
                    ))}
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        className="p-2.5 rounded-xl glass-panel border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-all"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
}

// --- Sub-Components ---

function FilterButton({ children, active, onClick, color, icon }: any) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${active
                ? 'bg-white text-black border-white shadow-xl'
                : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:bg-white/10 hover:text-slate-900 dark:text-white'
                }`}
        >
            {icon}
            {children}
        </button>
    );
}

function EmptyState({ icon, title }: any) {
    return (
        <div className="glass-panel border-slate-200 dark:border-white/5 border-dashed rounded-[3rem] p-20 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-6 text-slate-700">
                {icon}
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs">Try adjusting your filters or search query to find what you're looking for.</p>
        </div>
    );
}

function RouteCard({ dispatch, isEditing, onEdit, onSave, onCancel, editQtys, setEditQtys, isPending }: any) {
    const totalGiven = dispatch.DispatchItems.reduce((acc: number, curr: any) => acc + curr.quantity_given, 0);
    const totalReturned = dispatch.DispatchItems.reduce((acc: number, curr: any) => acc + curr.quantity_returned, 0);
    const totalRefilled = (dispatch.RefillLogs as any[]).reduce((acc: number, curr: any) => acc + curr.quantity_refilled, 0);
    const variance = totalGiven - (totalRefilled + totalReturned);
    const hasAnomaly = variance !== 0;

    return (
        <div className="glass-panel border border-slate-300 shadow-sm dark:border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden group">
            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${hasAnomaly ? 'bg-accent-pink' : 'bg-accent-green'}`}></div>

            <div className="flex flex-col xl:flex-row gap-8">
                {/* Left Section: Header & Stats */}
                <div className="flex-1 space-y-6">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-5">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${hasAnomaly ? 'bg-accent-pink/10 border-accent-pink/20 text-accent-pink' : 'bg-accent-green/10 border-accent-green/20 text-accent-green'}`}>
                                {hasAnomaly ? <AlertTriangle className="w-7 h-7" /> : <CheckCircle2 className="w-7 h-7" />}
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{dispatch.driver.name}</h3>
                                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-mono text-slate-500 dark:text-slate-400">#{formatID(dispatch.id)}</span>
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 font-medium mt-1 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                    {new Date(dispatch.dispatch_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(dispatch.dispatch_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>

                        {!isEditing ? (
                            <button onClick={onEdit} className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-all border border-slate-200 dark:border-white/5 group/edit">
                                <Edit2 className="w-4 h-4 group-hover/edit:rotate-12 transition-transform" />
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={onSave} disabled={isPending} className="px-4 py-2 bg-accent-green text-black text-xs font-black uppercase rounded-xl hover:scale-105 transition-all">Save</button>
                                <button onClick={onCancel} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white text-xs font-black uppercase rounded-xl border border-slate-200 dark:border-white/10">Cancel</button>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 bg-slate-100 dark:bg-black/40 rounded-3xl border border-slate-200 dark:border-white/5">
                        <StatItem label="Given" value={totalGiven} color="text-slate-500 dark:text-slate-400 dark:text-slate-300" />
                        <StatItem label="Refilled" value={totalRefilled} color="text-accent-blue" />
                        <StatItem label="Returned" value={totalReturned} color="text-accent-green" />
                        <StatItem label="Variance" value={variance > 0 ? `-${variance}` : `+${Math.abs(variance)}`} color={hasAnomaly ? "text-accent-pink" : "text-accent-green"} />
                    </div>
                </div>

                {/* Right Section: Details (Itemized) */}
                <div className="flex-1 xl:max-w-md space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2 px-2">
                        <LayoutList className="w-3.5 h-3.5" />
                        Inventory Reconcile
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                        {dispatch.DispatchItems.map((di: any) => {
                            const refillQty = dispatch.RefillLogs.filter((rl: any) => rl.itemId === di.itemId).reduce((a: number, c: any) => a + c.quantity_refilled, 0);
                            const itemVar = di.quantity_given - (refillQty + (isEditing ? (editQtys[di.id] ?? di.quantity_returned) : di.quantity_returned));

                            return (
                                <div key={di.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.04] flex items-center justify-between group/item hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-all">
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{di.item.name}</p>
                                        <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                                            <span>OUT: {di.quantity_given}</span>
                                            <span>RL: {refillQty}</span>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editQtys[di.id] ?? di.quantity_returned}
                                                    onChange={e => setEditQtys({ ...editQtys, [di.id]: parseInt(e.target.value) || 0 })}
                                                    className="w-10 bg-accent-blue/20 border-b border-accent-blue text-slate-900 dark:text-white focus:outline-none text-center"
                                                />
                                            ) : (
                                                <span>RTN: {di.quantity_returned}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`text-xs font-black ${itemVar === 0 ? 'text-accent-green/40' : itemVar > 0 ? 'text-accent-pink' : 'text-accent-orange'}`}>
                                        {itemVar === 0 ? 'SYNC' : itemVar > 0 ? `-${itemVar}` : `+${Math.abs(itemVar)}`}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatItem({ label, value, color }: any) {
    return (
        <div className="text-center">
            <p className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tighter mb-1">{label}</p>
            <p className={`text-xl font-black ${color} tracking-tighter`}>{value}</p>
        </div>
    );
}

function EventRow({ log }: { log: any }) {
    const allVerifs = log.dispatch.ReturnVerifications.filter((v: any) => v.itemId === log.itemId);
    const approved = allVerifs.filter((v: any) => v.status === 'APPROVED');
    const pending = allVerifs.filter((v: any) => v.status === 'PENDING');
    const verifiedLoss = approved.reduce((s: number, v: any) => s + v.quantity, 0);
    const pendingCount = pending.reduce((s: number, v: any) => s + v.quantity, 0);

    return (
        <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-all duration-300 group border-b border-slate-200 dark:border-white/[0.04] last:border-0">
            <td className="px-6 py-5">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{new Date(log.refilled_at).toLocaleDateString()}</span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">{new Date(log.refilled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
            </td>
            <td className="px-6 py-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue font-black text-[10px]">
                        {log.dispatch.driver.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{log.dispatch.driver.name}</span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">Route #{formatID(log.dispatchId)}</span>
                    </div>
                </div>
            </td>
            <td className="px-6 py-5">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{log.machine.location_name}</span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {log.machine.terminalId}
                    </span>
                </div>
            </td>
            <td className="px-6 py-5">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{log.item.name}</span>
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded w-max mt-1">{log.item.category}</span>
                </div>
            </td>
            <td className="px-6 py-5">
                <div className="flex justify-center">
                    <EditLogModal log={log} />
                </div>
            </td>
            <td className="px-6 py-5 text-right">
                <div className="flex flex-col items-end gap-1.5">
                    {verifiedLoss > 0 ? (
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black uppercase px-2 py-1 bg-accent-green/10 text-accent-green border border-accent-green/20 rounded-full flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" /> Verified {verifiedLoss}
                            </span>
                        </div>
                    ) : pendingCount > 0 ? (
                        <span className="text-[9px] font-black uppercase px-2 py-1 bg-accent-orange/10 text-accent-orange border border-accent-orange/20 rounded-full flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="w-3 h-3" /> {pendingCount} Pending
                        </span>
                    ) : (
                        <span className="text-[9px] font-black uppercase px-2 py-1 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 rounded-full opacity-40">
                            Pristine
                        </span>
                    )}
                </div>
            </td>
        </tr>
    );
}

