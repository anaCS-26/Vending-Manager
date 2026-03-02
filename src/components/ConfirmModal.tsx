"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

type Props = {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    isDestructive?: boolean;
};

export function ConfirmModal({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = "Confirm",
    isDestructive = true
}: Props) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        onClick={onCancel}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="relative w-full max-w-md bg-neo-surface border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden glass-panel"
                    >
                        <div className="absolute top-0 right-0 p-4">
                            <button onClick={onCancel} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-col items-center text-center mt-2">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${isDestructive ? 'bg-accent-pink/10 border border-accent-pink/20 text-accent-pink' : 'bg-accent-blue/10 border border-accent-blue/20 text-accent-blue'}`}>
                                <AlertTriangle className="w-8 h-8" />
                            </div>

                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
                            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">{message}</p>

                            <div className="flex w-full gap-3">
                                <button
                                    onClick={onCancel}
                                    className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onConfirm();
                                        onCancel();
                                    }}
                                    className={`flex-1 py-3 px-4 rounded-xl font-bold transition-colors ${isDestructive
                                        ? 'bg-accent-pink hover:bg-accent-pink/90 text-slate-900 dark:text-white shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                                        : 'bg-accent-blue hover:bg-accent-blue/90 text-slate-900 dark:text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                                        }`}
                                >
                                    {confirmText}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
