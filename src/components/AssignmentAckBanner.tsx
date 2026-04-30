"use client";

import { useState, useTransition } from "react";
import { Bell, Check, AlertTriangle, X, Loader2 } from "lucide-react";
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
 * Mounted at the top of /driver. Shows the driver any StockAssignment rows
 * still in PENDING_ACK so they can either confirm or report a discrepancy.
 * Driver portal isn't realtime-subscribed, so this list reflects what was
 * fetched at last page load — drivers refresh between machines anyway.
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
                toast.success("Bag confirmed", { description: `Acknowledged ${items.length} item line(s).` });
                setItems([]);
            } else {
                toast.error(`Failed to acknowledge ${failed.length} of ${items.length}`, {
                    description: "Try again or report missing items.",
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
                toast.success("Reported", {
                    description: `${accepted} accepted, ${disputed} reported short.`,
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
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-3xl p-5 mb-4 mx-2"
        >
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200 leading-tight">New stock in your bag</h2>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300/80 mt-0.5">
                        {items.length} item line{items.length === 1 ? "" : "s"} · {totalUnits} units · please confirm
                    </p>
                </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                <AnimatePresence>
                    {items.map((a) => (
                        <motion.div
                            key={a.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white dark:bg-black/30 border border-amber-200/40 dark:border-amber-500/20 rounded-xl p-3 flex items-center gap-3"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{a.item.name}</div>
                                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                    Pushed {formatSaudiTime(new Date(a.assigned_at), { hour: "2-digit", minute: "2-digit" })}
                                </div>
                                {a.notes && (
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">"{a.notes}"</div>
                                )}
                            </div>
                            <div className="text-right shrink-0">
                                {disputeMode ? (
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">got</span>
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
                                            className="w-14 text-center font-bold bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg py-1 text-slate-900 dark:text-white"
                                        />
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">/ {a.quantity}</span>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">{a.quantity}</div>
                                        <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400">units</div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 mt-3">
                {!disputeMode ? (
                    <>
                        <button
                            onClick={acceptAll}
                            disabled={isPending}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-accent-green text-white font-bold py-3 px-4 rounded-2xl shadow-sm hover:bg-accent-green/90 transition-colors disabled:opacity-50"
                        >
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Accept all
                        </button>
                        <button
                            onClick={() => setDisputeMode(true)}
                            disabled={isPending}
                            className="inline-flex items-center justify-center gap-1.5 bg-white dark:bg-black/30 text-amber-700 dark:text-amber-300 font-bold py-3 px-4 rounded-2xl border border-amber-200 dark:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                        >
                            <AlertTriangle className="w-4 h-4" />
                            Report missing
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={submitDisputes}
                            disabled={isPending}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-accent-blue text-white font-bold py-3 px-4 rounded-2xl shadow-sm hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                        >
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Submit
                        </button>
                        <button
                            onClick={() => setDisputeMode(false)}
                            disabled={isPending}
                            className="inline-flex items-center justify-center gap-1.5 bg-white dark:bg-black/30 text-slate-600 dark:text-slate-400 font-bold py-3 px-4 rounded-2xl border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                        >
                            <X className="w-4 h-4" />
                            Cancel
                        </button>
                    </>
                )}
            </div>
        </motion.div>
    );
}
