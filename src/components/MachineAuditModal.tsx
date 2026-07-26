"use client";

import { useId, useState, useEffect } from "react";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { createPortal } from "react-dom";
import { X, Search, AlertCircle, Save, CheckCircle2, Scale, Info } from "lucide-react";
import { useTheme } from "next-themes";
import type { MachineStockWithItem, MachineType } from "@/types";
import { reconcileMachineAudit } from "@/actions/inventory";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NumericInput } from "@/components/NumericInput";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    inventory: MachineStockWithItem[];
    machines: MachineType[];
};

/**
 * Machine Calibration (physical count → reconcile). Shares its chrome and copy
 * with WarehouseAuditModal, but the financial treatment is different: unlike the
 * warehouse, product leaving a machine IS a sale, so a shortage ("missing") is
 * booked as a sale (revenue + COGS via RefillLog). Surplus units are added back
 * to the machine's estimated stock.
 */
export default function MachineAuditModal({ isOpen, onClose, inventory, machines }: Props) {
    const titleId = useId();
    // Kept in step with WarehouseAuditModal by design (see CLAUDE.md) — a recount
    // is dozens of typed lines, so Esc must not discard it.
    const { panelRef, dialogProps } = useModalBehavior({
        isOpen,
        onClose,
        closeOnEscape: false,
        labelledBy: titleId,
    });
    const [selectedMachineId, setSelectedMachineId] = useState<number | "">("");
    const [physicalCounts, setPhysicalCounts] = useState<Record<number, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [mounted, setMounted] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    const filteredInventory = inventory.filter(stock => stock.machineId === selectedMachineId);

    // Sort and filter internally for display
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

    const handleMachineChange = (machineId: number | "") => {
        setSelectedMachineId(machineId);
        // Reset counts when switching machines, defaulting to the current estimated stock
        const newCounts: Record<number, number> = {};
        const machineStock = inventory.filter(s => s.machineId === machineId);
        machineStock.forEach(stock => {
            newCounts[stock.itemId] = stock.estimated_stock;
        });
        setPhysicalCounts(newCounts);
        setSearchQuery("");
    };

    const handleSubmit = () => {
        if (!selectedMachineId) {
            toast.error("Please select a machine first");
            return;
        }
        setShowConfirm(true);
    };

    const executeSubmit = async () => {
        if (!selectedMachineId) {
            toast.error("Please select a machine first");
            return;
        }

        setIsSubmitting(true);
        const audits = filteredInventory.map(stock => ({
            itemId: stock.itemId,
            physicalCount: physicalCounts[stock.itemId] ?? stock.estimated_stock
        }));

        try {
            const result = await reconcileMachineAudit(selectedMachineId, audits);
            if (result.success) {
                toast.success("Machine calibration applied");
                onClose();
            } else {
                toast.error(result.error || "Failed to calibrate machine stock");
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
            const expected = stock.estimated_stock;
            const actual = physicalCounts[stock.itemId] ?? expected;
            const diff = expected - actual;
            if (diff > 0) acc.missing += diff;
            else if (diff < 0) acc.surplus += Math.abs(diff);
            return acc;
        },
        { missing: 0, surplus: 0 }
    );
    const hasChanges = totals.missing > 0 || totals.surplus > 0;

    const modalContent = (
        <>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 text-left" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="absolute inset-0 bg-slate-900/40 dark:bg-zinc-950/80 backdrop-blur-md" onClick={onClose} />
            <div ref={panelRef} {...dialogProps} className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl flex flex-col max-h-[85vh] overflow-hidden shadow-2xl">

                {/* Header Section */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center border border-accent-blue/20">
                            <Scale className="w-5 h-5 text-accent-blue" />
                        </div>
                        <div>
                            <h2 id={titleId} className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Machine Calibration</h2>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">Physical Stock Count</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close calibration" className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors hidden sm:block">
                        <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Sub-Header / Controls */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-4 items-end bg-white dark:bg-zinc-900">
                    <div className="w-full sm:w-1/2">
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Target Machine</label>
                        <select
                            className="w-full bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-accent-blue/50 transition-colors cursor-pointer"
                            value={selectedMachineId}
                            onChange={(e) => handleMachineChange(e.target.value ? parseInt(e.target.value) : "")}
                        >
                            <option value="" className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">-- Select Machine to Calibrate --</option>
                            {machines.map(m => (
                                <option key={m.id} value={m.id} className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">{m.id} - {m.location_name}</option>
                            ))}
                        </select>
                    </div>

                    {selectedMachineId && (
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
                            <span className="font-bold text-slate-800 dark:text-slate-100">Match the count to the machine.</span> Enter how many of each item you actually counted. Anything <span className="font-semibold text-accent-pink">missing</span> is booked as a <span className="font-semibold text-accent-pink">sale</span> (revenue &amp; cost recorded), since product leaves a machine by being vended. <span className="font-semibold text-emerald-500">Surplus</span> units are added back to stock. The estimated figure is only a guide &mdash; your count becomes the new truth.
                        </p>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50/50 dark:bg-zinc-950 custom-scrollbar">
                    {!selectedMachineId ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                            <p className="font-medium text-slate-500">Select a machine to begin the calibration</p>
                        </div>
                    ) : filteredInventory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-50 text-accent-pink" />
                            <p className="font-medium text-slate-500">This machine has no tracked inventory</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex px-4 pb-2 mb-2 border-b border-slate-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                                <div className="flex-1">Item Details</div>
                                <div className="w-20 text-center">System</div>
                                <div className="w-28 text-right">Physical Count</div>
                            </div>

                            {displayInventory.map(stock => {
                                const expected = stock.estimated_stock;
                                const actual = physicalCounts[stock.itemId] ?? expected;
                                const diff = expected - actual;
                                const isDiscrepancy = diff !== 0;

                                return (
                                    <div key={stock.itemId} className={`flex items-center bg-white dark:bg-zinc-900 border ${isDiscrepancy ? 'border-accent-blue/30 shadow-[0_0_10px_rgba(59,130,246,0.05)]' : 'border-slate-200 dark:border-zinc-800'} p-4 rounded-xl transition-all`}>
                                        <div className="flex-1 flex flex-col gap-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm uppercase">{stock.item.name}</span>
                                                {isDiscrepancy && (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${diff > 0 ? 'bg-accent-pink/10 text-accent-pink' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                        {diff > 0 ? `−${diff} missing (sale)` : `+${Math.abs(diff)} surplus`}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">#{stock.item.sku}</span>
                                        </div>

                                        <div className="w-20 text-center font-mono text-sm font-bold text-slate-500 dark:text-zinc-400">
                                            {expected}
                                        </div>

                                        <div className="w-28 flex justify-end">
                                            <NumericInput
                                                value={physicalCounts[stock.itemId] ?? stock.estimated_stock}
                                                onChange={(count) => handleCountChange(stock.itemId, count)}
                                                className={`w-24 text-center font-mono text-base font-bold rounded-lg border ${isDiscrepancy ? 'border-accent-blue bg-accent-blue/5 text-accent-blue focus:ring-accent-blue/50' : 'border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 focus:ring-accent-blue/50'} px-2 py-1.5 focus:outline-none focus:ring-2`}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex flex-col sm:flex-row items-center gap-4 justify-between">
                    <div className="w-full sm:w-auto text-center sm:text-left">
                        {selectedMachineId && hasChanges && (
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 flex-wrap">
                                <Scale className="w-4 h-4 text-accent-blue" />
                                {totals.missing > 0 && <span className="text-accent-pink">−{totals.missing} missing (sale)</span>}
                                {totals.missing > 0 && totals.surplus > 0 && <span className="text-slate-400">·</span>}
                                {totals.surplus > 0 && <span className="text-emerald-500">+{totals.surplus} surplus</span>}
                                {totals.missing > 0 && <span className="text-slate-400 font-medium">· booked as {totals.missing === 1 ? 'sale' : 'sales'}</span>}
                            </p>
                        )}
                        {selectedMachineId && !hasChanges && (
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
                            disabled={!selectedMachineId || isSubmitting || !hasChanges}
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
            <ConfirmModal
                isOpen={showConfirm}
                isDestructive={false}
                title="Confirm Machine Calibration"
                message={`Apply this calibration? Missing units are booked as sales (${totals.missing}); surplus is added to stock. This cannot be undone.`}
                confirmText="Yes, Apply Calibration"
                isPending={isSubmitting}
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
