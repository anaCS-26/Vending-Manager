"use client";

import React, { useState, useTransition, useEffect, useRef } from "react";
import {
    History,
    Search,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    MapPin,
    User,
    Building2,
    Loader2,
    Calendar,
    X,
    Package
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatID, formatSaudiDate, formatSaudiTime } from "@/lib/utils";
import { getRefillLogsPaginated, type RefillLogRow } from "@/actions/history";
import { EditLogModal } from "./EditLogModal";
import type { PaginatedResult } from "@/types";

type DriverOption = { id: number; name: string };
type MachineOption = { id: number; location_name: string };

type UnifiedHistoryManagerProps = {
    initialEvents: PaginatedResult<RefillLogRow>;
    drivers: DriverOption[];
    machines: MachineOption[];
};

export default function UnifiedHistoryManager({ initialEvents, drivers, machines }: UnifiedHistoryManagerProps) {
    const [searchQuery, setSearchQuery] = useState("");

    // EVENTS-tab server-driven state
    const [eventDriverId, setEventDriverId] = useState<number | "">("");
    const [eventMachineId, setEventMachineId] = useState<number | "">("");
    const [eventDateFrom, setEventDateFrom] = useState<string>("");
    const [eventDateTo, setEventDateTo] = useState<string>("");
    const [eventPage, setEventPage] = useState(1);
    const [eventData, setEventData] = useState<PaginatedResult<RefillLogRow>>(initialEvents);
    const [isFetchingEvents, startEventsFetch] = useTransition();
    const eventsInitialMount = useRef(true);

    // Re-fetch events whenever any events-tab filter changes (skips first mount — initialEvents is already correct)
    useEffect(() => {
        if (eventsInitialMount.current) {
            eventsInitialMount.current = false;
            return;
        }
        startEventsFetch(async () => {
            const result = await getRefillLogsPaginated({
                driverId: eventDriverId === "" ? null : eventDriverId,
                machineId: eventMachineId === "" ? null : eventMachineId,
                dateFrom: eventDateFrom || null,
                dateTo: eventDateTo || null,
                searchQuery: searchQuery,
                page: eventPage,
            });
            setEventData(result);
        });
    }, [eventDriverId, eventMachineId, eventDateFrom, eventDateTo, eventPage, searchQuery]);

    // Reset events pagination when any filter (other than page itself) changes
    const resetEventsPage = () => setEventPage(1);

    const totalPages = eventData.totalPages;
    const safePage = Math.min(eventPage, totalPages);
    const paginatedLogs = eventData.data;

    const goToPage = (p: number) => {
        setEventPage(p);
    };

    const hasActiveEventFilters = eventDriverId !== "" || eventMachineId !== "" || eventDateFrom !== "" || eventDateTo !== "";
    const clearEventFilters = () => {
        setEventDriverId("");
        setEventMachineId("");
        setEventDateFrom("");
        setEventDateTo("");
        setEventPage(1);
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
                        Comprehensive ledger of restock events, returns, and audit verifications.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                    {/* Search - Standardized layout */}
                    <div className="w-full sm:w-64 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-2.5 flex items-center gap-2 focus-within:border-brand-500/50 focus-within:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all">
                        <Search className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setEventPage(1); }}
                            placeholder="Search archive..."
                            className="bg-transparent border-none outline-none text-sm text-slate-900 dark:text-white w-full placeholder:text-slate-500 dark:text-slate-400"
                        />
                    </div>
                </div>
            </div>

            {/* Event Filters */}
            <div className="flex flex-wrap items-end gap-3 px-1">
                <div className="flex flex-col gap-1 min-w-[180px]">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <User className="w-3 h-3" /> Driver
                    </label>
                    <select
                        value={eventDriverId}
                        onChange={(e) => { setEventDriverId(e.target.value === "" ? "" : Number(e.target.value)); resetEventsPage(); }}
                        className="bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-brand-500/50 transition-all"
                    >
                        <option value="">All drivers</option>
                        {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1 min-w-[200px]">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Building2 className="w-3 h-3" /> Machine
                    </label>
                    <select
                        value={eventMachineId}
                        onChange={(e) => { setEventMachineId(e.target.value === "" ? "" : Number(e.target.value)); resetEventsPage(); }}
                        className="bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-brand-500/50 transition-all"
                    >
                        <option value="">All machines</option>
                        {machines.map(m => (
                            <option key={m.id} value={m.id}>{m.location_name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" /> From
                    </label>
                    <input
                        type="date"
                        value={eventDateFrom}
                        onChange={(e) => { setEventDateFrom(e.target.value); resetEventsPage(); }}
                        className="bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-brand-500/50 transition-all"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" /> To
                    </label>
                    <input
                        type="date"
                        value={eventDateTo}
                        onChange={(e) => { setEventDateTo(e.target.value); resetEventsPage(); }}
                        className="bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-brand-500/50 transition-all"
                    />
                </div>

                {hasActiveEventFilters && (
                    <button
                        onClick={clearEventFilters}
                        className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/40 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-all flex items-center gap-1.5 self-end"
                    >
                        <X className="w-3 h-3" /> Clear filters
                    </button>
                )}

                {isFetchingEvents && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 self-end pb-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
                    </div>
                )}

                <div className="ml-auto self-end pb-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                    {eventData.total.toLocaleString()} {eventData.total === 1 ? 'event' : 'events'}
                </div>
            </div>

            {/* Content Area */}
            <div className="relative min-h-[500px]">
                <AnimatePresence mode="wait">
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
                                        <th className="py-3 px-3 md:py-4 md:px-6 text-left">Source</th>
                                        <th className="py-3 px-3 md:py-4 md:px-6 text-left">Product Asset</th>
                                        <th className="py-3 px-3 md:py-4 md:px-6 text-center">Inventory Action</th>
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
                </AnimatePresence>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-6">
                    <button
                        onClick={() => goToPage(1)}
                        disabled={safePage === 1}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
                        title="First Page"
                    >
                        <ChevronsLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                        onClick={() => goToPage(Math.max(1, safePage - 1))}
                        disabled={safePage === 1}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
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
                                    onClick={() => goToPage(p)}
                                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl text-xs font-bold transition-all shadow-sm ${p === safePage ? 'bg-brand-500 text-white dark:text-white border border-brand-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-white/20'}`}
                                >
                                    {p}
                                </button>
                            </React.Fragment>
                        ))}

                    <button
                        onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
                        disabled={safePage === totalPages}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
                        title="Next Page"
                    >
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                        onClick={() => goToPage(totalPages)}
                        disabled={safePage === totalPages}
                        className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-all shadow-sm"
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

function EventRow({ log }: { log: any }) {
    const driverName = log.dispatch?.driver?.name || log.driver?.name || "System/Unknown";
    const driverInitials = driverName !== "System/Unknown" ? driverName.charAt(0) : "?";
    
    let verifiedLoss = 0;
    let pendingCount = 0;
    
    if (log.isSurplusReturn) {
        verifiedLoss = log._customVerifiedCount || 0;
        pendingCount = log._customPendingCount || 0;
    } else {
        const allVerifs = (log._customMachineReturnVerifs || log.dispatch?.ReturnVerifications || []).filter((v: any) => v.itemId === log.itemId);
        const approved = allVerifs.filter((v: any) => v.status === 'APPROVED' || v.status === 'RESTOCK' || v.status === 'LOSS');
        const pending = allVerifs.filter((v: any) => v.status === 'PENDING');
        verifiedLoss = approved.reduce((s: number, v: any) => s + v.quantity, 0);
        pendingCount = pending.reduce((s: number, v: any) => s + v.quantity, 0);
    }

    return (
        <tr className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 border-b border-slate-200 dark:border-white/[0.02] last:border-0 border-l-[3px] border-l-transparent hover:border-l-brand-500 group flex-row">
            <td className="py-3 px-3 md:py-5 md:px-6">
                <div className="flex flex-col">
                    <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{formatSaudiDate(log.refilled_at)}</span>
                    <span className="text-[9px] md:text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">{formatSaudiTime(log.refilled_at, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
            </td>
            <td className="py-3 px-3 md:py-5 md:px-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold text-xs uppercase shadow-sm">
                        {driverInitials}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{driverName}</span>
                        <span className="text-[9px] md:text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {log.dispatchId ? `Route #${formatID(log.dispatchId)}` : `Direct Action`}
                        </span>
                    </div>
                </div>
            </td>
            <td className="py-3 px-3 md:py-5 md:px-6">
                <div className="flex flex-col">
                    <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">
                        {log.isSurplusReturn ? `${driverName}'s Stock` : (log.machine?.location_name || "Unknown")}
                    </span>
                    <span className="text-[9px] md:text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                        {log.isSurplusReturn ? (
                            <><Package className="w-3 h-3 text-slate-400" /> Driver Bag Return</>
                        ) : (
                            <><MapPin className="w-3 h-3 text-slate-400" /> {log.machine ? `M-${log.machine.id.toString().padStart(4, '0')}` : "N/A"}</>
                        )}
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
                    <EditLogModal log={log} verifiedCount={verifiedLoss} pendingCount={pendingCount} />
                </div>
            </td>
        </tr>
    );
}
