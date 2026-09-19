"use client";
import { useState, useEffect } from "react";
import { Package, MapPin, Search, Scale, AlertTriangle } from "lucide-react";
import Pagination from "@/components/Pagination";
import type { WarehouseWithItem, WarehouseType } from "@/types";
import type { Item } from "@prisma/client";
import { cn, formatCurrency } from "@/lib/utils";
import { DataCard, MobileSortSelect } from "@/components/DataCard";
import { describeInBoxes } from "@/lib/packaging";
import { CELL, FIT, ItemIdentity, SortableTh, itemDetailLine } from "@/components/StockTableBits";
import WarehouseAuditModal from "./WarehouseAuditModal";
import CostCorrectionModal from "./CostCorrectionModal";

type Props = {
    inventory: WarehouseWithItem[];
    warehouses: WarehouseType[];
    existingItems: Item[];
    isSuperAdmin?: boolean;
};

export type WarehouseSortKey = "name" | "quantity_on_hand" | "pending_deficit" | "cost" | "price_standard" | "total_amount" | "location";

// Same keys as the column headers, so both views drive one `handleSort`.
const MOBILE_SORT_OPTIONS: { key: WarehouseSortKey; label: string }[] = [
    { key: "name", label: "Item name" },
    { key: "quantity_on_hand", label: "In stock" },
    { key: "total_amount", label: "Stock value" },
    { key: "cost", label: "Unit cost" },
    { key: "price_standard", label: "Sell price" },
    { key: "pending_deficit", label: "Owed by supplier" },
    { key: "location", label: "Location" },
];

const PAGE_SIZE = 15;

/**
 * Everything a row shows, computed once so the table and the phone cards
 * can't disagree. Exported for the tests.
 */
export function deriveWarehouseRow(stock: WarehouseWithItem) {
    const item = stock.item;
    const cost = item.cost || 0;
    const qty = stock.quantity_on_hand;
    const hospital = item.price_hospital || 0;
    const hotel = item.price_hotel || 0;
    // The tier prices only earn a line when they differ from the standard
    // price — on this catalogue that is most rows, but not all.
    const tierPrices = hospital !== item.price_standard || hotel !== item.price_standard ? { hospital, hotel } : null;
    return {
        qty,
        isZero: qty === 0,
        inBoxes: qty === 0 ? null : describeInBoxes(qty, item.pieces_per_box),
        owed: stock.pending_deficit > 0 ? stock.pending_deficit : 0,
        cost,
        price: item.price_standard,
        tierPrices,
        value: qty * cost,
        location: stock.warehouse?.name || "Unknown",
    };
}

export function sortWarehouseRows(
    rows: WarehouseWithItem[],
    sort: { key: WarehouseSortKey | null; direction: "asc" | "desc" },
): WarehouseWithItem[] {
    if (!sort.key) return rows;
    const key = sort.key;
    const pick = (s: WarehouseWithItem): string | number => {
        switch (key) {
            case "name": return s.item.name;
            case "quantity_on_hand": return s.quantity_on_hand;
            case "pending_deficit": return s.pending_deficit;
            case "cost": return s.item.cost || 0;
            case "price_standard": return s.item.price_standard || 0;
            case "total_amount": return s.quantity_on_hand * (s.item.cost || 0);
            case "location": return s.warehouse?.name || "";
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

export default function WarehouseInventoryTable({ inventory, warehouses, existingItems, isSuperAdmin = false }: Props) {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: WarehouseSortKey | null; direction: "asc" | "desc" }>({ key: null, direction: "desc" });
    const [currentPage, setCurrentPage] = useState(1);
    const [isRecountOpen, setIsRecountOpen] = useState(false);
    const [isCostOpen, setIsCostOpen] = useState(false);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedWarehouseId]);

    // A Location column only means something when there is more than one
    // location on the page.
    const showLocation = selectedWarehouseId === "all" && warehouses.length > 1;

    let filteredInventory = selectedWarehouseId === "all"
        ? inventory
        : inventory.filter(stock => stock.warehouseId === selectedWarehouseId);

    // Search by name, item code, or the row's SR# as listed.
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

    const handleSort = (key: WarehouseSortKey) => {
        if (sortConfig.key === key) {
            setSortConfig({ key, direction: sortConfig.direction === "desc" ? "asc" : "desc" });
        } else {
            const isStringColumn = key === "name" || key === "location";
            setSortConfig({ key, direction: isStringColumn ? "asc" : "desc" });
        }
    };

    const sortedInventory = sortWarehouseRows(filteredInventory, sortConfig);
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
                        <Package className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        Inventory Tracker
                    </h3>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                        <div className="relative flex-1 sm:min-w-[240px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search Name, Code, or SR#"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500/50 transition-colors"
                            />
                        </div>

                        {warehouses.length > 1 && (
                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 min-w-[200px]">
                                <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                <select
                                    aria-label="Location"
                                    className="bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none w-full cursor-pointer appearance-none"
                                    value={selectedWarehouseId}
                                    onChange={(e) => setSelectedWarehouseId(e.target.value === "all" ? "all" : parseInt(e.target.value))}
                                >
                                    <option value="all" className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">All Locations</option>
                                    {warehouses.map(w => (
                                        <option key={w.id} value={w.id} className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">
                                            {w.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsRecountOpen(true)}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 text-accent-blue rounded-xl text-sm font-bold transition-colors whitespace-nowrap"
                            >
                                <Scale className="w-4 h-4" />
                                Calibrate Stock
                            </button>
                            {isSuperAdmin && (
                                <button
                                    onClick={() => setIsCostOpen(true)}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-accent-orange/10 hover:bg-accent-orange/20 border border-accent-orange/30 text-accent-orange rounded-xl text-sm font-bold transition-colors whitespace-nowrap"
                                >
                                    <AlertTriangle className="w-4 h-4" />
                                    Correct Cost
                                </button>
                            )}
                        </div>
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
                        const r = deriveWarehouseRow(stock);
                        const globalIndex = (currentPage - 1) * PAGE_SIZE + index + 1;
                        const detail = itemDetailLine(stock.item);

                        return (
                            <DataCard
                                key={`${stock.warehouseId}-${stock.itemId}`}
                                accentBorder={r.owed > 0}
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
                                        {showLocation && (
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                                {r.location}
                                            </span>
                                        )}
                                    </>
                                }
                                highlight={{
                                    label: "In stock",
                                    value: (
                                        <>
                                            {r.qty.toLocaleString()}
                                            {r.inBoxes && (
                                                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                    {r.inBoxes}
                                                </span>
                                            )}
                                        </>
                                    ),
                                    tone: r.isZero ? "warn" : "default",
                                }}
                                fields={[
                                    { label: "Sell price", value: formatCurrency(r.price) },
                                    { label: "Unit cost", value: formatCurrency(r.cost), tone: "muted" },
                                    ...(r.tierPrices
                                        ? [{
                                            label: "Hospital / hotel price",
                                            value: `${formatCurrency(r.tierPrices.hospital)} / ${formatCurrency(r.tierPrices.hotel)}`,
                                            tone: "muted" as const,
                                            wide: true,
                                        }]
                                        : []),
                                    { label: "Stock value", value: formatCurrency(r.value), tone: r.isZero ? "warn" : "default" },
                                    // Only worth a slot when there is one.
                                    ...(r.owed > 0
                                        ? [{ label: "Owed by supplier", value: `+${r.owed.toLocaleString()}`, tone: "warn" as const }]
                                        : []),
                                ]}
                            />
                        );
                    })}
                </div>

                {/*
                  Tablet and up. `@container` makes the `@2xl:`/`@3xl:`/`@4xl:`
                  columns key off this panel's width: Unit cost from 672px, Stock
                  value from 768px, Location from 896px. Item takes the remaining
                  width, so nothing wraps and nothing scrolls sideways.
                */}
                <div className="hidden sm:block @container">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-white/5 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-black/20 tracking-wider">
                                    <th scope="col" className={cn(CELL, FIT, "font-bold uppercase text-center")}>#</th>
                                    <SortableTh columnKey="name" sortConfig={sortConfig} onSort={handleSort} className="min-w-[200px]">Item</SortableTh>
                                    <SortableTh columnKey="quantity_on_hand" sortConfig={sortConfig} onSort={handleSort} align="right" className={FIT}>In stock</SortableTh>
                                    <SortableTh columnKey="cost" sortConfig={sortConfig} onSort={handleSort} align="right" className={cn(FIT, "hidden @2xl:table-cell")}>Unit cost</SortableTh>
                                    <SortableTh columnKey="price_standard" sortConfig={sortConfig} onSort={handleSort} align="right" className={FIT}>Sell price</SortableTh>
                                    <SortableTh columnKey="total_amount" sortConfig={sortConfig} onSort={handleSort} align="right" className={cn(FIT, "hidden @3xl:table-cell")}>Stock value</SortableTh>
                                    {showLocation && (
                                        <SortableTh columnKey="location" sortConfig={sortConfig} onSort={handleSort} className={cn(FIT, "hidden @4xl:table-cell")}>Location</SortableTh>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                                {paginatedData.map((stock, index) => {
                                    const r = deriveWarehouseRow(stock);
                                    const globalIndex = (currentPage - 1) * PAGE_SIZE + index + 1;

                                    return (
                                        <tr
                                            key={`${stock.warehouseId}-${stock.itemId}`}
                                            className={cn(
                                                "hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors",
                                                r.isZero && "bg-accent-orange/[0.04]",
                                            )}
                                        >
                                            <td className={cn(CELL, FIT, "text-center font-mono text-[10px] text-slate-400 dark:text-slate-500")}>
                                                {globalIndex}
                                            </td>
                                            <td className={cn(CELL, "max-w-0 min-w-[200px]")}>
                                                <ItemIdentity item={stock.item} />
                                            </td>
                                            <td className={cn(CELL, FIT, "text-right")}>
                                                <div className={cn("text-sm font-bold", r.isZero ? "text-accent-orange" : "text-slate-900 dark:text-white")}>
                                                    {r.isZero ? "0 · empty" : r.qty.toLocaleString()}
                                                </div>
                                                {r.inBoxes && (
                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{r.inBoxes}</div>
                                                )}
                                                {r.owed > 0 && (
                                                    <div className="text-[10px] font-semibold text-accent-orange leading-tight">
                                                        +{r.owed.toLocaleString()} owed by supplier
                                                    </div>
                                                )}
                                            </td>
                                            <td className={cn(CELL, FIT, "text-right text-sm text-slate-500 dark:text-slate-400 hidden @2xl:table-cell")} dir="ltr">
                                                {formatCurrency(r.cost)}
                                            </td>
                                            <td className={cn(CELL, FIT, "text-right")} dir="ltr">
                                                <div className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(r.price)}</div>
                                                {r.tierPrices && (
                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                                                        Hosp {formatCurrency(r.tierPrices.hospital)} · Hotel {formatCurrency(r.tierPrices.hotel)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className={cn(CELL, FIT, "text-right text-sm font-semibold hidden @3xl:table-cell", r.isZero ? "text-accent-orange/80" : "text-slate-600 dark:text-slate-300")} dir="ltr">
                                                {formatCurrency(r.value)}
                                            </td>
                                            {showLocation && (
                                                <td className={cn(CELL, FIT, "text-xs text-slate-500 dark:text-slate-400 hidden @4xl:table-cell")}>
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
                        <p className="text-slate-900 dark:text-white font-bold mb-1">No Inventory Found</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Try adjusting your search or add new stock.</p>
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

            <WarehouseAuditModal
                isOpen={isRecountOpen}
                onClose={() => setIsRecountOpen(false)}
                inventory={inventory}
                warehouses={warehouses}
            />
            {isSuperAdmin && (
                <CostCorrectionModal
                    isOpen={isCostOpen}
                    onClose={() => setIsCostOpen(false)}
                    items={existingItems}
                />
            )}
        </>
    );
}
