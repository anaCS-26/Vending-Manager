"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Search, AlertCircle, Save, CheckCircle2, Scale, Info } from "lucide-react";
import { useTheme } from "next-themes";
import type { WarehouseWithItem, WarehouseType } from "@/types";
import { calibrateWarehouseStock } from "@/actions/inventory";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NumericInput } from "@/components/NumericInput";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    inventory: WarehouseWithItem[];
    warehouses: WarehouseType[];
};

/**
 * Warehouse Recount (physical count → reconcile). Unlike the machine audit,
 * warehouse stock leaving is NOT a sale: shortages are neutral corrections and
 * surplus ("found") units carry the current WAC by default. The optional
 * "found-unit cost" per surplus row re-blends WAC only when the user sets it.
 */
export default function WarehouseAuditModal({ isOpen, onClose, inventory, warehouses }: Props) {
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">("");
    const [physicalCounts, setPhysicalCounts] = useState<Record<number, number>>({});
    const [foundCosts, setFoundCosts] = useState<Record<number, string>>({});
    const [note, setNote] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [mounted, setMounted] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    const filteredInventory = inventory.filter(stock => stock.warehouseId === selectedWarehouseId);

    let displayInventory = [...filteredInventory];
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        displayInventory = displayInventory.filter(stock =>
            stock.item.name.toLowerCase().includes(query) ||
            stock.item.sku.toLowerCase().includes(query)
        );
    }

    const handleCountChange = (itemId: number, count: number) => {
        setPhysicalCounts(prev => ({ ...prev, [itemId]: count }));
    };

    const handleFoundCostChange = (itemId: number, value: string) => {
        // Allow digits + a single decimal point.
        const cleaned = value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
        setFoundCosts(prev => ({ ...prev, [itemId]: cleaned }));
    };

    const handleWarehouseChange = (warehouseId: number | "") => {
        setSelectedWarehouseId(warehouseId);
        const newCounts: Record<number, number> = {};
        inventory.filter(s => s.warehouseId === warehouseId).forEach(stock => {
            newCounts[stock.itemId] = stock.quantity_on_hand;
        });
        setPhysicalCounts(newCounts);
        setFoundCosts({});
        setNote("");
        setSearchQuery("");
    };

    const handleSubmit = () => {
        if (!selectedWarehouseId) {
            toast.error("Please select a warehouse first");
            return;
        }
        setShowConfirm(true);
    };

    const executeSubmit = async () => {
        if (!selectedWarehouseId) {
            toast.error("Please select a warehouse first");
            return;
        }

        setIsSubmitting(true);
        const items = filteredInventory.map(stock => {
            const physicalCount = physicalCounts[stock.itemId] ?? stock.quantity_on_hand;
            const isSurplus = physicalCount > stock.quantity_on_hand;
            const raw = foundCosts[stock.itemId];
            const parsed = raw != null && raw.trim() !== "" ? parseFloat(raw) : NaN;
            const foundUnitCost = isSurplus && !isNaN(parsed) ? parsed : undefined;
            return { itemId: stock.itemId, physicalCount, foundUnitCost };
        });

        try {
            const result = await calibrateWarehouseStock(selectedWarehouseId, items, note);
            if (result.success) {
                toast.success("Warehouse calibration applied");
                onClose();
            } else {
                toast.error(result.error || "Failed to calibrate warehouse stock");
            }
        } catch {
            toast.error("Server error during calibration");
        } finally {
            setIsSubmitting(false);
            setShowConfirm(false);
        }
    };

    const totals = filteredInventory.reduce(
        (acc, stock) => {
            const actual = physicalCounts[stock.itemId] ?? stock.quantity_on_hand;
            const diff = actual - stock.quantity_on_hand;
            if (diff > 0) acc.found += diff;
            else if (diff < 0) acc.short += Math.abs(diff);
            return acc;
        },
        { found: 0, short: 0 }
    );
    const hasChanges = totals.found > 0 || totals.short > 0;

    const modalContent = (
        <>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 text-left" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="absolute inset-0 bg-slate-900/40 dark:bg-zinc-950/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl flex flex-col max-h-[85vh] overflow-hidden shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center border border-accent-blue/20">
                            <Scale className="w-5 h-5 text-accent-blue" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Warehouse Calibration</h2>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">Physical Stock Count</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors hidden sm:block">
                        <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Controls */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-4 items-end bg-white dark:bg-zinc-900">
                    <div className="w-full sm:w-1/2">
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Target Warehouse</label>
                        <select
                            className="w-full bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-accent-blue/50 transition-colors cursor-pointer"
                            value={selectedWarehouseId}
                            onChange={(e) => handleWarehouseChange(e.target.value ? parseInt(e.target.value) : "")}
                        >
                            <option value="" className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">-- Select Warehouse to Calibrate --</option>
                            {warehouses.map(w => (
                                <option key={w.id} value={w.id} className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">{w.id} - {w.name}</option>
                            ))}
                        </select>
                    </div>

                    {selectedWarehouseId && (
                        <div className="w-full sm:w-1/2 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search Items..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-accent-blue/50 transition-colors"
                            />
                        </div>
                    )}
                </div>

                {/* Plain-language explainer for non-technical users */}
                <div className="px-6 pt-3">
                    <div className="flex gap-3 items-start bg-accent-blue/5 border border-accent-blue/20 rounded-xl px-4 py-3">
                        <Info className="w-4 h-4 text-accent-blue shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            <span className="font-bold text-slate-800 dark:text-slate-100">Match the count to the shelf.</span> Enter how many of each item you actually have. A <span className="font-semibold text-accent-pink">shortage</span> simply lowers the number, and no loss is charged to your profit. <span className="font-semibold text-emerald-500">Found stock</span> is added back at its current cost, so your cost &amp; profit stay accurate. No purchase order needed.
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50/50 dark:bg-zinc-950 custom-scrollbar">
                    {!selectedWarehouseId ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                            <p className="font-medium text-slate-500">Select a warehouse to begin the calibration</p>
                        </div>
                    ) : filteredInventory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-50 text-accent-pink" />
                            <p className="font-medium text-slate-500">This warehouse has no tracked inventory</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex px-4 pb-2 mb-2 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                                <div className="flex-1">Item Details</div>
                                <div className="w-20 text-center">System</div>
                                <div className="w-28 text-right">Physical Count</div>
                            </div>

                            {displayInventory.map(stock => {
                                const expected = stock.quantity_on_hand;
                                const actual = physicalCounts[stock.itemId] ?? expected;
                                const diff = actual - expected;
                                const isSurplus = diff > 0;
                                const isShort = diff < 0;

                                return (
                                    <div key={stock.itemId} className={`bg-white dark:bg-zinc-900 border ${diff !== 0 ? 'border-accent-blue/30 shadow-[0_0_10px_rgba(59,130,246,0.05)]' : 'border-slate-200 dark:border-zinc-800'} p-4 rounded-xl transition-all`}>
                                        <div className="flex items-center">
                                            <div className="flex-1 flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm uppercase">{stock.item.name}</span>
                                                    {isSurplus && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500">
                                                            +{diff} found (no sale)
                                                        </span>
                                                    )}
                                                    {isShort && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-accent-pink/10 text-accent-pink">
                                                            −{Math.abs(diff)} shortage (neutral)
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">#{stock.item.sku} · WAC {formatCurrency(stock.item.cost)}</span>
                                            </div>

                                            <div className="w-20 text-center font-mono text-sm font-bold text-slate-500 dark:text-zinc-400">
                                                {expected}
                                            </div>

                                            <div className="w-28 flex justify-end">
                                                <NumericInput
                                                    value={physicalCounts[stock.itemId] ?? stock.quantity_on_hand}
                                                    onChange={(count) => handleCountChange(stock.itemId, count)}
                                                    className={`w-24 text-center font-mono text-base font-bold rounded-lg border ${diff !== 0 ? 'border-accent-blue bg-accent-blue/5 text-accent-blue focus:ring-accent-blue/50' : 'border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 focus:ring-accent-blue/50'} px-2 py-1.5 focus:outline-none focus:ring-2`}
                                                />
                                            </div>
                                        </div>

                                        {/* Optional cost for found units — only relevant on a surplus. */}
                                        {isSurplus && (
                                            <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-zinc-800 flex items-center gap-3">
                                                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                                    Cost of found units
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder={`WAC ${stock.item.cost} (leave blank to keep current cost)`}
                                                    value={foundCosts[stock.itemId] ?? ''}
                                                    onChange={(e) => handleFoundCostChange(stock.itemId, e.target.value)}
                                                    className="flex-1 max-w-[260px] font-mono text-sm rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex flex-col gap-4">
                    {selectedWarehouseId && (
                        <input
                            type="text"
                            placeholder="Reason or note (optional), e.g. opening-balance correction"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-accent-blue/50 transition-colors"
                        />
                    )}
                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                        <div className="w-full sm:w-auto text-center sm:text-left">
                            {selectedWarehouseId && hasChanges && (
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                    <Scale className="w-4 h-4 text-accent-blue" />
                                    {totals.found > 0 && <span className="text-emerald-500">+{totals.found} found</span>}
                                    {totals.found > 0 && totals.short > 0 && <span className="text-slate-400">·</span>}
                                    {totals.short > 0 && <span className="text-accent-pink">−{totals.short} shortage</span>}
                                    <span className="text-slate-400 font-medium">· no sale logged · WAC preserved unless a found-cost is set</span>
                                </p>
                            )}
                            {selectedWarehouseId && !hasChanges && (
                                <p className="text-sm font-bold text-emerald-500 flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Counts match the system.
                                </p>
                            )}
                        </div>
                        <div className="flex gap-3 w-full sm:w-auto">
                            <button
                                onClick={onClose}
                                className="px-6 py-3 sm:hidden w-full bg-slate-200 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 hover:bg-slate-300 dark:hover:bg-zinc-700 rounded-xl text-sm font-bold transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedWarehouseId || isSubmitting || !hasChanges}
                                className="w-full sm:w-auto px-6 py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Apply Calibration
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
            <ConfirmModal
                isOpen={showConfirm}
                isDestructive={false}
                title="Confirm Warehouse Calibration"
                message={`Apply this calibration? Shortages are neutral corrections (no loss booked); found units keep the current WAC unless you set a found-cost. (+${totals.found} found, −${totals.short} shortage)`}
                confirmText="Yes, Apply Calibration"
                onConfirm={executeSubmit}
                onCancel={() => setShowConfirm(false)}
            />
        </>
    );

    return createPortal(
        <div className={resolvedTheme === 'dark' ? 'dark' : ''}>
            {modalContent}
        </div>,
        document.body
    );
}
