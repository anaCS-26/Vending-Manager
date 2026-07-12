"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Search, Save, ClipboardList, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { createDispatchTemplate, updateDispatchTemplate } from "@/actions/dispatch-templates";
import { NumericInput } from "@/components/NumericInput";
import type { DispatchTemplateWithItems } from "@/types";

export type TemplateItemOption = {
    id: number;
    name: string;
    sku: string;
    default_assignment_qty: number;
    isActive?: boolean;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    /** null = create a new template */
    template: DispatchTemplateWithItems | null;
    items: TemplateItemOption[];
};

export default function TemplateEditorModal({ isOpen, onClose, template, items }: Props) {
    const [isPending, startTransition] = useTransition();
    const [name, setName] = useState("");
    const [lines, setLines] = useState<Record<number, number>>({});
    const [searchQuery, setSearchQuery] = useState("");

    // Re-seed the form whenever the modal opens (fresh for create, prefilled for edit).
    useEffect(() => {
        if (!isOpen) return;
        setName(template?.name ?? "");
        setLines(Object.fromEntries((template?.Items ?? []).map(l => [l.itemId, l.quantity])));
        setSearchQuery("");
    }, [isOpen, template]);

    if (!isOpen) return null;

    const activeItems = items.filter(i => i.isActive !== false);
    const q = searchQuery.toLowerCase();
    const searchResults = q === ""
        ? []
        : activeItems
            .filter(i => !(i.id in lines) && (i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)))
            .slice(0, 5);
    const selectedLines = activeItems.filter(i => i.id in lines);
    const totalUnits = Object.values(lines).reduce((sum, n) => sum + n, 0);

    const addLine = (item: TemplateItemOption) => {
        setLines(prev => ({ ...prev, [item.id]: item.default_assignment_qty || 1 }));
        setSearchQuery("");
    };

    const setLineQty = (itemId: number, qty: number) => {
        setLines(prev => ({ ...prev, [itemId]: qty }));
    };

    const removeLine = (itemId: number) => {
        setLines(prev => {
            const next = { ...prev };
            delete next[itemId];
            return next;
        });
    };

    const handleSave = () => {
        const payload = Object.entries(lines)
            .map(([id, quantity]) => ({ itemId: parseInt(id), quantity }))
            .filter(l => l.quantity > 0);

        if (!name.trim()) {
            toast.error("Give the template a name.");
            return;
        }
        if (payload.length === 0) {
            toast.error("Add at least one item with a quantity > 0.");
            return;
        }

        startTransition(async () => {
            const result = template
                ? await updateDispatchTemplate(template.id, name, payload)
                : await createDispatchTemplate(name, payload);
            if (result.success) {
                toast.success(`Template ${template ? "updated" : "created"}`);
                onClose();
            } else {
                toast.error(result.error || "Failed to save template");
            }
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="relative bg-white dark:bg-[#0a0a0b] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue">
                                    <ClipboardList className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{template ? "Edit Template" : "New Dispatch Template"}</h2>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Predefine items and quantities for one-click driver pushes</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-white/5 hover:text-slate-900 dark:hover:text-white rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Template Name</label>
                                <input
                                    type="text"
                                    maxLength={80}
                                    placeholder="e.g. Morning Route A"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue transition-colors"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Add Items</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500 dark:text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by name or code..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue transition-colors"
                                    />
                                </div>

                                {searchQuery && (
                                    <div className="mt-2 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-white/5 max-h-[200px] overflow-y-auto">
                                        {searchResults.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => addLine(item)}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-100 dark:hover:bg-white/[0.04] flex justify-between items-center group transition-colors"
                                            >
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-accent-blue transition-colors">{item.name}</p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">#{item.sku}</p>
                                                </div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-accent-blue opacity-0 group-hover:opacity-100 transition-opacity">Add</span>
                                            </button>
                                        ))}
                                        {searchResults.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">No matching items</div>}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">Template Items</label>
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{selectedLines.length} item(s) · {totalUnits} units</span>
                                </div>
                                {selectedLines.length === 0 ? (
                                    <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl p-8 text-center">
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No items yet. Search above to add products.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {selectedLines.map(item => (
                                            <div key={item.id} className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.name}</p>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">#{item.sku}</p>
                                                </div>
                                                <NumericInput
                                                    value={lines[item.id]}
                                                    onChange={(qty) => setLineQty(item.id, qty)}
                                                    className="w-20 bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1.5 text-sm text-center font-bold text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue transition-colors"
                                                />
                                                <button
                                                    onClick={() => removeLine(item.id)}
                                                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-accent-pink hover:bg-accent-pink/10 rounded-md transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-200 dark:border-white/5 flex justify-end gap-3 bg-slate-50 dark:bg-white/[0.02] shrink-0">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isPending}
                                className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-lg shadow-accent-blue/20 transition-all active:scale-95"
                            >
                                {isPending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                                {template ? "Save Changes" : "Create Template"}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
