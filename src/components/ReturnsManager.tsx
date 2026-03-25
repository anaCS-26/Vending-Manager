"use client";

import { useState, useTransition } from "react";
import { Check, X, AlertTriangle, PackageX, Loader2, Calendar, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { approveReturn, rejectReturn } from "@/actions/returns";

// Local types until we update index.ts
type ReturnVerificationType = {
    id: number;
    dispatchId: number;
    itemId: number;
    quantity: number;
    reason: string;
    status: string;
    reported_at: Date;
    verified_at: Date | null;
    item: {
        name: string;
        price_standard: number;
    };
    dispatch: {
        driver: {
            name: string;
        };
    };
};

export function ReturnsManager({ pending, history }: { pending: ReturnVerificationType[], history: ReturnVerificationType[] }) {
    const [isPending, startTransition] = useTransition();

    useRealtimeRefresh();

    const handleApprove = (id: number) => {
        startTransition(async () => {
            const res = await approveReturn(id);
            if (res.success) {
                toast.success("Return Approved", { description: "Item verified and inventory adjusted." });
            } else {
                toast.error("Failed to approve", { description: res.error });
            }
        });
    };

    const handleReject = (id: number) => {
        if (!confirm("Are you sure you want to reject this return? It will be marked invalid.")) return;

        startTransition(async () => {
            const res = await rejectReturn(id);
            if (res.success) {
                toast.success("Return Rejected", { description: "This report has been dismissed." });
            } else {
                toast.error("Failed to reject", { description: res.error });
            }
        });
    };

    return (
        <div className="space-y-12">
            <div>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-accent-orange/10 border border-accent-orange/20 rounded-xl">
                        <AlertTriangle className="w-5 h-5 text-accent-orange" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Pending Verifications</h2>
                    <span className="px-2.5 py-0.5 bg-white/10 rounded-full text-xs font-semibold text-slate-900 dark:text-white ml-2">
                        {pending.length}
                    </span>
                </div>

                {pending.length === 0 ? (
                    <div className="glass-panel border-slate-200 dark:border-white/5 rounded-2xl p-12 flex flex-col items-center justify-center text-center border-dashed">
                        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4 border border-slate-200 dark:border-white/10">
                            <Check className="w-8 h-8 text-slate-500 dark:text-slate-400 opacity-50" />
                        </div>
                        <h3 className="text-slate-900 dark:text-white font-bold mb-1">All Caught Up</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">No pending returned-item reports.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {pending.map((ret) => (
                                <motion.div
                                    key={ret.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="glass-panel border-slate-200 dark:border-white/10 p-6 rounded-2xl flex flex-col justify-between group"
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className={`text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border ${ret.reason === 'DAMAGED' ? 'text-accent-orange bg-accent-orange/10 border-accent-orange/20' : ret.reason === 'RETURNED' ? 'text-accent-blue bg-accent-blue/10 border-accent-blue/20' : 'text-accent-pink bg-accent-pink/10 border-accent-pink/20'}`}>
                                                {ret.reason}
                                            </span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                {new Date(ret.reported_at).toLocaleDateString()}
                                            </span>
                                        </div>

                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{ret.item.name}</h3>
                                        <div className="text-2xl font-black text-slate-900 dark:text-white/90 mb-4 tracking-tight">
                                            {ret.quantity} <span className="text-sm font-medium text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-1">Units</span>
                                        </div>

                                        <div className="flex flex-col gap-2 p-3 bg-black/20 rounded-xl border border-slate-200 dark:border-white/5 mb-6">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-slate-600 dark:text-slate-400">Driver</span>
                                                <span className="font-semibold text-slate-900 dark:text-white">{ret.dispatch.driver.name}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-slate-600 dark:text-slate-400">Dispatch ID</span>
                                                <span className="font-mono text-slate-900 dark:text-white">#{ret.dispatchId.toString().padStart(4, '0')}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleReject(ret.id)}
                                            disabled={isPending}
                                            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-accent-pink/50 hover:bg-accent-pink/10 hover:text-accent-pink text-slate-500 dark:text-slate-400 dark:text-slate-300 font-medium text-sm transition-all flex items-center justify-center gap-2"
                                        >
                                            <X className="w-4 h-4" /> Reject
                                        </button>
                                        <button
                                            onClick={() => handleApprove(ret.id)}
                                            disabled={isPending}
                                            className="flex-1 py-2.5 rounded-xl bg-accent-blue hover:bg-accent-blue/90 text-slate-900 dark:text-white font-medium text-sm transition-all flex items-center justify-center gap-2"
                                        >
                                            <Check className="w-4 h-4" /> Approve
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight mb-6 flex items-center gap-3">
                    <History className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                    Verification History
                </h2>

                <div className="glass-panel border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                    {history.length === 0 ? (
                        <div className="p-8 text-center text-slate-600 dark:text-slate-400 text-sm">No history found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-white/10 bg-white/[0.02]">
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Driver</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Item</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Qty / Reason</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((his) => (
                                        <tr key={his.id} className="border-b border-slate-200 dark:border-white/5 hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-300 whitespace-nowrap">
                                                {new Date(his.verified_at || his.reported_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-900 dark:text-white font-medium">
                                                {his.dispatch.driver.name}
                                                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">Route #{his.dispatchId.toString().padStart(4, '0')}</div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-300">
                                                {his.item.name}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-900 dark:text-white">
                                                {his.quantity}
                                                <span className={`ml-2 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${his.reason === 'DAMAGED' ? 'text-accent-orange bg-accent-orange/10' : his.reason === 'RETURNED' ? 'text-accent-blue bg-accent-blue/10' : 'text-accent-pink bg-accent-pink/10'}`}>
                                                    {his.reason}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {his.status === 'APPROVED' ? (
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent-green bg-accent-green/10 border border-accent-green/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 w-max">
                                                        <Check className="w-3 h-3" /> Approved
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 w-max">
                                                        <X className="w-3 h-3" /> Rejected
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
