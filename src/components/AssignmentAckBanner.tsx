"use client";

import { useState, useTransition } from "react";
import { Package, Check, AlertTriangle, X, Loader2, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { acknowledgeAssignment, disputeAssignment } from "@/actions/driver-stock";
import { formatSaudiTime } from "@/lib/utils";

type PendingAssignment = {
    id: number;
    itemId: number;
    quantity: number;
    assigned_at: Date | string;
    notes: string | null;
    item: { id: number; name: string };
};

type Props = {
    pending: PendingAssignment[];
};

/**
 * Renders as a full-screen notification modal when the driver has new stock assignments.
 * Automatically loads when they visit the page. They can simply click "Got it" to 
 * dismiss the notification (which acknowledges the stock), or report missing items if 
 * the physical count doesn't match the notification.
 */
export function AssignmentAckBanner({ pending }: Props) {
    const [items, setItems] = useState(pending);
    const [disputeMode, setDisputeMode] = useState(false);
    const [actuals, setActuals] = useState<Record<number, number>>(() =>
        Object.fromEntries(pending.map((p) => [p.id, p.quantity]))
    );
    const [isPending, startTransition] = useTransition();

    if (items.length === 0) return null;

    const totalUnits = items.reduce((s, p) => s + p.quantity, 0);

    const acceptAll = () => {
        startTransition(async () => {
            const failed: number[] = [];
            for (const a of items) {
                const r = await acknowledgeAssignment(a.id);
                if (!r.success) failed.push(a.id);
            }
            if (failed.length === 0) {
                toast.success("Bag updated", { description: `You have successfully received ${items.length} new items.` });
                setItems([]);
            } else {
                toast.error(`Failed to dismiss ${failed.length} of ${items.length}`, {
                    description: "Please try again or report missing items.",
                });
                setItems((prev) => prev.filter((p) => failed.includes(p.id)));
            }
        });
    };

    const submitDisputes = () => {
        startTransition(async () => {
            const remaining: PendingAssignment[] = [];
            let accepted = 0;
            let disputed = 0;
            let failed = 0;

            for (const a of items) {
                const actual = actuals[a.id] ?? a.quantity;
                if (actual === a.quantity) {
                    const r = await acknowledgeAssignment(a.id);
                    if (r.success) accepted++;
                    else { failed++; remaining.push(a); }
                } else if (actual >= 0 && actual < a.quantity) {
                    const r = await disputeAssignment(a.id, actual);
                    if (r.success) disputed++;
                    else { failed++; remaining.push(a); }
                } else {
                    // actual > quantity — invalid, skip
                    failed++;
                    remaining.push(a);
                }
            }

            if (failed === 0) {
                toast.success("Discrepancy Reported", {
                    description: `Admin has been notified. ${accepted} items added normally, ${disputed} items reported missing.`,
                });
                setItems([]);
                setDisputeMode(false);
            } else {
                toast.error(`Couldn't process ${failed} item(s)`);
                setItems(remaining);
            }
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-lg bg-white dark:bg-neo-bg border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh]"
            >
                {/* Header */}
                <div className={`p-6 pb-5 border-b border-slate-100 dark:border-white/5 bg-gradient-to-r ${disputeMode ? 'from-amber-500/10' : 'from-accent-blue/10'} to-transparent shrink-0 transition-colors`}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-inner ${disputeMode ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-accent-blue/20 text-accent-blue'}`}>
                                {disputeMode ? <AlertTriangle className="w-6 h-6" /> : <Package className="w-6 h-6" />}
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                {disputeMode ? "Report Missing Items" : "Stock Added to Bag"}
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                {disputeMode 
                                    ? "Enter the actual amount you physically received. Admin will be notified." 
                                    : "Admin has pushed new inventory into your digital bag."}
                            </p>
                        </div>
                        {!disputeMode && (
                            <div className="text-right shrink-0">
                                <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mb-1">Total Units</div>
                                <div className="text-3xl font-black text-accent-blue leading-none tracking-tighter">+{totalUnits}</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 custom-scrollbar bg-slate-50/50 dark:bg-transparent">
                    <AnimatePresence>
                        {items.map((a) => (
                            <motion.div
                                key={a.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className={`bg-white dark:bg-white/[0.02] border rounded-2xl p-4 flex items-center gap-3 transition-colors shadow-sm ${
                                    disputeMode && (actuals[a.id] ?? a.quantity) < a.quantity 
                                        ? "border-amber-400/50 dark:border-amber-500/50 bg-amber-50 dark:bg-amber-500/5" 
                                        : "border-slate-200 dark:border-white/10"
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{a.item.name}</div>
                                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                                        Assigned at {formatSaudiTime(new Date(a.assigned_at), { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                    {a.notes && (
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 italic border-l-2 border-slate-300 dark:border-slate-600 pl-2">"{a.notes}"</div>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    {disputeMode ? (
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Got</span>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    autoComplete="off"
                                                    value={String(actuals[a.id] ?? a.quantity)}
                                                    onChange={(e) => {
                                                        const raw = e.target.value.replace(/[^0-9]/g, "");
                                                        const n = raw === "" ? 0 : parseInt(raw, 10);
                                                        setActuals((prev) => ({ ...prev, [a.id]: Math.min(a.quantity, Math.max(0, n)) }));
                                                    }}
                                                    className={`w-16 text-center font-black text-lg bg-slate-100 dark:bg-black/40 border-2 rounded-xl py-1 focus:outline-none transition-colors ${
                                                        (actuals[a.id] ?? a.quantity) < a.quantity
                                                            ? "border-amber-400 text-amber-600 dark:text-amber-400"
                                                            : "border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:border-accent-blue"
                                                    }`}
                                                />
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-medium pr-1">out of {a.quantity} assigned</div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">{a.quantity}</div>
                                            <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-1">units</div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Footer buttons */}
                <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-neo-bg shrink-0">
                    {!disputeMode ? (
                        <div className="space-y-3">
                            <button
                                onClick={acceptAll}
                                disabled={isPending}
                                className="w-full inline-flex items-center justify-center gap-2 bg-accent-blue text-white font-bold text-lg py-4 px-4 rounded-2xl shadow-lg shadow-accent-blue/20 hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                            >
                                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                                Okay, Got It
                            </button>
                            <div className="text-center">
                                <button
                                    onClick={() => setDisputeMode(true)}
                                    disabled={isPending}
                                    className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors disabled:opacity-50 px-4 py-2"
                                >
                                    Wait, the count is wrong...
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <button
                                onClick={() => setDisputeMode(false)}
                                disabled={isPending}
                                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 font-bold py-3.5 px-4 rounded-2xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                                <X className="w-4 h-4" />
                                Cancel
                            </button>
                            <button
                                onClick={submitDisputes}
                                disabled={isPending}
                                className="w-full sm:w-auto flex-[2] inline-flex items-center justify-center gap-1.5 bg-amber-500 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-colors disabled:opacity-50"
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                                Submit Dispute
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
