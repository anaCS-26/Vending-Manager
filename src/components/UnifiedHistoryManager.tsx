"use client";

import React, { useState, useMemo, useTransition } from "react";
import {
    History,
    Truck,
    Zap,
    Search,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
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
    Activity,
    Loader2
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
                const totalRouteReturned = (d.RefillLogs as any[]).reduce((acc: number, curr: any) => acc + (curr.expired_quantity || 0) + (curr.damaged_quantity || 0), 0);
                const hasAnomaly = (totalGiven - (totalRefilled + totalRouteReturned + totalReturned)) !== 0;
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
        <div className="space-y-8 pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <History className="w-8 h-8 text-brand-500" />
                        Operations Archive
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Comprehensive ledger of completed routes, restock events, and audit verifications.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                    {/* View Switcher - Matching Financials ViewOption layout */}
                    <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-2xl border border-slate-200 dark:border-white/10 relative w-full sm:w-auto">
                        <button
                            onClick={() => handleViewChange("ROUTES")}
                            className={`relative px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeView === "ROUTES" ? 'text-slate-900 dark:text-white bg-white dark:bg-white/10 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                        >
                            <Truck className="w-4 h-4" />
                            <span>By Route</span>
                        </button>
                        <button
                            onClick={() => handleViewChange("EVENTS")}
                            className={`relative px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none ${activeView === "EVENTS" ? 'text-slate-900 dark:text-white bg-white dark:bg-white/10 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                        >
                            <Activity className="w-4 h-4" />
                            <span>By Event</span>
                        </button>
                    </div>

                    {/* Search - Standardized layout */}
                    <div className="w-full sm:w-64 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-2 focus-within:border-brand-500/50 focus-within:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all">
                        <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Search archive..."
                            className="bg-transparent border-none outline-none text-sm text-slate-900 dark:text-white w-full placeholder:text-slate-500 dark:text-slate-400"
                        />
                    </div>
                </div>
            </div>

            {/* Quick Filters (Only for Routes for now) */}
            {activeView === "ROUTES" && (
                <div className="flex flex-wrap items-center gap-2 px-1">
                    <FilterButton active={activeFilter === "ALL"} onClick={() => { setActiveFilter("ALL"); setCurrentPage(1); }}>All Routes</FilterButton>
                    <FilterButton active={activeFilter === "ISSUES"} onClick={() => { setActiveFilter("ISSUES"); setCurrentPage(1); }} color="text-accent-pink" icon={<AlertTriangle className="w-3.5 h-3.5" />}>Issues Detected</FilterButton>
                    <FilterButton active={activeFilter === "MATCHES"} onClick={() => { setActiveFilter("MATCHES"); setCurrentPage(1); }} color="text-emerald-500" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>Perfect Sync</FilterButton>
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
                            className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-6 lg:p-8 relative"
                        >
                            <div className="overflow-x-auto scroll-fade-right custom-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[1000px]">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                            <th className="py-3 px-3 md:py-4 md:px-6 text-left">Timestamp</th>
                                            <th className="py-3 px-3 md:py-4 md:px-6 text-left">Personnel</th>
                                            <th className="py-3 px-3 md:py-4 md:px-6 text-left">Machine Location</th>
                                            <th className="py-3 px-3 md:py-4 md:px-6 text-left">Product Asset</th>
                                            <th className="py-3 px-3 md:py-4 md:px-6 text-center">Telemetry Adjust</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-white/[0.03]">
                                        {paginatedLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">No matching events recorded</td>
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
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-6">
                    <button
                        onClick={() => setCurrentPage(1)}
                        disabled={safePage === 1}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-all shadow-sm"
                        title="First Page"
                    >
                        <ChevronsLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-all shadow-sm"
                        title="Previous Page"
                    >
                        <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    
                    {Array.from(new Set([1, safePage - 10, safePage - 5, safePage - 1, safePage, safePage + 1, safePage + 5, safePage + 10, totalPages]))
                        .filter(p => p >= 1 && p <= totalPages)
                        .sort((a, b) => a - b)
                        .map((p, index, array) => (
                            <React.Fragment key={p}>
                                {index > 0 && p - array[index - 1] > 1 && (
                                    <span className="text-slate-400 dark:text-slate-500 px-1 font-bold">...</span>
                                )}
                                <button
                                    onClick={() => setCurrentPage(p)}
                                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl text-xs font-bold transition-all shadow-sm ${p === safePage ? 'bg-brand-500 text-white dark:text-white border border-brand-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-white/20'}`}
                                >
                                    {p}
                                </button>
                            </React.Fragment>
                        ))}

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-all shadow-sm"
                        title="Next Page"
                    >
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={safePage === totalPages}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white disabled:opacity-30 transition-all shadow-sm"
                        title="Last Page"
                    >
                        <ChevronsRight className="w-4 h-4 sm:w-5 sm:h-5" />
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
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border shadow-sm ${active
                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white border-slate-200 dark:border-white/10'
                : 'bg-slate-100 dark:bg-black/20 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:bg-white/10 hover:text-slate-900 dark:text-white hover:border-slate-300 dark:hover:border-white/20'
                } ${color ? color : ''}`}
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
    const totalRouteReturned = (dispatch.RefillLogs as any[]).reduce((acc: number, curr: any) => acc + (curr.expired_quantity || 0) + (curr.damaged_quantity || 0), 0);
    const variance = totalGiven - (totalRefilled + totalRouteReturned + totalReturned);
    const hasAnomaly = variance !== 0;

    return (
        <div className="bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 rounded-[2.5rem] p-6 lg:p-8 relative overflow-hidden group shadow-sm hover:border-slate-400 dark:hover:border-white/20 transition-all">
            <div className={`absolute left-0 top-0 bottom-0 w-2 transition-all ${hasAnomaly ? 'bg-accent-pink group-hover:bg-accent-pink/80' : 'bg-emerald-500 group-hover:bg-emerald-400'}`}></div>

            <div className="flex flex-col xl:flex-row gap-8 pl-4 lg:pl-0">
                {/* Left Section: Header & Stats */}
                <div className="flex-1 space-y-6">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-5">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm ${hasAnomaly ? 'bg-accent-pink/10 border-accent-pink/20 text-accent-pink' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                                {hasAnomaly ? <AlertTriangle className="w-7 h-7" /> : <CheckCircle2 className="w-7 h-7" />}
                            </div>
                            <div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                    <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{dispatch.driver.name}</h3>
                                    <span className="px-2 py-0.5 w-fit rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 shadow-sm">#{formatID(dispatch.id)}</span>
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                                    {new Date(dispatch.dispatch_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(dispatch.dispatch_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>

                        {!isEditing ? (
                            <button onClick={onEdit} className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-all border border-slate-200 dark:border-white/5 shadow-sm">
                                <Edit2 className="w-4 h-4" />
                            </button>
                        ) : (
                            <div className="flex flex-col sm:flex-row gap-2">
                                <button onClick={onCancel} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white text-xs font-bold rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">Cancel</button>
                                <button onClick={onSave} disabled={isPending} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white text-xs font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-50 flex items-center gap-2">
                                    {isPending && <Loader2 className="w-3 h-3 animate-spin" />} Save
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-5 bg-slate-50 dark:bg-black/20 rounded-3xl border border-slate-200 dark:border-white/5">
                        <StatItem label="Given" value={totalGiven} color="text-slate-600 dark:text-slate-400" />
                        <StatItem label="Refilled" value={totalRefilled} color="text-brand-500" />
                        <StatItem label="Rtn(Route)" value={totalRouteReturned} color="text-accent-orange" />
                        <StatItem label="Returned" value={totalReturned} color="text-emerald-500" />
                        <StatItem label="Variance" value={variance > 0 ? `-${variance}` : `+${Math.abs(variance)}`} color={hasAnomaly ? "text-accent-pink" : "text-emerald-500"} />
                    </div>
                </div>

                {/* Right Section: Details (Itemized) */}
                <div className="flex-1 xl:max-w-md space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2 px-2">
                        <LayoutList className="w-4 h-4" />
                        Inventory Reconcile
                    </h4>
                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-2">
                        {dispatch.DispatchItems.map((di: any) => {
                            const refillQty = dispatch.RefillLogs.filter((rl: any) => rl.itemId === di.itemId).reduce((a: number, c: any) => a + c.quantity_refilled, 0);
                            const routeReturnedQty = dispatch.RefillLogs.filter((rl: any) => rl.itemId === di.itemId).reduce((a: number, c: any) => a + (c.expired_quantity || 0) + (c.damaged_quantity || 0), 0);
                            const itemVar = di.quantity_given - (refillQty + routeReturnedQty + (isEditing ? (editQtys[di.id] ?? di.quantity_returned) : di.quantity_returned));

                            return (
                                <div key={di.id} className="p-4 rounded-2xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/5 flex items-center justify-between group/item hover:border-slate-300 dark:hover:border-white/10 transition-all shadow-sm">
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-1.5">{di.item.name}</p>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/5 px-2 py-1 rounded-lg w-fit bg-slate-50 dark:bg-white/[0.02]">
                                            <span className="flex gap-1 items-center"><span className="text-slate-400 dark:text-slate-500 tracking-tighter uppercase">GIVEN:</span> {di.quantity_given}</span>
                                            <span className="text-slate-300 dark:text-slate-600">|</span>
                                            <span className="flex gap-1 items-center"><span className="text-slate-400 dark:text-slate-500 tracking-tighter uppercase">REFILL:</span> <span className="text-brand-500 font-bold">{refillQty}</span></span>
                                            <span className="text-slate-300 dark:text-slate-600">|</span>
                                            <span className="flex gap-1 items-center"><span className="text-slate-400 dark:text-slate-500 tracking-tighter uppercase">RTN(R):</span> <span className="text-accent-orange font-bold">{routeReturnedQty}</span></span>
                                            <span className="text-slate-300 dark:text-slate-600">|</span>
                                            {isEditing ? (
                                                <div className="flex gap-1 items-center">
                                                    <span className="text-slate-400 dark:text-slate-500 tracking-tighter uppercase">RTN(HQ):</span>
                                                    <input
                                                        type="number"
                                                        value={editQtys[di.id] ?? di.quantity_returned}
                                                        onChange={e => setEditQtys({ ...editQtys, [di.id]: parseInt(e.target.value) || 0 })}
                                                        className="w-12 bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded px-1 py-0.5 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 text-center"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="flex gap-1 items-center"><span className="text-slate-400 dark:text-slate-500 tracking-tighter uppercase">RTN(HQ):</span> <span className="text-emerald-500 font-bold">{di.quantity_returned}</span></span>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`text-base font-black font-mono shrink-0 ${itemVar === 0 ? 'text-emerald-500' : itemVar > 0 ? 'text-accent-pink' : 'text-accent-orange'}`}>
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
        <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 border-b border-slate-200 dark:border-white/[0.02] last:border-0 border-l-[3px] border-l-transparent hover:border-l-brand-500 group flex-row">
            <td className="py-3 px-3 md:py-5 md:px-6">
                <div className="flex flex-col">
                    <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{new Date(log.refilled_at).toLocaleDateString()}</span>
                    <span className="text-[9px] md:text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">{new Date(log.refilled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
            </td>
            <td className="py-3 px-3 md:py-5 md:px-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold text-xs uppercase shadow-sm">
                        {log.dispatch.driver.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{log.dispatch.driver.name}</span>
                        <span className="text-[9px] md:text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">Route #{formatID(log.dispatchId)}</span>
                    </div>
                </div>
            </td>
            <td className="py-3 px-3 md:py-5 md:px-6">
                <div className="flex flex-col">
                    <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{log.machine.location_name}</span>
                    <span className="text-[9px] md:text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" /> M-{log.machine.id.toString().padStart(4, '0')}
                    </span>
                </div>
            </td>
            <td className="py-3 px-3 md:py-5 md:px-6">
                <div className="flex flex-col">
                    <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{log.item.name}</span>
                    <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest px-1.5 py-0.5 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 rounded-md w-max mt-1.5">{log.item.category}</span>
                </div>
            </td>
            <td className="py-3 px-3 md:py-5 md:px-6">
                <div className="flex justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                    <EditLogModal log={log} />
                </div>
            </td>
        </tr>
    );
}

