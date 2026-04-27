"use client";
import { useState, useRef, useEffect } from "react";
import { Package, MapPin, Search, AlertCircle, TrendingDown, Clock, ArrowUp, ArrowDown } from "lucide-react";
import type { MachineStockWithItem, MachineType } from "@/types";
import { formatCurrency } from "@/lib/utils";
import MachineAuditModal from "./MachineAuditModal";

type Props = {
    inventory: MachineStockWithItem[];
    machines: MachineType[];
};

type SortKey = "name" | "estimated_stock" | "last_refilled_at" | "location";

export default function MachineInventoryTable({ inventory, machines }: Props) {
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const [tableWidth, setTableWidth] = useState<number>(900);
    const [isScrollable, setIsScrollable] = useState(false);
    const [selectedMachineId, setSelectedMachineId] = useState<number | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: SortKey | null; direction: "asc" | "desc" }>({ key: null, direction: "desc" });
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

    // Filter stock based on selected machine
    let filteredInventory = selectedMachineId === "all"
        ? inventory
        : inventory.filter(stock => stock.machineId === selectedMachineId);

    // Filter by search query (SKU, Name, or SR# via index)
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
            // Default to desc for numeric/date, asc for text
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
            case "estimated_stock":
                aVal = a.estimated_stock;
                bVal = b.estimated_stock;
                break;
            case "last_refilled_at":
                aVal = new Date(a.last_refilled_at).getTime();
                bVal = new Date(b.last_refilled_at).getTime();
                break;
            case "location":
                aVal = a.machine?.location_name || "";
                bVal = b.machine?.location_name || "";
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
                    <TrendingDown className="w-4 h-4 text-brand-400" />
                    Machine Stock Estimates
                </h3>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    <button 
                        onClick={() => setIsAuditModalOpen(true)}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-accent-blue/10 border border-slate-200 dark:border-accent-blue/20 text-slate-900 dark:text-accent-blue hover:text-white hover:bg-accent-blue dark:hover:bg-accent-blue/20 rounded-xl text-sm font-bold transition-all whitespace-nowrap"
                    >
                        Reconcile Audit
                    </button>
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
                            <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap" onClick={() => handleSort("estimated_stock")}>
                                <div className="flex items-center justify-end"><SortIcon columnKey="estimated_stock" /> Est. Machine Stock</div>
                            </th>
                            <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap" onClick={() => handleSort("last_refilled_at")}>
                                <div className="flex items-center justify-end"><SortIcon columnKey="last_refilled_at" /> Last Refill</div>
                            </th>
                            <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-center w-48 cursor-pointer group hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap" onClick={() => handleSort("location")}>
                                <div className="flex items-center justify-center">Location <SortIcon columnKey="location" /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                        {sortedInventory.map((stock, index) => {
                            const isLow = stock.estimated_stock < 5;
                            const isZero = stock.estimated_stock === 0;
                            const lastRefill = new Date(stock.last_refilled_at).toLocaleDateString() + ' ' + new Date(stock.last_refilled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                            return (
                                <tr key={`${stock.machineId}-${stock.itemId}`} className={`group hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 border-b border-slate-200 dark:border-white/[0.02] last:border-0 ${isLow ? 'bg-accent-pink/[0.01]' : ''}`}>
                                    <td className="px-3 py-3 md:px-6 md:py-4 text-center font-mono text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300 transition-colors">
                                        {index + 1}
                                    </td>
                                    <td className="px-3 py-3 md:px-6 md:py-4">
                                        <div className="flex flex-col gap-0.5 group/name">
                                            <div className="flex items-baseline gap-2 flex-wrap">
                                                <span className="font-bold text-slate-900 dark:text-white text-xs md:text-sm tracking-tight group-hover/name:text-brand-400 transition-colors uppercase">
                                                    {stock.item.name}
                                                </span>
                                                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                                                    #{stock.item.sku}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{stock.item.category}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {isLow && <AlertCircle className={`w-3.5 h-3.5 ${isZero ? 'text-accent-pink' : 'text-orange-400'}`} />}
                                            <span className={`text-xs md:text-sm font-bold font-mono ${isZero ? 'text-accent-pink' : isLow ? 'text-orange-400' : 'text-slate-900 dark:text-white'}`}>
                                                {stock.estimated_stock.toLocaleString()} UNITS
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                                        <div className="flex flex-col items-end opacity-70 group-hover:opacity-100 transition-opacity">
                                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 dark:text-slate-300 text-xs font-medium">
                                                <Clock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                                {lastRefill}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 md:px-6 md:py-4 text-center">
                                        <span className="block mx-auto px-2 py-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 dark:text-slate-300 text-[10px] font-bold uppercase tracking-widest rounded-md truncate max-w-[160px]">
                                            {stock.machine?.location_name || 'Unknown'}
                                        </span>
                                    </td>
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
                        <p className="text-slate-900 dark:text-white font-bold mb-1">No Machine Stock Data</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Restock machines via driver portal to see estimates.</p>
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
