"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useId } from "react";
import { useModalBehavior } from "@/hooks/useModalBehavior";

type Props = {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    isDestructive?: boolean;
    /**
     * When provided, the dialog stays open and shows a spinner while the action
     * runs, and the caller closes it on completion. Without it the dialog closes
     * immediately on confirm (the historical behaviour) — which meant the only
     * feedback was a toast arriving seconds later, and a double-click fired the
     * action twice.
     */
    isPending?: boolean;
};

export function ConfirmModal({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = "Confirm",
    isDestructive = true,
    isPending,
}: Props) {
    const titleId = useId();
    // While an action is in flight, Esc and backdrop clicks must not dismiss —
    // the caller owns closing at that point.
    const dismissable = !isPending;
    const { panelRef, dialogProps } = useModalBehavior({
        isOpen,
        onClose: onCancel,
        closeOnEscape: dismissable,
        labelledBy: titleId,
    });

    // Callers that don't pass `isPending` keep the old fire-and-close behaviour,
    // so adopting this prop is opt-in per call site.
    const isControlled = isPending !== undefined;

    // NOTE: the panel below sits at z-[10000] and must stay above the z-[9999]
    // data-entry modals that nest this one (warehouse/machine calibration, cost
    // correction). Those render this dialog as a *sibling* under the same portal
    // wrapper, so at the old z-[999] the confirm step painted behind their opaque
    // panel and "Apply Calibration" appeared to do nothing at all.

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        onClick={dismissable ? onCancel : undefined}
                    />
                    <motion.div
                        ref={panelRef}
                        {...dialogProps}
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="relative w-full max-w-md bg-neo-surface border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden glass-panel"
                    >
                        <div className="absolute top-0 right-0 p-4">
                            <button
                                onClick={onCancel}
                                disabled={!dismissable}
                                aria-label="Close dialog"
                                className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-40"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-col items-center text-center mt-2">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${isDestructive ? 'bg-accent-pink/10 border border-accent-pink/20 text-accent-pink' : 'bg-accent-blue/10 border border-accent-blue/20 text-accent-blue'}`}>
                                <AlertTriangle className="w-8 h-8" />
                            </div>

                            <h3 id={titleId} className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">{message}</p>

                            <div className="flex w-full gap-3">
                                <button
                                    onClick={onCancel}
                                    disabled={!dismissable}
                                    className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white font-medium transition-colors disabled:opacity-40"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onConfirm();
                                        // Controlled callers close on completion themselves.
                                        if (!isControlled) onCancel();
                                    }}
                                    disabled={isPending}
                                    className={`flex-1 py-3 px-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 ${isDestructive
                                        ? 'bg-accent-pink hover:bg-accent-pink/90 text-slate-900 dark:text-white shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                                        : 'bg-accent-blue hover:bg-accent-blue/90 text-slate-900 dark:text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                                        }`}
                                >
                                    {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isPending ? "Working…" : confirmText}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
