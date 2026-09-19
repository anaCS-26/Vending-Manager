"use client";
import { useState, useEffect } from "react";
import { Package, MapPin, Search, TrendingDown, Scale } from "lucide-react";
import Pagination from "@/components/Pagination";
import type { MachineStockWithItem, MachineType } from "@/types";
import { cn, formatSaudiDate, formatSaudiTime } from "@/lib/utils";
import { DataCard, MobileSortSelect } from "@/components/DataCard";
import { CELL, FIT, ItemIdentity, SortableTh, itemDetailLine } from "@/components/StockTableBits";
import MachineAuditModal from "./MachineAuditModal";

type Props = {
    inventory: MachineStockWithItem[];
    machines: MachineType[];
};

export type MachineSortKey = "name" | "estimated_stock" | "last_refilled_at" | "location";

// Same keys as the column headers, so both views drive one `handleSort`.
const MOBILE_SORT_OPTIONS: { key: MachineSortKey; label: string }[] = [
    { key: "estimated_stock", label: "Est. stock" },
    { key: "name", label: "Item name" },
    { key: "last_refilled_at", label: "Last refill" },
    { key: "location", label: "Location" },
];

const PAGE_SIZE = 15;
/** Below this many units the row is flagged; at zero it's "empty". */
export const LOW_STOCK_BELOW = 5;

/** What a row shows, computed once for the table and the phone cards. */
export function deriveMachineRow(stock: MachineStockWithItem) {
    const qty = stock.estimated_stock;
    const level: "empty" | "low" | "ok" = qty === 0 ? "empty" : qty < LOW_STOCK_BELOW ? "low" : "ok";
    return {
        qty,
        level,
        refillDate: formatSaudiDate(stock.last_refilled_at),
        refillTime: formatSaudiTime(stock.last_refilled_at, { hour: "2-digit", minute: "2-digit" }),
        location: stock.machine?.location_name || "Unknown",
    };
}

export function sortMachineRows(
    rows: MachineStockWithItem[],
    sort: { key: MachineSortKey | null; direction: "asc" | "desc" },
): MachineStockWithItem[] {
    if (!sort.key) return rows;
    const key = sort.key;
    const pick = (s: MachineStockWithItem): string | number => {
        switch (key) {
            case "name": return s.item.name;
            case "estimated_stock": return s.estimated_stock;
            case "last_refilled_at": return new Date(s.last_refilled_at).getTime();
            case "location": return s.machine?.location_name || "";
        }
    };
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
        const av = pick(a), bv = pick(b);
        if (av < bv) return -dir;
        if (av > bv) return dir;
        return 0;
    });
}

const LEVEL_TEXT = {
    empty: "text-accent-pink",
    low: "text-accent-orange",
    ok: "text-slate-900 dark:text-white",
} as const;

export default function MachineInventoryTable({ inventory, machines }: Props) {
    const [selectedMachineId, setSelectedMachineId] = useState<number | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: MachineSortKey | null; direction: "asc" | "desc" }>({ key: null, direction: "desc" });
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedMachineId]);

    // With one machine picked, every row would say the same location.
    const showLocation = selectedMachineId === "all";

    let filteredInventory = selectedMachineId === "all"
        ? inventory
        : inventory.filter(stock => stock.machineId === selectedMachineId);

    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredInventory = filteredInventory.filter((stock, index) => {
            const srNumber = (index + 1).toString();
            return (
                stock.item.name.toLowerCase().includes(query) ||
                stock.item.sku.toLowerCase().includes(query) ||
                srNumber === query
            );
        });
    }

    const handleSort = (key: MachineSortKey) => {
        if (sortConfig.key === key) {
            setSortConfig({ key, direction: sortConfig.direction === "desc" ? "asc" : "desc" });
        } else {
            const isStringColumn = key === "name" || key === "location";
            setSortConfig({ key, direction: isStringColumn ? "asc" : "desc" });
        }
    };

    const sortedInventory = sortMachineRows(filteredInventory, sortConfig);
    const totalPages = Math.ceil(sortedInventory.length / PAGE_SIZE);
    const paginatedData = sortedInventory.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
    };

    return (
        <>
            <div className="glass-panel border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden relative shadow-xl">
                <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-200 dark:border-white/5 flex flex-col lg:flex-row items-start lg:items-center justify-between bg-white/[0.02] gap-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2 tracking-tight whitespace-nowrap">
                        <TrendingDown className="w-4 h-4 text-brand-400" />
                        Machine Stock Estimates
                    </h3>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                        <div className="relative flex-1 sm:min-w-[240px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search Name, SKU, or SR#"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500/50 transition-colors"
                            />
                        </div>

                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 min-w-[200px]">
                            <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <select
                                aria-label="Machine"
                                className="bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none w-full cursor-pointer appearance-none"
                                value={selectedMachineId}
                                onChange={(e) => setSelectedMachineId(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                            >
                                <option value="all" className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">All Machines</option>
                                {machines.map(m => (
                                    <option key={m.id} value={m.id} className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">
                                        {m.id} - {m.location_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={() => setIsAuditModalOpen(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 text-accent-blue rounded-xl text-sm font-bold transition-colors whitespace-nowrap"
                        >
                            <Scale className="w-4 h-4" />
                            Calibrate Stock
                        </button>
                    </div>
                </div>

                {/* Phone: cards. The table below is `hidden sm:block`. */}
                <div className="sm:hidden px-4 py-4 space-y-3">
                    <MobileSortSelect
                        options={MOBILE_SORT_OPTIONS}
                        sortKey={sortConfig.key}
                        direction={sortConfig.direction}
                        onSort={handleSort}
                    />
                    {paginatedData.map((stock, index) => {
                        const r = deriveMachineRow(stock);
                        const globalIndex = (currentPage - 1) * PAGE_SIZE + index + 1;
                        const detail = itemDetailLine(stock.item);

                        return (
                            <DataCard
                                key={`${stock.machineId}-${stock.itemId}`}
                                accentBorder={r.level !== "ok"}
                                title={
                                    <span className="uppercase">
                                        <span className="font-mono text-[10px] text-slate-400 mr-1.5">{globalIndex}</span>
                                        {stock.item.name}
                                    </span>
                                }
                                meta={
                                    <>
                                        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                                            #{stock.item.sku}
                                        </span>
                                        {detail && (
                                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{detail}</span>
                                        )}
                                    </>
                                }
                                highlight={{
                                    label: r.level === "empty" ? "Empty" : r.level === "low" ? "Running low" : "Est. units",
                                    value: r.qty.toLocaleString(),
                                    tone: r.level === "empty" ? "danger" : r.level === "low" ? "warn" : "default",
                                }}
                                fields={[
                                    ...(showLocation
                                        ? [{ label: "Location", value: r.location, tone: "muted" as const, wide: true }]
                                        : []),
                                    { label: "Last refill", value: `${r.refillDate} ${r.refillTime}`, tone: "muted", wide: true },
                                ]}
                            />
                        );
                    })}
                </div>

                {/*
                  Tablet and up. Columns key off this panel's width (`@container`):
                  Last refill from 672px, Location from 768px.
                */}
                <div className="hidden sm:block @container">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-white/5 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-black/20 tracking-wider">
                                    <th scope="col" className={cn(CELL, FIT, "font-bold uppercase text-center")}>#</th>
                                    <SortableTh columnKey="name" sortConfig={sortConfig} onSort={handleSort} className="min-w-[200px]">Item</SortableTh>
                                    <SortableTh columnKey="estimated_stock" sortConfig={sortConfig} onSort={handleSort} align="right" className={FIT}>Est. units</SortableTh>
                                    <SortableTh columnKey="last_refilled_at" sortConfig={sortConfig} onSort={handleSort} align="right" className={cn(FIT, "hidden @2xl:table-cell")}>Last refill</SortableTh>
                                    {showLocation && (
                                        <SortableTh columnKey="location" sortConfig={sortConfig} onSort={handleSort} className={cn(FIT, "hidden @3xl:table-cell")}>Location</SortableTh>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                                {paginatedData.map((stock, index) => {
                                    const r = deriveMachineRow(stock);
                                    const globalIndex = (currentPage - 1) * PAGE_SIZE + index + 1;

                                    return (
                                        <tr
                                            key={`${stock.machineId}-${stock.itemId}`}
                                            className={cn(
                                                "hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors",
                                                r.level === "empty" && "bg-accent-pink/[0.04]",
                                                r.level === "low" && "bg-accent-orange/[0.04]",
                                            )}
                                        >
                                            <td className={cn(CELL, FIT, "text-center font-mono text-[10px] text-slate-400 dark:text-slate-500")}>
                                                {globalIndex}
                                            </td>
                                            <td className={cn(CELL, "max-w-0 min-w-[200px]")}>
                                                <ItemIdentity item={stock.item} />
                                            </td>
                                            <td className={cn(CELL, FIT, "text-right")}>
                                                <div className={cn("text-sm font-bold", LEVEL_TEXT[r.level])}>{r.qty.toLocaleString()}</div>
                                                {r.level !== "ok" && (
                                                    <div className={cn("text-[10px] font-semibold leading-tight", LEVEL_TEXT[r.level])}>
                                                        {r.level === "empty" ? "Empty" : "Running low"}
                                                    </div>
                                                )}
                                            </td>
                                            <td className={cn(CELL, FIT, "text-right hidden @2xl:table-cell")}>
                                                <div className="text-sm text-slate-600 dark:text-slate-300">{r.refillDate}</div>
                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{r.refillTime}</div>
                                            </td>
                                            {showLocation && (
                                                <td className={cn(CELL, FIT, "text-xs text-slate-500 dark:text-slate-400 hidden @3xl:table-cell")}>
                                                    {r.location}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {sortedInventory.length === 0 && (
                    <div className="p-8 sm:p-16 text-center flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 mb-4">
                            <Package className="w-8 h-8 text-slate-500 dark:text-slate-400 opacity-50" />
                        </div>
                        <p className="text-slate-900 dark:text-white font-bold mb-1">No Machine Stock Data</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Restock machines via driver portal to see estimates.</p>
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 bg-slate-50/50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/5 gap-3">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center sm:text-left">
                            Showing <span className="text-slate-900 dark:text-white font-bold">{(currentPage - 1) * PAGE_SIZE + 1}</span> to <span className="text-slate-900 dark:text-white font-bold">{Math.min(currentPage * PAGE_SIZE, sortedInventory.length)}</span> of <span className="text-slate-900 dark:text-white font-bold">{sortedInventory.length}</span> items
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                        />
                    </div>
                )}
            </div>

            <MachineAuditModal
                isOpen={isAuditModalOpen}
                onClose={() => setIsAuditModalOpen(false)}
                inventory={inventory}
                machines={machines}
            />
        </>
    );
}
