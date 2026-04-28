"use client";

import { useState } from "react";
import { Edit2, TrendingUp, Package, Check, X, Loader2, Undo2 } from "lucide-react";
import { updateRefillLog } from "@/actions/history";
import { toast } from "sonner";

interface EditLogProps {
    log: any;
}

export function EditLogModal({ log }: EditLogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Initializing with existing values
    const [refilled, setRefilled] = useState(log.quantity_refilled || 0);

    const isReturnOnly = log.quantity_refilled === 0 && ((log.expired_quantity || 0) > 0 || (log.damaged_quantity || 0) > 0);
    const returnQuantity = (log.expired_quantity || 0) + (log.damaged_quantity || 0);

    async function handleSave() {
        if (refilled < 0) {
            toast.error("Quantities cannot be negative");
            return;
        }

        setIsSaving(true);
        try {
            const result = await updateRefillLog(log.id, refilled, refilled);
            if (result.success) {
                toast.success("Log updated successfully");
                setIsOpen(false);
            } else {
                toast.error(result.error);
            }
        } catch (e) {
            toast.error("An unexpected error occurred");
        } finally {
            setIsSaving(false);
        }
    }

    if (isReturnOnly) {
        return (
            <div className="flex items-center gap-4 bg-accent-orange/10 px-3 py-1.5 rounded-lg border border-accent-orange/20 transition-all duration-200">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-accent-orange uppercase flex items-center gap-1"><Undo2 className="w-3 h-3" /> Returned</span>
                    <span className="text-sm font-bold text-accent-orange font-mono tracking-tight">
                        {returnQuantity}
                    </span>
                </div>
            </div>
        );
    }

    if (!isOpen) {
        return (
            <div
                className="relative group/card cursor-pointer"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                }}
            >
                <div className="flex items-center gap-4 bg-white/[0.03] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/5 hover:border-slate-200 dark:border-white/10 transition-all duration-200">


                    {/* Refill Metric */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Refill</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 font-mono tracking-tight">
                            {log.quantity_refilled}
                        </span>
                    </div>

                    {/* Isolated Edit Hover */}
                    <div className="absolute inset-0 bg-accent-blue/90 rounded-lg opacity-0 group-hover/card:opacity-100 transition-all duration-200 flex items-center justify-center backdrop-blur-sm shadow-xl">
                        <div className="text-slate-900 dark:text-white text-[10px] font-black uppercase flex items-center gap-1.5">
                            <Edit2 className="w-3 h-3" />
                            Edit
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 bg-slate-200 dark:bg-slate-900 pr-1 pl-3 py-1 rounded-lg border border-accent-blue/50 shadow-2xl animate-in fade-in zoom-in-95 duration-200">


            <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase">Refill</span>
                <input
                    type="number"
                    value={refilled}
                    onChange={(e) => setRefilled(parseInt(e.target.value) || 0)}
                    className="w-10 bg-black/50 border border-slate-200 dark:border-white/10 rounded text-[11px] font-bold text-center text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue font-mono py-0.5"
                    autoFocus
                />
            </div>

            <div className="flex gap-1 pl-1.5 border-l border-slate-200 dark:border-white/10 ml-1">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-6 h-6 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-900 dark:text-white flex items-center justify-center transition-all disabled:opacity-50"
                >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                    onClick={() => setIsOpen(false)}
                    className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 text-slate-600 dark:text-slate-400 flex items-center justify-center transition-all"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
