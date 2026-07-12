"use client";

import { useMemo, useState, useTransition } from "react";
import {
    Backpack,
    AlertTriangle,
    Clock,
    Loader2,
    Search,
    History,
    Package,
    ChevronDown,
    Plus,
    Minus,
    Check,
    ClipboardList,
    BookmarkPlus,
    X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { assignToDriver } from "@/actions/driver-stock";
import { createDispatchTemplate } from "@/actions/dispatch-templates";
import { formatSaudiDate, formatSaudiTime } from "@/lib/utils";
import type { WarehouseWithItem, WarehouseType, DispatchTemplateWithItems } from "@/types";

type StockAssignmentLite = {
    id: number;
    itemId: number;
    quantity: number;
    status: string;
    assigned_at: Date;
    acknowledged_at: Date | null;
    acknowledged_qty: number | null;
    notes: string | null;
    item: { id: number; name: string };
};

type RefillLogLite = {
    id: number;
    itemId: number;
    quantity_refilled: number;
    refilled_at: Date;
    item: { id: number; name: string };
    machine: { id: number; location_name: string };
};

type DriverWithBag = {
    id: number;
    name: string;
    phone: string | null;
    isActive: boolean;
    DriverStock: Array<{
        id: number;
        itemId: number;
        quantity_on_hand: number;
        item: { id: number; name: string; sku: string };
    }>;
    StockAssignments: StockAssignmentLite[];
    RefillLogs: RefillLogLite[];
};

type Props = {
    drivers: DriverWithBag[];
    inventory: WarehouseWithItem[];
    warehouses: WarehouseType[];
    templates: DispatchTemplateWithItems[];
};

export function DriverStockManager({ drivers, inventory, warehouses, templates }: Props) {
    const [selectedDriverId, setSelectedDriverId] = useState<string>("");
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">("");
    const [searchQuery, setSearchQuery] = useState("");
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [isPending, startTransition] = useTransition();
    const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
    const [templateName, setTemplateName] = useState("");

    const selectedDriver = useMemo(
        () => drivers.find((d) => d.id.toString() === selectedDriverId) ?? null,
        [drivers, selectedDriverId]
    );

    const filteredInventory = useMemo(() => {
        if (!selectedWarehouseId) return [];
        const q = searchQuery.toLowerCase();
        return inventory.filter(
            (inv) =>
                inv.warehouseId === selectedWarehouseId &&
                inv.quantity_on_hand > 0 &&
                (q === "" || inv.item.name.toLowerCase().includes(q) || inv.item.sku.toLowerCase().includes(q))
        );
    }, [inventory, selectedWarehouseId, searchQuery]);

    const handleQtyChange = (itemId: number, rawValue: string, max: number) => {
        const val = parseInt(rawValue.replace(/[^0-9]/g, ""), 10);
        if (isNaN(val) || val <= 0) {
            setQuantities((prev) => {
                const next = { ...prev };
                delete next[itemId];
                return next;
            });
        } else {
            setQuantities((prev) => ({ ...prev, [itemId]: Math.min(val, max) }));
        }
    };

    const handleIncrement = (itemId: number, currentQty: number, max: number) => {
        handleQtyChange(itemId, String(currentQty + 1), max);
    };

    const handleAddBatch = (itemId: number, currentQty: number, batchQty: number, max: number) => {
        handleQtyChange(itemId, String(currentQty + batchQty), max);
    };

    /**
     * Replaces the staged grid with a template's lines, clamped to the selected
     * warehouse's on-hand stock. Built from the raw inventory (not
     * filteredInventory) so an active search query can't silently drop lines.
     */
    const handleLoadTemplate = (templateId: number) => {
        const template = templates.find((t) => t.id === templateId);
        if (!template || !selectedWarehouseId) return;

        const onHandByItem = new Map(
            inventory
                .filter((inv) => inv.warehouseId === selectedWarehouseId)
                .map((inv) => [inv.itemId, inv.quantity_on_hand])
        );

        const next: Record<number, number> = {};
        const adjusted: string[] = [];
        const skipped: string[] = [];
        for (const line of template.Items) {
            const onHand = onHandByItem.get(line.itemId) ?? 0;
            if (onHand <= 0) {
                skipped.push(line.item.name);
                continue;
            }
            next[line.itemId] = Math.min(line.quantity, onHand);
            if (line.quantity > onHand) adjusted.push(`${line.item.name} (${line.quantity}→${onHand})`);
        }

        setQuantities(next);
        setSearchQuery("");

        const staged = Object.keys(next).length;
        if (staged === 0) {
            toast.error("Nothing to load", {
                description: "None of the template's items are in stock at this warehouse.",
            });
            return;
        }
        toast.success(`Loaded "${template.name}"`, { description: `${staged} item(s) staged.` });
        if (adjusted.length || skipped.length) {
            const clip = (list: string[]) => list.slice(0, 6).join(", ") + (list.length > 6 ? ` +${list.length - 6} more` : "");
            const parts = [];
            if (adjusted.length) parts.push(`Capped to stock: ${clip(adjusted)}`);
            if (skipped.length) parts.push(`Skipped (no stock here): ${clip(skipped)}`);
            toast.warning("Template adjusted to warehouse stock", { description: parts.join(" — ") });
        }
    };

    const handleSaveTemplate = () => {
        const lineItems = Object.entries(quantities).map(([id, quantity]) => ({ itemId: parseInt(id), quantity }));
        if (!templateName.trim() || lineItems.length === 0) return;
        startTransition(async () => {
            const result = await createDispatchTemplate(templateName, lineItems);
            if (result.success) {
                toast.success(`Template "${result.data!.name}" saved`, {
                    description: "Manage it from the Templates tab in Entity Management.",
                });
                setTemplateName("");
                setIsSaveTemplateOpen(false);
            } else {
                toast.error("Failed to save template", { description: result.error });
            }
        });
    };

    const handlePush = () => {
        if (!selectedDriverId || !selectedWarehouseId) return;
        const driverId = parseInt(selectedDriverId);
        const lineItems = Object.entries(quantities).map(([id, qty]) => ({ itemId: parseInt(id), quantity: qty }));
        
        if (lineItems.length === 0) {
            toast.error("Set at least one item quantity > 0.");
            return;
        }

        startTransition(async () => {
            const result = await assignToDriver(driverId, selectedWarehouseId, lineItems);
            if (result.success) {
                toast.success("Pushed to driver bag", {
                    description: `${lineItems.length} line(s) added. Driver will see an acknowledgment notice on next sync.`,
                });
                setQuantities({});
            } else {
                toast.error("Push failed", { description: result.error });
            }
        });
    };

    const hasSelectedItems = Object.keys(quantities).length > 0;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 animate-in fade-in zoom-in-95 duration-300 pb-20 items-start">
            {/* LEFT — Push Items to Bag (Sticky on Desktop) */}
            <div className="xl:sticky xl:top-24 flex flex-col gap-6 h-[calc(100vh-8rem)]">
                <div className="glass-panel border-slate-200 dark:border-white/10 rounded-3xl flex flex-col relative overflow-hidden h-full shadow-sm">
                    <div className="p-5 lg:p-6 border-b border-slate-200 dark:border-white/10 bg-gradient-to-r from-slate-50 to-white dark:from-white/[0.02] dark:to-transparent shrink-0">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight mb-5">Stock Allocation</h2>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                                    Target Driver
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedDriverId}
                                        onChange={(e) => setSelectedDriverId(e.target.value)}
                                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all cursor-pointer shadow-sm"
                                    >
                                        <option value="" disabled>-- Select Driver --</option>
                                        {drivers.map(d => {
                                            const issuesCount = d.StockAssignments.filter(a => a.status === "DISPUTED").length;
                                            return (
                                                <option key={d.id} value={d.id}>
                                                    {d.name} {issuesCount > 0 ? `(${issuesCount} Issue${issuesCount > 1 ? 's' : ''})` : ""}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronDown className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                                    Origin Warehouse
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedWarehouseId}
                                        onChange={(e) => {
                                            setSelectedWarehouseId(Number(e.target.value));
                                            setQuantities({});
                                        }}
                                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all cursor-pointer shadow-sm"
                                    >
                                        <option value="" disabled>-- Select Warehouse --</option>
                                        {warehouses.map(w => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronDown className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>

                            {templates.length > 0 && (
                                <div className="sm:col-span-2">
                                    <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                                        <ClipboardList className="w-3 h-3" /> Load Template
                                    </label>
                                    <div className="relative">
                                        <select
                                            value=""
                                            disabled={!selectedWarehouseId}
                                            title={!selectedWarehouseId ? "Select a warehouse first — quantities are capped to its stock" : undefined}
                                            onChange={(e) => {
                                                if (e.target.value) handleLoadTemplate(parseInt(e.target.value));
                                            }}
                                            className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <option value="" disabled>
                                                {selectedWarehouseId ? "-- Load a template into the grid --" : "-- Select a warehouse first --"}
                                            </option>
                                            {templates.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.name} ({t.Items.length} items)
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                            <ChevronDown className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col p-5 lg:p-6 bg-slate-50/50 dark:bg-transparent overflow-hidden">
                        {selectedWarehouseId !== "" ? (
                            <>
                                <div className="relative group mb-3 shrink-0">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent-blue transition-colors">
                                        <Search className="w-3.5 h-3.5" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search inventory..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-accent-blue shadow-sm transition-all"
                                    />
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-1.5">
                                    {filteredInventory.length === 0 ? (
                                        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-white/5 rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                                            {searchQuery ? "No matching items." : "No available stock in this warehouse."}
                                        </div>
                                    ) : (
                                        filteredInventory.map((inv) => {
                                            const qty = quantities[inv.itemId] || 0;
                                            const isSelected = qty > 0;
                                            return (
                                                <div
                                                    key={inv.id}
                                                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-2.5 rounded-xl border transition-all gap-2 sm:gap-3 ${
                                                        isSelected
                                                            ? "border-accent-blue bg-accent-blue/5 shadow-[0_0_10px_rgba(0,180,255,0.05)]"
                                                            : "border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 hover:border-slate-300 dark:hover:border-white/20"
                                                    }`}
                                                >
                                                    <div className="flex flex-col min-w-0 sm:pr-3">
                                                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{inv.item.name}</span>
                                                        <span className="text-[9px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                                                            {inv.item.sku}
                                                            <span className="text-slate-300 dark:text-slate-600">|</span>
                                                            Max: {inv.quantity_on_hand}
                                                        </span>
                                                    </div>

                                                    {/* Inline Quantity Controls */}
                                                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                                        <div className="flex items-center bg-slate-100 dark:bg-black/40 rounded-md p-0.5 border border-slate-200 dark:border-white/5">
                                                            <button
                                                                onClick={() => handleQtyChange(inv.itemId, String(qty - 1), inv.quantity_on_hand)}
                                                                className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 rounded transition-all"
                                                            >
                                                                <Minus className="w-3 h-3" />
                                                            </button>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={qty || ""}
                                                                placeholder="0"
                                                                onChange={(e) => handleQtyChange(inv.itemId, e.target.value, inv.quantity_on_hand)}
                                                                className="w-8 bg-transparent text-center text-xs font-black text-slate-900 dark:text-white focus:outline-none"
                                                            />
                                                            <button
                                                                onClick={() => handleIncrement(inv.itemId, qty, inv.quantity_on_hand)}
                                                                disabled={qty >= inv.quantity_on_hand}
                                                                aria-label="Add one"
                                                                title="Add one"
                                                                className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                            >
                                                                <Plus className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        {inv.item.default_assignment_qty > 0 && (
                                                            <button
                                                                onClick={() => handleAddBatch(inv.itemId, qty, inv.item.default_assignment_qty, inv.quantity_on_hand)}
                                                                disabled={qty + inv.item.default_assignment_qty > inv.quantity_on_hand}
                                                                aria-label={`Add a batch of ${inv.item.default_assignment_qty}`}
                                                                title={`Add a batch of ${inv.item.default_assignment_qty}`}
                                                                className="px-2 py-1 rounded-md border border-accent-blue/30 bg-accent-blue/5 text-[10px] font-mono font-bold text-accent-blue hover:bg-accent-blue/10 hover:border-accent-blue/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-accent-blue/5 disabled:hover:border-accent-blue/30"
                                                            >
                                                                +{inv.item.default_assignment_qty}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleQtyChange(inv.itemId, "0", inv.quantity_on_hand)}
                                                            aria-label="Remove from assignment"
                                                            title="Remove from assignment"
                                                            className={`p-1 rounded-md border transition-all ${
                                                                isSelected
                                                                    ? "text-accent-pink border-accent-pink/30 bg-accent-pink/5 hover:bg-accent-pink/10 hover:border-accent-pink/50"
                                                                    : "text-slate-300 dark:text-slate-700 border-transparent cursor-not-allowed opacity-40"
                                                            }`}
                                                            disabled={!isSelected}
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
                                <p className="text-slate-500 dark:text-slate-400 text-xs">Select an origin warehouse to view and allocate inventory.</p>
                            </div>
                        )}
                    </div>

                    {/* Push Bar */}
                    <div className="p-4 lg:p-5 border-t border-slate-200 dark:border-white/10 bg-white/80 dark:bg-neo-bg/80 backdrop-blur-xl shrink-0">
                        <AnimatePresence>
                            {isSaveTemplateOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8, height: 0 }}
                                    animate={{ opacity: 1, y: 0, height: "auto" }}
                                    exit={{ opacity: 0, y: 8, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <input
                                            type="text"
                                            autoFocus
                                            maxLength={80}
                                            placeholder="Template name, e.g. Morning Route A"
                                            value={templateName}
                                            onChange={(e) => setTemplateName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); }}
                                            className="flex-1 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                                        />
                                        <button
                                            onClick={handleSaveTemplate}
                                            disabled={!templateName.trim() || isPending}
                                            className="px-4 py-2 bg-accent-green/90 hover:bg-accent-green disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={() => { setIsSaveTemplateOpen(false); setTemplateName(""); }}
                                            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div className="flex gap-2">
                            <button
                                onClick={handlePush}
                                disabled={!selectedDriverId || !selectedWarehouseId || !hasSelectedItems || isPending}
                                className="flex-1 relative py-3 bg-accent-blue hover:bg-accent-blue/90 disabled:bg-slate-300 dark:disabled:bg-slate-800 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-white shadow-lg disabled:shadow-none shadow-accent-blue/20 disabled:cursor-not-allowed text-sm"
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Backpack className="w-4 h-4" />}
                                {isPending ? "Assigning..." : hasSelectedItems ? `Push ${Object.keys(quantities).length} Items to Bag` : "Select Items to Push"}
                            </button>
                            <button
                                onClick={() => setIsSaveTemplateOpen((open) => !open)}
                                disabled={!hasSelectedItems || isPending}
                                title="Save the staged quantities as a reusable template"
                                className="px-4 py-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-slate-700 dark:text-slate-200 text-sm"
                            >
                                <BookmarkPlus className="w-4 h-4" />
                                <span className="hidden sm:inline">Save as Template</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT — Driver Bag Detailed View */}
            <div className="flex flex-col h-full space-y-6">
                {!selectedDriver ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="glass-panel border-slate-200 dark:border-white/5 rounded-3xl p-12 flex flex-col items-center justify-center text-center border-dashed h-full min-h-[400px]"
                    >
                        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-5 border border-slate-200 dark:border-white/10 shadow-inner">
                            <Backpack className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                        </div>
                        <h3 className="text-lg text-slate-900 dark:text-white font-bold mb-2 tracking-tight">Driver Stock Dashboard</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-xs max-w-sm">Select a driver from the left pane to view their current inventory alongside the allocation menu.</p>
                    </motion.div>
                ) : (
                    <DriverDashboard driver={selectedDriver} />
                )}
            </div>
        </div>
    );
}

function DriverDashboard({ driver }: { driver: DriverWithBag }) {
    const [activeTab, setActiveTab] = useState<"STOCK" | "REFILLS" | "PENDING" | "HISTORY">("STOCK");
    const [stockSearchQuery, setStockSearchQuery] = useState("");
    
    const pending = driver.StockAssignments.filter((a) => a.status === "PENDING_ACK");
    const disputed = driver.StockAssignments.filter((a) => a.status === "DISPUTED");
    const assignmentHistory = driver.StockAssignments.filter((a) => a.status === "ACKNOWLEDGED");
    const issuesCount = pending.length + disputed.length;
    
    const bagTotalQty = driver.DriverStock.reduce((s, r) => s + r.quantity_on_hand, 0);

    return (
        <div className="glass-panel border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden flex flex-col h-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none bg-white/50 dark:bg-neo-bg/50 backdrop-blur-xl">
            {/* Header Profile */}
            <div className="p-5 md:p-6 border-b border-slate-200 dark:border-white/5 bg-gradient-to-r from-slate-50 to-white dark:from-white/[0.02] dark:to-transparent shrink-0">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 shrink-0 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue text-lg font-black uppercase shadow-inner">
                            {driver.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-none">{driver.name}</h3>
                            <div className="mt-1.5 text-xs font-mono text-slate-500">
                                {driver.phone || "No Phone"}
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-right hidden sm:block shrink-0">
                        <div className="text-[9px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-0.5">Total Items</div>
                        <div className="text-2xl font-black text-accent-blue tracking-tighter leading-none">{bagTotalQty.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center justify-center gap-1 px-3 md:px-4 pt-3 border-b border-slate-200 dark:border-white/5 shrink-0">
                <TabButton 
                    active={activeTab === "STOCK"} 
                    onClick={() => setActiveTab("STOCK")} 
                    icon={<Package className="w-3.5 h-3.5" />} 
                    label="Current Stock" 
                    count={driver.DriverStock.length}
                />
                <TabButton 
                    active={activeTab === "REFILLS"} 
                    onClick={() => setActiveTab("REFILLS")} 
                    icon={<History className="w-3.5 h-3.5" />} 
                    label="Recent Refills" 
                    count={driver.RefillLogs.length}
                />
                <TabButton 
                    active={activeTab === "PENDING"} 
                    onClick={() => setActiveTab("PENDING")} 
                    icon={<AlertTriangle className="w-3.5 h-3.5" />} 
                    label="Pending / Disputed" 
                    count={issuesCount}
                    alert={disputed.length > 0}
                />
                <TabButton 
                    active={activeTab === "HISTORY"} 
                    onClick={() => setActiveTab("HISTORY")} 
                    icon={<ClipboardList className="w-3.5 h-3.5" />} 
                    label="Assignment History" 
                    count={assignmentHistory.length}
                />
            </div>

            {/* Content Area */}
            <div className="flex-1 p-5 md:p-6 bg-slate-50/50 dark:bg-black/20 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                    {activeTab === "STOCK" && (() => {
                        const q = stockSearchQuery.toLowerCase();
                        const filteredStock = driver.DriverStock.filter(row => 
                            q === "" || row.item.name.toLowerCase().includes(q) || row.item.sku.toLowerCase().includes(q)
                        );
                        
                        return (
                        <motion.div key="stock" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                            {driver.DriverStock.length > 0 && (
                                <div className="relative group shrink-0">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent-blue transition-colors">
                                        <Search className="w-3.5 h-3.5" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search driver stock..."
                                        value={stockSearchQuery}
                                        onChange={(e) => setStockSearchQuery(e.target.value)}
                                        className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg py-2 pl-9 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-accent-blue shadow-sm transition-all"
                                    />
                                </div>
                            )}

                            {driver.DriverStock.length === 0 ? (
                                <EmptyState icon={<Package className="w-8 h-8" />} title="Bag is Empty" message="Assign items from the warehouse to begin operations." />
                            ) : filteredStock.length === 0 ? (
                                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-white/5 rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                                    No items matching "{stockSearchQuery}".
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-3">
                                    {filteredStock.map((row) => (
                                        <div key={row.id} className="p-3 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex flex-col justify-between hover:border-accent-blue/30 transition-colors shadow-sm">
                                            <div>
                                                <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight">{row.item.name}</div>
                                                <div className="text-[9px] font-mono text-slate-500 mt-1">{row.item.sku}</div>
                                            </div>
                                            <div className="mt-3 flex items-end justify-between border-t border-slate-100 dark:border-white/5 pt-2">
                                                <div className="text-[9px] uppercase font-bold text-slate-400 tracking-widest">In Bag</div>
                                                <div className="text-lg font-black text-accent-blue leading-none">{row.quantity_on_hand}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                        );
                    })()}

                    {activeTab === "REFILLS" && (
                        <motion.div key="refills" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {driver.RefillLogs.length === 0 ? (
                                <EmptyState icon={<History className="w-8 h-8" />} title="No Refill History" message="Driver hasn't made any recent machine refills." />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {driver.RefillLogs.map((log) => (
                                        <div key={log.id} className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-neo-bg border border-slate-200 dark:border-white/10 shadow-sm">
                                            <div className="flex flex-col min-w-0 pr-3">
                                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{log.item.name}</span>
                                                <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 truncate">
                                                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{log.machine.location_name}</span>
                                                    <span className="mx-0.5 opacity-50">•</span>
                                                    {formatSaudiTime(log.refilled_at, { hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-base font-black text-accent-green">+{log.quantity_refilled}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "PENDING" && (
                        <motion.div key="pending" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {issuesCount === 0 ? (
                                <EmptyState icon={<Check className="w-8 h-8" />} title="All Clear" message="No pending acknowledgments or disputed stock assignments." />
                            ) : (
                                <div className="space-y-5">
                                    {disputed.length > 0 && (
                                        <div>
                                            <h4 className="text-[9px] uppercase font-bold tracking-widest text-accent-pink mb-2.5 flex items-center gap-1.5">
                                                <AlertTriangle className="w-3 h-3" /> Disputed Assignments
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {disputed.map(a => <AssignmentCard key={a.id} assignment={a} isDisputed={true} />)}
                                            </div>
                                        </div>
                                    )}
                                    {pending.length > 0 && (
                                        <div>
                                            <h4 className="text-[9px] uppercase font-bold tracking-widest text-amber-500 mb-2.5 flex items-center gap-1.5">
                                                <Clock className="w-3 h-3" /> Awaiting Acknowledgment
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {pending.map(a => <AssignmentCard key={a.id} assignment={a} isDisputed={false} />)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "HISTORY" && (
                        <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {assignmentHistory.length === 0 ? (
                                <EmptyState icon={<ClipboardList className="w-8 h-8" />} title="No History" message="No acknowledged stock assignments found." />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {assignmentHistory.map(a => <AssignmentCard key={a.id} assignment={a} isDisputed={false} />)}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label, count, alert }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number; alert?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 px-3 py-2.5 border-b-2 font-bold text-xs transition-all whitespace-nowrap ${
                active 
                    ? alert ? "border-accent-pink text-accent-pink" : "border-accent-blue text-accent-blue bg-accent-blue/5" 
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            }`}
        >
            {icon}
            {label}
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${active ? alert ? "bg-accent-pink/20 text-accent-pink" : "bg-accent-blue/20 text-accent-blue" : "bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400"}`}>
                {count}
            </span>
        </button>
    );
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 py-12">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4 text-slate-400 border border-slate-200 dark:border-white/10 shadow-inner">
                {icon}
            </div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1 tracking-tight">{title}</h4>
            <p className="text-xs text-slate-500 max-w-xs">{message}</p>
        </div>
    );
}

import { dismissAssignment } from "@/actions/driver-stock";

function AssignmentCard({ assignment, isDisputed }: { assignment: StockAssignmentLite; isDisputed: boolean }) {
    const [isPending, startTransition] = useTransition();

    const handleDismiss = () => {
        startTransition(async () => {
            const result = await dismissAssignment(assignment.id);
            if (result.success) {
                toast.success("Assignment dismissed", { description: "The disputed assignment has been cleared." });
            } else {
                toast.error("Failed to dismiss", { description: result.error });
            }
        });
    };

    return (
        <div className={`p-3.5 rounded-xl border ${isDisputed ? 'bg-accent-pink/5 border-accent-pink/20' : assignment.status === 'ACKNOWLEDGED' ? 'bg-accent-green/5 border-accent-green/20' : 'bg-white dark:bg-neo-bg border-slate-200 dark:border-white/10 shadow-sm'} relative group`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-xs text-slate-900 dark:text-white mb-1 line-clamp-1">{assignment.item.name}</h5>
                    <div className="text-[9px] font-mono text-slate-500">
                        {assignment.status === 'ACKNOWLEDGED' ? 'Ack\'d: ' : 'Assigned: '}
                        {formatSaudiDate(assignment.status === 'ACKNOWLEDGED' && assignment.acknowledged_at ? assignment.acknowledged_at : assignment.assigned_at)} {formatSaudiTime(assignment.status === 'ACKNOWLEDGED' && assignment.acknowledged_at ? assignment.acknowledged_at : assignment.assigned_at, { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {assignment.notes && (
                        <div className="mt-2 text-[10px] italic text-slate-600 dark:text-slate-400 border-l-2 border-slate-300 dark:border-slate-600 pl-2 py-0.5">
                            "{assignment.notes}"
                        </div>
                    )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                    {isDisputed && (
                        <button 
                            onClick={handleDismiss}
                            disabled={isPending}
                            className="p-1 rounded-md bg-accent-pink/10 text-accent-pink hover:bg-accent-pink hover:text-white transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center -mr-1 -mt-1"
                            title="Dismiss Dispute"
                        >
                            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    <div>
                        <div className="text-lg font-black text-slate-900 dark:text-white leading-none">{assignment.quantity}</div>
                        <div className="text-[8px] uppercase font-bold tracking-widest text-slate-400 mt-1">Pushed</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
