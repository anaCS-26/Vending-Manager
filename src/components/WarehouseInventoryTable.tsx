"use client";
import { useState } from "react";
import { Package, MapPin, Search, Plus, AlertCircle } from "lucide-react";
import type { WarehouseWithItem, WarehouseType } from "@/types";
import type { Item } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";

type Props = {
    inventory: WarehouseWithItem[];
    warehouses: WarehouseType[];
    existingItems: Item[];
};

export default function WarehouseInventoryTable({ inventory, warehouses, existingItems }: Props) {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "all">("all");
    const [searchQuery, setSearchQuery] = useState("");

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
                                <option value="all" className="bg-[#18181b]">All Locations</option>
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id} className="bg-[#18181b]">
                                        {w.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto scroll-fade-right custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-white/5 text-[11px] text-slate-600 dark:text-slate-400 font-bold bg-slate-50 dark:bg-black/20 tracking-wider">
                                <th className="px-6 py-4 uppercase w-16 text-center">SR #</th>
                                <th className="px-6 py-4 uppercase">Items Name</th>
                                <th className="px-6 py-4 uppercase text-right w-28 leading-snug">Store Remain<br />/ Pcs</th>
                                <th className="px-6 py-4 uppercase text-right w-24 leading-snug">COG Price<br />/ Pcs</th>
                                <th className="px-6 py-4 uppercase text-right w-24 leading-snug">Standard<br />Tier Price</th>
                                <th className="px-6 py-4 uppercase text-right text-slate-400 w-24 leading-snug">Hospital<br />Tier Price</th>
                                <th className="px-6 py-4 uppercase text-right text-slate-400 w-24 leading-snug">Hotel<br />Tier Price</th>
                                <th className="px-6 py-4 uppercase text-right w-28 leading-snug">Total<br />Amount</th>
                                {selectedWarehouseId === "all" && <th className="px-6 py-4 uppercase text-center w-32">Location</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                            {filteredInventory.map((stock, index) => {
                                const totalAmount = stock.quantity_on_hand * (stock.item as any).cost;
                                const bulkFormat = (stock.item as any).bulk_format ? ` (${(stock.item as any).bulk_format}) ` : " ";
                                const isZero = stock.quantity_on_hand === 0;

                                return (
                                    <tr key={`${stock.warehouseId}-${stock.itemId}`} className={`group hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 border-b border-slate-200 dark:border-white/[0.02] last:border-0 ${isZero ? 'bg-yellow-500/[0.02]' : ''}`}>
                                        <td className="px-6 py-4 text-center font-mono text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300 transition-colors">
                                            {index + 1}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-0.5 group/name">
                                                <div className="flex items-baseline gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-900 dark:text-white text-sm tracking-tight group-hover/name:text-brand-400 transition-colors uppercase">
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
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {isZero && <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />}
                                                <span className={`text-sm font-bold font-mono ${isZero ? 'text-yellow-500' : 'text-slate-900 dark:text-white'}`}>
                                                    {stock.quantity_on_hand.toLocaleString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap" dir="ltr">
                                                {formatCurrency((stock.item as any).cost || 0)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-sm font-bold text-slate-900 dark:text-white font-mono whitespace-nowrap" dir="ltr">
                                                {formatCurrency((stock.item as any).price_standard)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-sm font-bold text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap" dir="ltr">
                                                {formatCurrency((stock.item as any).price_hospital || 0)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-sm font-bold text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap" dir="ltr">
                                                {formatCurrency((stock.item as any).price_hotel || 0)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`text-sm font-bold font-mono whitespace-nowrap ${isZero ? 'text-yellow-600/80' : 'text-slate-600 dark:text-slate-400'}`} dir="ltr">
                                                {formatCurrency(totalAmount)}
                                            </span>
                                        </td>
                                        {selectedWarehouseId === "all" && (
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center px-2 py-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 dark:text-slate-300 text-[10px] font-bold uppercase tracking-widest rounded-md truncate max-w-[120px]">
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

                {filteredInventory.length === 0 && (
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
