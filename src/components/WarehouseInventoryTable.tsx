"use client";
import { useState, useRef, useEffect } from "react";
import { Package, MapPin, Search, Plus, AlertCircle, ArrowUp, ArrowDown } from "lucide-react";
import type { WarehouseWithItem, WarehouseType } from "@/types";
import type { Item } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

type Props = {
    inventory: WarehouseWithItem[];
    warehouses: WarehouseType[];
    existingItems: Item[];
};

type SortKey = "name" | "quantity_on_hand" | "pending_deficit" | "cost" | "price_standard" | "price_hospital" | "price_hotel" | "total_amount" | "location";

export default function WarehouseInventoryTable({ inventory, warehouses, existingItems }: Props) {
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const [tableWidth, setTableWidth] = useState<number>(900);
    const [isScrollable, setIsScrollable] = useState(false);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: SortKey | null; direction: "asc" | "desc" }>({ key: null, direction: "desc" });

    // Filter stock based on selected warehouse
    let filteredInventory = selectedWarehouseId === "all"
        ? inventory
        : inventory.filter(stock => stock.warehouseId === selectedWarehouseId);

    // Filter by search query (Item Code/SKU, Name, or SR# via index)
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

    const handleSort = (key: SortKey) => {
        if (sortConfig.key === key) {
            setSortConfig({ key, direction: sortConfig.direction === "desc" ? "asc" : "desc" });
        } else {
            // Defaulting string columns to asc, numbers to desc
            const isStringColumn = key === "name" || key === "location";
            setSortConfig({ key, direction: isStringColumn ? "asc" : "desc" });
        }
    };

    const sortedInventory = [...filteredInventory].sort((a, b) => {
        if (!sortConfig.key) return 0;

        let aVal: any = 0;
        let bVal: any = 0;

        switch (sortConfig.key) {
            case "name":
                aVal = a.item.name;
                bVal = b.item.name;
                break;
            case "quantity_on_hand":
                aVal = a.quantity_on_hand;
                bVal = b.quantity_on_hand;
                break;
            case "pending_deficit":
                aVal = a.pending_deficit;
                bVal = b.pending_deficit;
                break;
            case "cost":
                aVal = (a.item as any).cost || 0;
                bVal = (b.item as any).cost || 0;
                break;
            case "price_standard":
                aVal = (a.item as any).price_standard || 0;
                bVal = (b.item as any).price_standard || 0;
                break;
            case "price_hospital":
                aVal = (a.item as any).price_hospital || 0;
                bVal = (b.item as any).price_hospital || 0;
                break;
            case "price_hotel":
                aVal = (a.item as any).price_hotel || 0;
                bVal = (b.item as any).price_hotel || 0;
                break;
            case "total_amount":
                aVal = a.quantity_on_hand * ((a.item as any).cost || 0);
                bVal = b.quantity_on_hand * ((b.item as any).cost || 0);
                break;
            case "location":
                aVal = a.warehouse?.name || "";
                bVal = b.warehouse?.name || "";
                break;
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
    });

    const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
        if (sortConfig.key !== columnKey) return <span className="w-4 h-4 inline-block ml-1 opacity-0 group-hover:opacity-30 transition-opacity" />;
        return sortConfig.direction === "desc" 
            ? <ArrowDown className="w-4 h-4 ml-1 inline-block text-brand-500" />
            : <ArrowUp className="w-4 h-4 ml-1 inline-block text-brand-500" />;
    };

    // Keep the top scrollbar track perfectly synchronized with the true width of the table content
    useEffect(() => {
        if (!tableScrollRef.current) return;
        const observer = new ResizeObserver(() => {
            if (tableScrollRef.current) {
                const scrollW = tableScrollRef.current.scrollWidth;
                const clientW = tableScrollRef.current.clientWidth;
                setTableWidth(scrollW);
                setIsScrollable(scrollW > clientW);
            }
        });
        observer.observe(tableScrollRef.current);
        if (tableScrollRef.current.firstElementChild) {
            observer.observe(tableScrollRef.current.firstElementChild);
        }
        return () => observer.disconnect();
    }, [filteredInventory]);

    return (
        <>
            <div className="glass-panel border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden relative space-y-4 shadow-xl">
                <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 flex flex-col lg:flex-row items-start lg:items-center justify-between bg-white/[0.02] gap-4">
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

                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 min-w-[200px]">
                            <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <select
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
                    </div>
                </div>

                {isScrollable && (
                    <div 
                        className="overflow-x-auto custom-scrollbar w-full border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]" 
                        ref={topScrollRef} 
                        style={{ height: '14px' }}
                        onScroll={(e) => {
                            if (tableScrollRef.current && topScrollRef.current) {
                                tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
                            }
                        }}
                    >
                        <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                    </div>
                )}
                
                <div 
                    className="overflow-x-auto custom-scrollbar"
                    ref={tableScrollRef}
                    onScroll={(e) => {
                        if (tableScrollRef.current && topScrollRef.current) {
                            topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
                        }
                    }}
                >
                    <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-white/5 text-[11px] text-slate-600 dark:text-slate-400 font-bold bg-slate-50 dark:bg-black/20 tracking-wider">
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase w-16 text-center whitespace-nowrap">SR #</th>
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap" onClick={() => handleSort("name")}>
                                    <div className="flex items-center">Item Name <SortIcon columnKey="name" /></div>
                                </th>
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap leading-snug" onClick={() => handleSort("quantity_on_hand")}>
                                    <div className="flex items-center justify-end"><SortIcon columnKey="quantity_on_hand" /> Stock Remain</div>
                                </th>
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap leading-snug" onClick={() => handleSort("pending_deficit")}>
                                    <div className="flex items-center justify-end"><SortIcon columnKey="pending_deficit" /> Due / Owed</div>
                                </th>
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap leading-snug" onClick={() => handleSort("cost")}>
                                    <div className="flex items-center justify-end"><SortIcon columnKey="cost" /> Unit Cost</div>
                                </th>
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap leading-snug" onClick={() => handleSort("price_standard")}>
                                    <div className="flex items-center justify-end"><SortIcon columnKey="price_standard" /> Std Price</div>
                                </th>
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right text-slate-400 cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap leading-snug" onClick={() => handleSort("price_hospital")}>
                                    <div className="flex items-center justify-end"><SortIcon columnKey="price_hospital" /> Hosp Price</div>
                                </th>
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right text-slate-400 cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap leading-snug" onClick={() => handleSort("price_hotel")}>
                                    <div className="flex items-center justify-end"><SortIcon columnKey="price_hotel" /> Hotel Price</div>
                                </th>
                                <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap leading-snug" onClick={() => handleSort("total_amount")}>
                                    <div className="flex items-center justify-end"><SortIcon columnKey="total_amount" /> Total Value</div>
                                </th>
                                {selectedWarehouseId === "all" && (
                                    <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-center cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap" onClick={() => handleSort("location")}>
                                        <div className="flex items-center justify-center">Location <SortIcon columnKey="location" /></div>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                            {sortedInventory.map((stock, index) => {
                                const totalAmount = stock.quantity_on_hand * (stock.item as any).cost;
                                const bulkFormat = (stock.item as any).bulk_format ? ` (${(stock.item as any).bulk_format}) ` : " ";
                                const isZero = stock.quantity_on_hand === 0;

                                return (
                                    <tr key={`${stock.warehouseId}-${stock.itemId}`} className={`group hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 border-b border-slate-200 dark:border-white/[0.02] last:border-0 ${isZero ? 'bg-yellow-500/[0.02]' : ''}`}>
                                        <td className="px-3 py-3 md:px-6 md:py-4 text-center font-mono text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300 transition-colors">
                                            {index + 1}
                                        </td>
                                        <td className="px-3 py-3 md:px-6 md:py-4">
                                            <div className="flex flex-col gap-0.5 group/name">
                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-900 dark:text-white text-xs md:text-sm tracking-tight group-hover/name:text-brand-400 transition-colors uppercase">
                                                        {stock.item.name}
                                                    </span>
                                                    {bulkFormat.trim() && (
                                                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/5 uppercase tracking-wide">
                                                            {bulkFormat.trim()}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                                                        #{stock.item.sku}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{stock.item.category}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {isZero && <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />}
                                                <span className={`text-xs md:text-sm font-bold font-mono ${isZero ? 'text-yellow-500' : 'text-slate-900 dark:text-white'}`}>
                                                    {stock.quantity_on_hand.toLocaleString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className={`text-xs md:text-sm font-bold font-mono ${stock.pending_deficit > 0 ? 'text-accent-orange' : 'text-slate-400 opacity-50'}`}>
                                                    {stock.pending_deficit > 0 ? `+${stock.pending_deficit.toLocaleString()}` : '0'}
                                                </span>
                                                {stock.pending_deficit > 0 && (
                                                    <span className="text-[9px] font-bold text-accent-orange/70 uppercase tracking-tighter">Owed by Supplier</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                            <span className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap" dir="ltr">
                                                {formatCurrency((stock.item as any).cost || 0)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                            <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white font-mono whitespace-nowrap" dir="ltr">
                                                {formatCurrency((stock.item as any).price_standard)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                            <span className="text-xs md:text-sm font-bold text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap" dir="ltr">
                                                {formatCurrency((stock.item as any).price_hospital || 0)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                            <span className="text-xs md:text-sm font-bold text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap" dir="ltr">
                                                {formatCurrency((stock.item as any).price_hotel || 0)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                            <span className={`text-xs md:text-sm font-bold font-mono whitespace-nowrap ${isZero ? 'text-yellow-600/80' : 'text-slate-600 dark:text-slate-400'}`} dir="ltr">
                                                {formatCurrency(totalAmount)}
                                            </span>
                                        </td>
                                        {selectedWarehouseId === "all" && (
                                            <td className="px-3 py-3 md:px-6 md:py-4 text-center">
                                                <span className="block mx-auto px-2 py-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 dark:text-slate-300 text-[10px] font-bold uppercase tracking-widest rounded-md truncate max-w-[150px]">
                                                    {stock.warehouse?.name || 'Unknown'}
                                                </span>
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {sortedInventory.length === 0 && (
                    <div className="p-16 text-center flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 mb-4">
                            <Package className="w-8 h-8 text-slate-500 dark:text-slate-400 opacity-50" />
                        </div>
                        <p className="text-slate-900 dark:text-white font-bold mb-1">No Inventory Found</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Try adjusting your search or add new stock.</p>
                    </div>
                )}
            </div>

        </>
    );
}
