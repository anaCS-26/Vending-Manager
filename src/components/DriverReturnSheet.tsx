"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, PackageX, AlertTriangle, Clock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { submitDriverReturn } from "@/actions/driver-stock";

type BagRow = {
    id: number;
    itemId: number;
    quantity_on_hand: number;
    item: { id: number; name: string; sku: string };
};

type Reason = "DAMAGED" | "EXPIRED" | "SURPLUS";
type Line = { itemId: number; quantity: number; reason: Reason; notes?: string };

const REASONS: { value: Reason; label: string; icon: React.ReactNode; toneClass: string }[] = [
    { value: "DAMAGED", label: "Damaged", icon: <AlertTriangle className="w-3.5 h-3.5" />, toneClass: "bg-accent-pink/10 border-accent-pink/30 text-accent-pink" },
    { value: "EXPIRED", label: "Expired", icon: <Clock className="w-3.5 h-3.5" />, toneClass: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400" },
    { value: "SURPLUS", label: "Surplus", icon: <Sparkles className="w-3.5 h-3.5" />, toneClass: "bg-accent-blue/10 border-accent-blue/30 text-accent-blue" },
];

/**
 * Driver-initiated return flow. The driver picks lines from their bag,
 * sets a reason per line, and submits to submitDriverReturn (which queues
 * one ReturnVerification per line for admin approval). DriverStock is
 * decremented immediately on submit.
 */
export function DriverReturnSheet({
    bag,
    open,
    onClose,
}: {
    bag: BagRow[];
    open: boolean;
    onClose: () => void;
}) {
    const [lines, setLines] = useState<Line[]>([]);
    const [isPending, startTransition] = useTransition();

    const addLine = (itemId: number) => {
        if (lines.some((l) => l.itemId === itemId)) return;
        setLines([...lines, { itemId, quantity: 1, reason: "SURPLUS" }]);
    };
    const updateLine = (itemId: number, patch: Partial<Line>) =>
        setLines(lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
    const removeLine = (itemId: number) => setLines(lines.filter((l) => l.itemId !== itemId));

    const reset = () => setLines([]);

    const submit = () => {
        const valid = lines.filter((l) => l.quantity > 0);
        if (valid.length === 0) {
            toast.error("Add at least one item with quantity > 0.");
            return;
        }
        // Bag-balance pre-check so we can surface a friendly error before
        // hitting the server (which also enforces this).
        for (const l of valid) {
            const have = bag.find((b) => b.itemId === l.itemId)?.quantity_on_hand ?? 0;
            if (l.quantity > have) {
                toast.error(`Cannot return ${l.quantity} of ${bag.find((b) => b.itemId === l.itemId)?.item.name || "item"}; only ${have} on hand.`);
                return;
            }
        }
        startTransition(async () => {
            const result = await submitDriverReturn(valid);
            if (result.success) {
                toast.success("Returns submitted", {
                    description: `${valid.length} line(s) queued for admin verification.`,
                });
                reset();
                onClose();
            } else {
                toast.error("Submit failed", { description: result.error });
            }
        });
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
                >
                    <motion.div
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 40, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-[#121214] w-full sm:max-w-md sm:mx-4 sm:rounded-3xl rounded-t-3xl shadow-2xl border border-slate-200 dark:border-white/10 max-h-[90vh] flex flex-col overflow-hidden"
                    >
                        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-accent-orange/15 flex items-center justify-center text-accent-orange">
                                    <PackageX className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white">Return items</h2>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Send items from your bag back to the warehouse.</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10">
                                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-5 space-y-4">
                            {bag.length === 0 ? (
                                <div className="text-center py-12 text-sm text-slate-500 dark:text-slate-400">
                                    Your bag is empty. Nothing to return.
                                </div>
                            ) : (
                                <>
                                    {/* Pick from bag */}
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Tap to add to return list</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {bag.map((b) => {
                                                const inList = lines.some((l) => l.itemId === b.itemId);
                                                return (
                                                    <button
                                                        key={b.id}
                                                        onClick={() => addLine(b.itemId)}
                                                        disabled={inList}
                                                        className="text-left p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-300 dark:hover:border-white/20 transition-all"
                                                    >
                                                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{b.item.name}</div>
                                                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">{b.quantity_on_hand} in bag</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Selected lines */}
                                    {lines.length > 0 && (
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Returning ({lines.length})</div>
                                            <div className="space-y-2">
                                                {lines.map((l) => {
                                                    const meta = bag.find((b) => b.itemId === l.itemId);
                                                    if (!meta) return null;
                                                    return (
                                                        <div key={l.itemId} className="p-3 rounded-2xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="min-w-0">
                                                                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{meta.item.name}</div>
                                                                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{meta.quantity_on_hand} in bag</div>
                                                                </div>
                                                                <button onClick={() => removeLine(l.itemId)} className="p-1 rounded-lg text-slate-400 hover:text-accent-pink hover:bg-accent-pink/10">
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>

                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                {REASONS.map((r) => (
                                                                    <button
                                                                        key={r.value}
                                                                        onClick={() => updateLine(l.itemId, { reason: r.value })}
                                                                        className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border transition-all ${
                                                                            l.reason === r.value ? r.toneClass : "bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400"
                                                                        }`}
                                                                    >
                                                                        {r.icon} {r.label}
                                                                    </button>
                                                                ))}
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">Qty</span>
                                                                <input
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    pattern="[0-9]*"
                                                                    autoComplete="off"
                                                                    value={String(l.quantity)}
                                                                    onChange={(e) => {
                                                                        const raw = e.target.value.replace(/[^0-9]/g, "");
                                                                        const n = raw === "" ? 0 : parseInt(raw, 10);
                                                                        updateLine(l.itemId, { quantity: Math.min(meta.quantity_on_hand, Math.max(0, n)) });
                                                                    }}
                                                                    className="flex-1 min-w-0 text-center font-bold bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg py-1.5 text-slate-900 dark:text-white"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Notes (optional)"
                                                                    value={l.notes || ""}
                                                                    onChange={(e) => updateLine(l.itemId, { notes: e.target.value })}
                                                                    className="flex-[2] min-w-0 text-xs bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-slate-900 dark:text-white placeholder:text-slate-400"
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="p-5 border-t border-slate-200 dark:border-white/10 flex items-center gap-2">
                            <button
                                onClick={onClose}
                                disabled={isPending}
                                className="px-4 py-3 rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submit}
                                disabled={isPending || lines.length === 0}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-accent-orange text-white font-bold py-3 px-4 rounded-2xl shadow-sm hover:bg-accent-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageX className="w-4 h-4" />}
                                Submit returns
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
