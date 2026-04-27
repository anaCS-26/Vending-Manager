"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Search, AlertCircle, Save, CheckCircle2, TrendingDown } from "lucide-react";
import { useTheme } from "next-themes";
import type { MachineStockWithItem, MachineType } from "@/types";
import { reconcileMachineAudit } from "@/actions/inventory";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    inventory: MachineStockWithItem[];
    machines: MachineType[];
};

export default function MachineAuditModal({ isOpen, onClose, inventory, machines }: Props) {
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

    const handleCountChange = (itemId: number, value: string) => {
        const num = parseInt(value, 10);
        setPhysicalCounts(prev => ({
            ...prev,
            [itemId]: isNaN(num) ? 0 : num
        }));
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
                toast.success("Audit completed successfully!");
                onClose();
            } else {
                toast.error(result.error || "Failed to reconcile machine");
            }
        } catch (error) {
            toast.error("Server error during reconciliation");
        } finally {
            setIsSubmitting(false);
            setShowConfirm(false);
        }
    };

    const totalMissing = filteredInventory.reduce((acc, stock) => {
        const expected = stock.estimated_stock;
        const actual = physicalCounts[stock.itemId] ?? expected;
        const diff = expected - actual;
        return acc + (diff > 0 ? diff : 0);
    }, 0);

    const modalContent = (
        <>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 text-left" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
            <div className="absolute inset-0 bg-slate-900/40 dark:bg-zinc-950/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl flex flex-col max-h-[90vh] overflow-hidden shadow-2xl">
                
                {/* Header Section */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent-blue/10 flex items-center justify-center border border-accent-blue/20">
                            <TrendingDown className="w-5 h-5 text-accent-blue" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Machine Reconciliation</h2>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">Physical Audit</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors hidden sm:block">
                        <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Sub-Header / Controls */}
                <div className="p-6 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-4 items-end bg-white dark:bg-zinc-900">
                    <div className="w-full sm:w-1/2">
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Target Machine</label>
                        <select 
                            className="w-full bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-accent-blue/50 transition-colors cursor-pointer"
                            value={selectedMachineId}
                            onChange={(e) => handleMachineChange(e.target.value ? parseInt(e.target.value) : "")}
                        >
                            <option value="" className="text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900">-- Select Machine to Audit --</option>
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

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-zinc-950 custom-scrollbar">
                    {!selectedMachineId ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                            <p className="font-medium text-slate-500">Select a machine to begin reconciliation</p>
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
                                <div className="w-24 text-center">Expected</div>
                                <div className="w-32 text-right">Physical Count</div>
                            </div>
                            
                            {displayInventory.map(stock => {
                                const expected = stock.estimated_stock;
                                const actual = physicalCounts[stock.itemId] ?? expected;
                                const diff = expected - actual;
                                const isDiscrepancy = diff !== 0;

                                return (
                                    <div key={stock.itemId} className={`flex items-center bg-white dark:bg-zinc-900 border ${isDiscrepancy ? 'border-accent-pink/30 shadow-[0_0_10px_rgba(236,72,153,0.05)]' : 'border-slate-200 dark:border-zinc-800'} p-4 rounded-xl transition-all`}>
                                        <div className="flex-1 flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm uppercase">{stock.item.name}</span>
                                                {isDiscrepancy && (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${diff > 0 ? 'bg-accent-pink/10 text-accent-pink' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                        {diff > 0 ? `${diff} Missing (Sale)` : `${Math.abs(diff)} Surplus`}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">#{stock.item.sku}</span>
                                        </div>
                                        
                                        <div className="w-24 text-center font-mono text-sm font-bold text-slate-500 dark:text-zinc-400">
                                            {expected}
                                        </div>

                                        <div className="w-32 flex justify-end">
                                            <input 
                                                type="number"
                                                min="0"
                                                value={physicalCounts[stock.itemId] ?? ''}
                                                onChange={(e) => handleCountChange(stock.itemId, e.target.value)}
                                                className={`w-20 text-center font-mono text-base font-bold rounded-lg border ${isDiscrepancy ? 'border-accent-pink bg-accent-pink/5 text-accent-pink focus:ring-accent-pink/50' : 'border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 focus:ring-accent-blue/50'} px-2 py-1.5 focus:outline-none focus:ring-2`}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex flex-col sm:flex-row items-center gap-4 justify-between">
                    <div className="w-full sm:w-auto text-center sm:text-left">
                        {selectedMachineId && totalMissing > 0 && (
                            <p className="text-sm font-bold text-accent-pink flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {totalMissing} missing items will be mapped as Sales
                            </p>
                        )}
                        {selectedMachineId && totalMissing === 0 && (
                            <p className="text-sm font-bold text-emerald-500 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Audit is perfectly aligned.
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
                            disabled={!selectedMachineId || isSubmitting}
                            className="w-full sm:w-auto px-6 py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            Confirm 
                        </button>
                    </div>
                </div>
            </div>
        </div>
            <ConfirmModal
                isOpen={showConfirm}
                isDestructive={false}
                title="Submit Audit Variance"
                message={`Are you sure you want to finalize this audit? This action cannot be undone. (Missing items: ${totalMissing})`}
                confirmText="Yes, Submit Audit"
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
