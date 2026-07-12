"use client";

import { History, AlertTriangle, CheckCircle2, Package, MapPin, Search, ChevronLeft, ChevronRight, Edit2, Save, X } from "lucide-react";
import { useState, useMemo, useTransition } from "react";
import type { DispatchWithRelations, DispatchItemWithItem, RefillLogWithMachine } from "@/types";
import { editDispatchReturn } from "@/actions/inventory";
import { toast } from "sonner";
import { formatCurrency, formatID, formatSaudiDate, formatSaudiTime } from "@/lib/utils";
import { NumericInput } from "@/components/NumericInput";

type HistoryListProps = {
    dispatches: DispatchWithRelations[];
    hideHeader?: boolean;
};

const PAGE_SIZE = 10;

export default function HistoryList({ dispatches, hideHeader }: HistoryListProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState<"ALL" | "ISSUES" | "MATCHES">("ALL");
    const [currentPage, setCurrentPage] = useState(1);

    // Edit state
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

    // Instant client-side filtering — no round trip
    const filteredDispatches = useMemo(() => {
        let result = dispatches;

        // Categorical filter
        if (activeFilter !== "ALL") {
            result = result.filter(d => {
                const totalGiven = d.DispatchItems.reduce((acc: number, curr: DispatchItemWithItem) => acc + curr.quantity_given, 0);
                const totalReturned = d.DispatchItems.reduce((acc: number, curr: DispatchItemWithItem) => acc + curr.quantity_returned, 0);
                const totalRefilled = (d.RefillLogs as RefillLogWithMachine[]).reduce((acc: number, curr) => acc + curr.quantity_refilled, 0);
                const totalRouteReturned = (d.RefillLogs as any[]).reduce((acc: number, curr: any) => acc + (curr.expired_quantity || 0) + (curr.damaged_quantity || 0), 0);
                const hasAnomaly = (totalGiven - (totalRefilled + totalReturned + totalRouteReturned)) !== 0;
                if (activeFilter === "ISSUES") return hasAnomaly;
                if (activeFilter === "MATCHES") return !hasAnomaly;
                return true;
            });
        }

        // Text search
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            result = result.filter(d => {
                const driverMatch = d.driver.name.toLowerCase().includes(lowerQuery);
                const idMatch = formatID(d.id).includes(lowerQuery);
                const itemMatch = d.DispatchItems.some((di: DispatchItemWithItem) =>
                    di.item.name.toLowerCase().includes(lowerQuery)
                );
                const locationMatch = (d.RefillLogs as RefillLogWithMachine[]).some(rl =>
                    rl.machine.location_name.toLowerCase().includes(lowerQuery)
                );
                return driverMatch || idMatch || itemMatch || locationMatch;
            });
        }

        return result;
    }, [dispatches, searchQuery, activeFilter]);

    // Client-side pagination
    const totalPages = Math.max(1, Math.ceil(filteredDispatches.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedDispatches = filteredDispatches.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    // Reset to page 1 when filters change
    const handleFilterChange = (filter: "ALL" | "ISSUES" | "MATCHES") => {
        setActiveFilter(filter);
        setCurrentPage(1);
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">

            {!hideHeader && (
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                            Route History Logs
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                            Chronological record of completed dispatches and inventory reconciliation.
                        </p>
                    </div>
                    <div className="flex w-full md:w-auto md:flex-1 max-w-sm ml-auto glass-panel border border-slate-200 dark:border-white/5 rounded-full px-4 py-2 items-center gap-2 focus-within:border-accent-blue/50 focus-within:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all">
                        <Search className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Search by driver, ID, or item..."
                            className="bg-transparent border-none text-sm text-slate-900 dark:text-white focus:outline-none w-full placeholder:text-slate-500 dark:text-slate-400"
                        />
                    </div>
                </div>
            )}

            {hideHeader && (
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Completed Routes</h2>
                    <div className="flex w-full md:w-auto md:flex-1 max-w-sm glass-panel border border-slate-200 dark:border-white/5 rounded-full px-4 py-2 items-center gap-2 focus-within:border-accent-blue/50 transition-all">
                        <Search className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Search completed logs..."
                            className="bg-transparent border-none text-sm text-slate-900 dark:text-white focus:outline-none w-full placeholder:text-slate-500 dark:text-slate-400"
                        />
                    </div>
                </div>
            )}

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2 pb-2">
                <button
                    onClick={() => handleFilterChange("ALL")}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeFilter === "ALL" ? 'bg-white text-black shadow-lg' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/5'}`}
                >
                    All Routes
                </button>
                <button
                    onClick={() => handleFilterChange("ISSUES")}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${activeFilter === "ISSUES" ? 'bg-accent-pink text-slate-900 dark:text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/5'}`}
                >
                    <AlertTriangle className={`w-4 h-4 ${activeFilter === "ISSUES" ? 'text-slate-900 dark:text-white' : 'text-accent-pink'}`} />
                    With Issues
                </button>
                <button
                    onClick={() => handleFilterChange("MATCHES")}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${activeFilter === "MATCHES" ? 'bg-accent-green text-black shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-white/5'}`}
                >
                    <CheckCircle2 className={`w-4 h-4 ${activeFilter === "MATCHES" ? 'text-black' : 'text-accent-green'}`} />
                    Perfect Matches
                </button>
                {filteredDispatches.length > 0 && (
                    <span className="ml-auto text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {filteredDispatches.length} result{filteredDispatches.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            <div className="space-y-6">
                {paginatedDispatches.length === 0 ? (
                    <div className="glass-panel border-slate-200 dark:border-white/5 rounded-3xl p-16 text-center">
                        <History className="w-12 h-12 text-slate-500 dark:text-slate-400 mx-auto mb-4 opacity-50" />
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">No History Found</h3>
                        <p className="text-slate-600 dark:text-slate-400 mt-2">
                            {searchQuery ? "No logs matched your search query." : "There are no completed routes to display yet."}
                        </p>
                    </div>
                ) : (
                    paginatedDispatches.map((dispatch: DispatchWithRelations) => {
                        // Calculate metrics
                        const totalGiven = dispatch.DispatchItems.reduce((acc: number, curr: DispatchItemWithItem) => acc + curr.quantity_given, 0);
                        const totalReturned = dispatch.DispatchItems.reduce((acc: number, curr: DispatchItemWithItem) => acc + curr.quantity_returned, 0);
                        const totalRefilled = (dispatch.RefillLogs as RefillLogWithMachine[]).reduce((acc: number, curr) => acc + curr.quantity_refilled, 0);
                        const totalRouteReturned = (dispatch.RefillLogs as any[]).reduce((acc: number, curr: any) => acc + (curr.expired_quantity || 0) + (curr.damaged_quantity || 0), 0);

                        // Shrinkage Variance = Given - (Refilled + RouteReturned + EndReturned)
                        const variance = totalGiven - (totalRefilled + totalRouteReturned + totalReturned);
                        const hasAnomaly = variance !== 0;

                        // Calculate Financial Impact
                        const financialVariance = dispatch.DispatchItems.reduce((acc: number, di: any) => {
                            const relatedRefills = (dispatch.RefillLogs as RefillLogWithMachine[]).filter((rl) => rl.itemId === di.itemId);
                            const totalItemRefilled = relatedRefills.reduce((a: number, c) => a + c.quantity_refilled, 0);
                            const itemVariance = di.quantity_given - (totalItemRefilled + di.quantity_returned);
                            return acc + (itemVariance * (di.price_at_dispatch || 0));
                        }, 0);

                        return (
                            <div key={dispatch.id} className="glass-panel border border-slate-300 shadow-sm dark:border-white/10 rounded-[2rem] p-6 md:p-8 relative overflow-hidden group">
                                {/* bg accent */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${hasAnomaly ? 'bg-accent-pink shadow-[0_0_20px_rgba(236,72,153,0.5)]' : 'bg-accent-green shadow-[0_0_20px_rgba(34,197,94,0.5)]'}`}></div>

                                <div className="flex flex-col md:flex-row items-start justify-between gap-6">
                                    {/* Left: Driver and Time */}
                                    <div className="flex items-center gap-5">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors ${hasAnomaly ? 'bg-accent-pink/10 border-accent-pink/20 text-accent-pink' : 'bg-accent-green/10 border-accent-green/20 text-accent-green'}`}>
                                            {hasAnomaly ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{dispatch.driver.name}</h3>
                                                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10">ID: {formatID(dispatch.id)}</span>
                                                {editingDispatchId !== dispatch.id ? (
                                                    <button
                                                        onClick={() => handleStartEdit(dispatch)}
                                                        className="ml-2 flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-500 dark:text-slate-400 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-200 dark:border-white/10"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" /> Edit Log
                                                    </button>
                                                ) : (
                                                    <div className="ml-2 flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleSaveEdit(dispatch.id)}
                                                            disabled={isPending}
                                                            className="flex items-center gap-1.5 px-3 py-1 bg-accent-green hover:bg-accent-green/90 text-black text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                                                        >
                                                            <Save className="w-3.5 h-3.5" /> {isPending ? "Saving..." : "Save Changes"}
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingDispatchId(null)}
                                                            disabled={isPending}
                                                            className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-white/5 hover:bg-accent-pink hover:text-slate-900 dark:hover:text-white text-slate-600 dark:text-slate-400 text-xs font-medium rounded-lg transition-colors border border-slate-200 dark:border-white/10 hover:border-accent-pink disabled:opacity-50"
                                                        >
                                                            <X className="w-3.5 h-3.5" /> Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-2 font-medium">
                                                {formatSaudiDate(dispatch.dispatch_date, { weekday: 'short', month: 'short', day: 'numeric' })} at {formatSaudiTime(dispatch.dispatch_date, { hour: 'numeric', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Right: Quantities */}
                                    <div className="flex items-center gap-4 bg-slate-100 dark:bg-black/20 rounded-xl p-4 border border-slate-200 dark:border-white/5 w-full md:w-auto overflow-x-auto scroll-fade-right custom-scrollbar">
                                        <div className="text-center px-4">
                                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Items Given</div>
                                            <div className="text-xl font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-300">{totalGiven}</div>
                                        </div>
                                        <div className="w-px h-8 bg-slate-100 dark:bg-white/5"></div>
                                        <div className="text-center px-4">
                                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Refilled</div>
                                            <div className="text-xl font-semibold text-accent-blue">{totalRefilled}</div>
                                        </div>
                                        <div className="w-px h-8 bg-slate-100 dark:bg-white/5"></div>
                                        <div className="text-center px-4">
                                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Route Returned</div>
                                            <div className="text-xl font-semibold text-accent-orange">{totalRouteReturned}</div>
                                        </div>
                                        <div className="w-px h-8 bg-slate-100 dark:bg-white/5"></div>
                                        <div className="text-center px-4">
                                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Returned</div>
                                            <div className="text-xl font-semibold text-accent-green">{totalReturned}</div>
                                        </div>

                                        {hasAnomaly && (
                                            <>
                                                <div className="w-px h-8 bg-white/10"></div>
                                                <div className="text-center px-4">
                                                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${variance > 0 ? 'text-accent-pink' : 'text-accent-orange'}`}>
                                                        {variance > 0 ? 'Missing' : 'Overage'}
                                                    </div>
                                                    <div className={`text-xl font-black ${variance > 0 ? 'text-accent-pink' : 'text-accent-orange'} flex flex-col items-center leading-none gap-1`}>
                                                        <span>{variance > 0 ? variance : `+${Math.abs(variance)}`}</span>
                                                        <span className="text-[10px] font-mono opacity-80">{variance > 0 ? '-' : '+'}{formatCurrency(Math.abs(financialVariance))}</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Divider */}
                                <hr className="border-slate-200 dark:border-white/5 my-6" />

                                {/* Detailed Summary */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Item Breakdown */}
                                    <div>
                                        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Package className="w-4 h-4 text-slate-500 dark:text-slate-400" /> Discrepancy Breakdown
                                        </h4>
                                        <div className="space-y-3">
                                            {dispatch.DispatchItems.map((di: any) => {
                                                const relatedRefills = (dispatch.RefillLogs as RefillLogWithMachine[]).filter((rl) => rl.itemId === di.itemId);
                                                const totalItemRefilled = relatedRefills.reduce((a: number, c) => a + c.quantity_refilled, 0);
                                                const totalItemRouteReturned = (relatedRefills as any[]).reduce((a: number, c: any) => a + (c.expired_quantity || 0) + (c.damaged_quantity || 0), 0);
                                                const itemVariance = di.quantity_given - (totalItemRefilled + totalItemRouteReturned + di.quantity_returned);

                                                const varianceValue = itemVariance * (di.price_at_dispatch || 0);

                                                return (
                                                    <div key={di.id} className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.02] border border-slate-200 dark:border-white/5">
                                                        <div className="flex justify-between items-start w-full">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-slate-900 dark:text-white text-sm">{di.item.name}</span>
                                                                <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10">{formatCurrency(di.price_at_dispatch || 0)}</span>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className={`text-sm font-bold leading-none ${itemVariance === 0 ? 'text-accent-green' : itemVariance > 0 ? 'text-accent-pink' : 'text-accent-orange'}`}>
                                                                    {itemVariance === 0 ? 'Match' : itemVariance > 0 ? `Missing ${itemVariance}` : `Overage (+${Math.abs(itemVariance)})`}
                                                                </span>
                                                                {itemVariance !== 0 && (
                                                                    <span className={`text-[10px] font-mono mt-1 ${itemVariance > 0 ? 'text-accent-pink/70' : 'text-accent-orange/70'}`}>
                                                                        {itemVariance > 0 ? '-' : '+'}{formatCurrency(Math.abs(varianceValue))}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono flex flex-wrap items-center gap-2 mt-1">
                                                            <span>Out: {di.quantity_given}</span>
                                                            <span className="text-slate-900 dark:text-white/20">|</span>
                                                            <span>Refill: {totalItemRefilled}</span>
                                                            <span className="text-slate-900 dark:text-white/20">|</span>
                                                            <span>Rtn(Route): {totalItemRouteReturned}</span>
                                                            <span className="text-slate-900 dark:text-white/20">|</span>
                                                            {editingDispatchId === dispatch.id ? (
                                                                <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/40 px-2 py-1 rounded-md border border-accent-blue/50">
                                                                    <span className="text-accent-blue font-bold">Rtn:</span>
                                                                    <NumericInput
                                                                        value={editQtys[di.id] ?? di.quantity_returned}
                                                                        onChange={(q) => setEditQtys({ ...editQtys, [di.id]: q })}
                                                                        className="w-16 bg-transparent text-slate-900 dark:text-white font-bold border-b border-slate-300 dark:border-white/20 focus:border-accent-blue focus:outline-none text-right"
                                                                        disabled={isPending}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <span>Rtn: {di.quantity_returned}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Machine Interactions */}
                                    <div>
                                        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" /> Route Stops
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {Array.from(new Set((dispatch.RefillLogs as RefillLogWithMachine[]).map((rl) => `${rl.machine.id}|${rl.machine.location_name}`))).map((m: string, i) => {
                                                const [id, loc] = m.split('|');
                                                const mCode = `M-${id.padStart(4, '0')}`;
                                                return (
                                                    <div key={i} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-300 shadow-sm dark:shadow-lg dark:shadow-black/50">
                                                        <span className="text-brand-500 font-mono font-bold mr-1.5">{mCode}</span>
                                                        {loc}
                                                    </div>
                                                );
                                            })}
                                            {dispatch.RefillLogs.length === 0 && (
                                                <div className="text-sm text-slate-500 dark:text-slate-400 italic">No machines visited on this route.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Client-side Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="p-2.5 rounded-xl glass-panel border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                        .reduce<(number | "...")[]>((acc, p, i, arr) => {
                            if (i > 0 && p - (arr[i - 1]) > 1) acc.push("...");
                            acc.push(p);
                            return acc;
                        }, [])
                        .map((p, i) =>
                            p === "..." ? (
                                <span key={`ellipsis-${i}`} className="px-2 py-1 text-slate-500 dark:text-slate-400 text-sm">…</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => setCurrentPage(p as number)}
                                    className={`min-w-[40px] h-10 rounded-xl text-sm font-semibold transition-all ${p === safePage
                                        ? 'bg-accent-blue text-slate-900 dark:text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                        : 'glass-panel border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/10'
                                        }`}
                                >
                                    {p}
                                </button>
                            )
                        )}

                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="p-2.5 rounded-xl glass-panel border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
