"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Search, AlertCircle, Save, AlertTriangle, ArrowRight, Info } from "lucide-react";
import { useTheme } from "next-themes";
import type { Item } from "@prisma/client";
import { correctItemCost } from "@/actions/inventory";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    items: Item[];
};

/** A cost looks wrong when the unit cost exceeds the standard sell price (you
 *  don't normally sell below cost) — catches case-price-entered-as-unit errors. */
function isSuspect(item: Item): boolean {
    return item.cost > item.price_standard && item.price_standard > 0;
}

/**
 * Cost Correction (revaluation). Directly SETS Item.cost when the running WAC is
 * known to be wrong — does NOT change quantity and does NOT rewrite frozen
 * RefillLog history. Super-admin only. One item per correction (each is its own
 * audited event).
 */
export default function CostCorrectionModal({ isOpen, onClose, items }: Props) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [correctedCost, setCorrectedCost] = useState("");
    const [note, setNote] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    // Suspect items first, then alphabetical.
    const sortedItems = useMemo(() => {
        return [...items].sort((a, b) => {
            const sa = isSuspect(a) ? 0 : 1;
            const sb = isSuspect(b) ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return a.name.localeCompare(b.name);
        });
    }, [items]);

    if (!isOpen || !mounted) return null;

    const displayItems = searchQuery.trim()
        ? sortedItems.filter(i =>
            i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            i.sku.toLowerCase().includes(searchQuery.toLowerCase()))
        : sortedItems;

    const selectedItem = items.find(i => i.id === selectedItemId) || null;
    const suspectCount = items.filter(isSuspect).length;

    const handleCostChange = (value: string) => {
        const cleaned = value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
        setCorrectedCost(cleaned);
    };

    const handleSelect = (item: Item) => {
        setSelectedItemId(item.id);
        setCorrectedCost("");
        setNote("");
    };

    const parsedCost = correctedCost.trim() !== "" ? parseFloat(correctedCost) : NaN;
    const canApply =
        selectedItem != null &&
        !isNaN(parsedCost) &&
        parsedCost >= 0 &&
        parsedCost !== selectedItem.cost &&
        note.trim() !== "";

    const handleSubmit = () => {
        if (!canApply) {
            toast.error("Pick an item, enter a different valid cost, and add a reason note");
            return;
        }
        setShowConfirm(true);
    };

    const executeSubmit = async () => {
        if (!selectedItem || isNaN(parsedCost)) return;
        setIsSubmitting(true);
        try {
            const result = await correctItemCost(selectedItem.id, parsedCost, note);
            if (result.success) {
                toast.success("Cost corrected");
                onClose();
            } else {
                toast.error(result.error || "Failed to correct cost");
            }
        } catch {
            toast.error("Server error during cost correction");
        } finally {
            setIsSubmitting(false);
            setShowConfirm(false);
        }
    };

    const modalContent = (
        <>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 text-left" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="absolute inset-0 bg-slate-900/40 dark:bg-zinc-950/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl flex flex-col max-h-[85vh] overflow-hidden shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center border border-accent-blue/20">
                            <AlertTriangle className="w-5 h-5 text-accent-blue" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Cost Correction</h2>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">Revalue WAC (Super Admin)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors hidden sm:block">
                        <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Controls */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search items by name or SKU..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-accent-blue/50 transition-colors"
                        />
                    </div>
                    {suspectCount > 0 && (
                        <p className="text-xs font-bold text-amber-500 flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {suspectCount} item(s) have a cost above their sell price, likely a case price entered per unit.
                        </p>
                    )}
                </div>

                {/* Plain-language explainer for non-technical users */}
                <div className="px-6 pt-3">
                    <div className="flex gap-3 items-start bg-accent-blue/5 border border-accent-blue/20 rounded-xl px-4 py-3">
                        <Info className="w-4 h-4 text-accent-blue shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            <span className="font-bold text-slate-800 dark:text-slate-100">Fix a wrong item cost.</span> Use this when an item&apos;s cost looks off, for example when a full <em>case</em> price was typed in as the price of a <em>single</em> unit. It corrects the cost used in your profit calculations from now on. Sales already recorded keep their original cost, so your history stays accurate.
                        </p>
                    </div>
                </div>

                {/* Item list */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50/50 dark:bg-zinc-950 custom-scrollbar">
                    {displayItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                            <p className="font-medium text-slate-500">No items match your search</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {displayItems.map(item => {
                                const suspect = isSuspect(item);
                                const isSelected = item.id === selectedItemId;
                                return (
                                    <div key={item.id}>
                                        <button
                                            onClick={() => handleSelect(item)}
                                            className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${isSelected ? 'border-accent-blue bg-accent-blue/5' : suspect ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-500/70' : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-accent-blue/40'}`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm uppercase">{item.name}</span>
                                                    {suspect && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                                            likely error
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">#{item.sku}{item.bulk_format ? ` · ${item.bulk_format}` : ''}</span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Cost / Sell</div>
                                                <div className="font-mono text-sm font-bold text-slate-700 dark:text-zinc-200">
                                                    {formatCurrency(item.cost)} <span className="text-slate-400">/</span> {formatCurrency(item.price_standard)}
                                                </div>
                                            </div>
                                        </button>

                                        {/* Inline correction form */}
                                        {isSelected && (
                                            <div className="mt-2 mb-1 p-4 rounded-xl border border-accent-blue/30 bg-accent-blue/5 space-y-3">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <div className="flex flex-col">
                                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Current WAC</label>
                                                        <span className="font-mono text-sm font-bold text-slate-700 dark:text-zinc-200 px-3 py-1.5">{formatCurrency(item.cost)}</span>
                                                    </div>
                                                    <ArrowRight className="w-4 h-4 text-slate-400 mt-5" />
                                                    <div className="flex flex-col">
                                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Corrected Cost</label>
                                                        <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            autoFocus
                                                            placeholder="0.00"
                                                            value={correctedCost}
                                                            onChange={(e) => handleCostChange(e.target.value)}
                                                            className="w-32 font-mono text-sm font-bold rounded-lg border border-accent-blue/50 bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                                                        />
                                                    </div>
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Reason (required), e.g. case price of 31 was entered as the unit cost"
                                                    value={note}
                                                    onChange={(e) => setNote(e.target.value)}
                                                    className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent-blue/50"
                                                />
                                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    This re-prices stock going forward and live shrinkage. Past sales already recorded keep their original cost (frozen history).
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex flex-col sm:flex-row items-center gap-4 justify-between">
                    <div className="w-full sm:w-auto text-center sm:text-left">
                        {selectedItem && (
                            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
                                Editing <span className="font-bold text-slate-900 dark:text-white">{selectedItem.name}</span>
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
                            disabled={!canApply || isSubmitting}
                            className="w-full sm:w-auto px-6 py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            Apply Correction
                        </button>
                    </div>
                </div>
            </div>
        </div>
            <ConfirmModal
                isOpen={showConfirm}
                isDestructive={false}
                title="Confirm Cost Correction"
                message={selectedItem ? `Change the WAC for ${selectedItem.name} from ${formatCurrency(selectedItem.cost)} to ${formatCurrency(isNaN(parsedCost) ? 0 : parsedCost)}? Historical sales keep their original cost.` : ''}
                confirmText="Yes, Correct Cost"
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
