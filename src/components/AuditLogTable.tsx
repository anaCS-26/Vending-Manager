"use client";

import { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import Pagination from "@/components/Pagination";
import { getAuditLogsPaginated } from "@/actions/history";
import type { PaginatedResult, SystemAuditLogRow } from "@/types";
import { formatSaudiDate, formatSaudiTime } from "@/lib/utils";

type Props = {
    initialResult: PaginatedResult<SystemAuditLogRow>;
    actionTypes: string[];
    adminNames: Record<number, string>;
    driverNames: Record<number, string>;
};

const ROLE_OPTIONS = ["super_admin", "admin", "driver", "SYSTEM"];

export default function AuditLogTable({ initialResult, actionTypes, adminNames, driverNames }: Props) {
    const [result, setResult] = useState<PaginatedResult<SystemAuditLogRow>>(initialResult);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [actionType, setActionType] = useState("");
    const [actorRole, setActorRole] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const didMount = useRef(false);

    // Debounce the free-text search.
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    // Reset to first page whenever a filter changes.
    useEffect(() => {
        if (!didMount.current) return;
        setPage(1);
    }, [debouncedSearch, actionType, actorRole, dateFrom, dateTo]);

    // Fetch on filter / page change (skip the very first render — server gave us page 1).
    useEffect(() => {
        if (!didMount.current) {
            didMount.current = true;
            return;
        }
        let cancelled = false;
        setLoading(true);
        getAuditLogsPaginated({
            page,
            searchQuery: debouncedSearch || null,
            actionType: actionType || null,
            actorRole: actorRole || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
        })
            .then(res => { if (!cancelled) setResult(res); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [page, debouncedSearch, actionType, actorRole, dateFrom, dateTo]);

    const resolveActor = (row: SystemAuditLogRow): string => {
        if (row.actorId == null) return "System";
        if (row.actorRole === "driver") return driverNames[row.actorId] || `Driver #${row.actorId}`;
        return adminNames[row.actorId] || `#${row.actorId}`;
    };

    const inputCls = "bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-accent-blue/50 transition-colors";

    return (
        <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden">
            {/* Filters */}
            <div className="p-4 border-b border-slate-200 dark:border-white/5 flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search message, action, or entity..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={`${inputCls} w-full pl-9`}
                    />
                </div>
                <select value={actionType} onChange={(e) => setActionType(e.target.value)} className={`${inputCls} cursor-pointer`}>
                    <option value="">All actions</option>
                    {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={actorRole} onChange={(e) => setActorRole(e.target.value)} className={`${inputCls} cursor-pointer`}>
                    <option value="">All roles</option>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputCls} cursor-pointer`} aria-label="From date" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputCls} cursor-pointer`} aria-label="To date" />
            </div>

            {/* Header row */}
            <div className="hidden md:flex px-4 py-3 border-b border-slate-200 dark:border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-50 dark:bg-black/20">
                <div className="w-40">When</div>
                <div className="w-40">Actor</div>
                <div className="w-48">Action</div>
                <div className="flex-1">Details</div>
                <div className="w-8" />
            </div>

            {/* Rows */}
            <div className="relative">
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
                        <Loader2 className="w-6 h-6 text-accent-blue animate-spin" />
                    </div>
                )}

                {result.data.length === 0 ? (
                    <div className="p-16 text-center text-slate-500">No audit entries match these filters.</div>
                ) : (
                    result.data.map(row => {
                        const isOpen = expandedId === row.id;
                        const hasState = row.oldState != null || row.newState != null;
                        return (
                            <div key={row.id} className="border-b border-slate-200 dark:border-white/5 last:border-b-0">
                                <button
                                    onClick={() => hasState && setExpandedId(isOpen ? null : row.id)}
                                    className={`w-full text-left flex flex-col md:flex-row md:items-center px-4 py-3 gap-1 md:gap-0 transition-colors ${hasState ? 'hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer' : 'cursor-default'}`}
                                >
                                    <div className="w-40 shrink-0">
                                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{formatSaudiDate(row.timestamp)}</div>
                                        <div className="text-[11px] text-slate-500 font-mono">{formatSaudiTime(row.timestamp)}</div>
                                    </div>
                                    <div className="w-40 shrink-0">
                                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{resolveActor(row)}</div>
                                        <div className="text-[10px] uppercase tracking-wider text-slate-500">{row.actorRole}</div>
                                    </div>
                                    <div className="w-48 shrink-0">
                                        <span className="inline-block text-[11px] font-bold font-mono px-2 py-0.5 rounded-md bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                                            {row.actionType}
                                        </span>
                                        {row.entityType && (
                                            <div className="text-[10px] text-slate-500 mt-1 font-mono">
                                                {row.entityType}{row.entityId != null ? ` #${row.entityId}` : ''}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 text-sm text-slate-600 dark:text-slate-300 md:truncate">
                                        {row.message || <span className="text-slate-400 dark:text-slate-600 italic">—</span>}
                                    </div>
                                    <div className="w-8 shrink-0 hidden md:flex justify-center text-slate-500">
                                        {hasState && (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                                    </div>
                                </button>

                                {isOpen && hasState && (
                                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Before</p>
                                            <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg p-3 overflow-x-auto custom-scrollbar">
                                                {row.oldState != null ? JSON.stringify(row.oldState, null, 2) : "—"}
                                            </pre>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">After</p>
                                            <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-lg p-3 overflow-x-auto custom-scrollbar">
                                                {row.newState != null ? JSON.stringify(row.newState, null, 2) : "—"}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-4 border-t border-slate-200 dark:border-white/5 gap-4">
                <div className="text-xs text-slate-500">
                    {result.total} total entr{result.total === 1 ? 'y' : 'ies'}
                    {result.totalPages > 1 ? ` · page ${result.page} of ${result.totalPages}` : ''}
                </div>
                {result.totalPages > 1 && (
                    <Pagination
                        currentPage={result.page}
                        totalPages={result.totalPages}
                        onPageChange={(p) => setPage(p)}
                    />
                )}
            </div>
        </div>
    );
}
