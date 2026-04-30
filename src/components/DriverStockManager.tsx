"use client";

import { useMemo, useState, useTransition } from "react";
import {
    Package,
    PackagePlus,
    Search,
    Truck,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Loader2,
    X,
    Plus,
    Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { assignToDriver } from "@/actions/driver-stock";
import { formatSaudiTime } from "@/lib/utils";
import type { WarehouseWithItem, WarehouseType } from "@/types";

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
};

type Props = {
    drivers: DriverWithBag[];
    inventory: WarehouseWithItem[];
    warehouses: WarehouseType[];
};

export function DriverStockManager({ drivers, inventory, warehouses }: Props) {
    const [selectedDriverId, setSelectedDriverId] = useState<number | null>(
        drivers[0]?.id ?? null
    );
    const [pushModalOpen, setPushModalOpen] = useState(false);

    const selectedDriver = useMemo(
        () => drivers.find((d) => d.id === selectedDriverId) ?? null,
        [drivers, selectedDriverId]
    );

    return (
        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
            {/* Driver list */}
            <div className="space-y-2">
                {drivers.length === 0 && (
                    <div className="glass-panel rounded-2xl p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        No active drivers.
                    </div>
                )}
                {drivers.map((d) => {
                    const bagTotal = d.DriverStock.reduce((s, r) => s + r.quantity_on_hand, 0);
                    const pendingCount = d.StockAssignments.filter((a) => a.status === "PENDING_ACK").length;
                    const disputedCount = d.StockAssignments.filter((a) => a.status === "DISPUTED").length;
                    const isActive = d.id === selectedDriverId;
                    return (
                        <button
                            key={d.id}
                            onClick={() => setSelectedDriverId(d.id)}
                            className={`w-full text-left p-4 rounded-2xl border transition-all ${
                                isActive
                                    ? "bg-accent-blue/10 border-accent-blue/40 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                                    : "bg-white dark:bg-black/20 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-slate-900 dark:text-white truncate">{d.name}</span>
                                {pendingCount > 0 && (
                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                        {pendingCount} ack
                                    </span>
                                )}
                                {disputedCount > 0 && (
                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-accent-pink/20 text-accent-pink">
                                        {disputedCount} disp.
                                    </span>
                                )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {bagTotal} units · {d.DriverStock.length} item{d.DriverStock.length === 1 ? "" : "s"}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Selected driver detail */}
            <div>
                {!selectedDriver ? (
                    <div className="glass-panel rounded-3xl p-12 text-center text-slate-500 dark:text-slate-400">
                        Select a driver to manage their bag.
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="glass-panel rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-white/10">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{selectedDriver.name}</h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{selectedDriver.phone || "No phone on file"}</p>
                                </div>
                                <button
                                    onClick={() => setPushModalOpen(true)}
                                    className="inline-flex items-center gap-2 bg-accent-blue text-white font-bold py-3 px-5 rounded-2xl shadow-lg shadow-accent-blue/20 hover:bg-accent-blue/90 transition-colors"
                                >
                                    <PackagePlus className="w-5 h-5" /> Push items to bag
                                </button>
                            </div>

                            {/* Current bag */}
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <Package className="w-3 h-3" /> Current bag ({selectedDriver.DriverStock.length})
                                </h3>
                                {selectedDriver.DriverStock.length === 0 ? (
                                    <div className="text-sm text-slate-500 dark:text-slate-400 italic">Bag is empty.</div>
                                ) : (
                                    <div className="grid sm:grid-cols-2 gap-2">
                                        {selectedDriver.DriverStock.map((row) => (
                                            <div key={row.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{row.item.name}</div>
                                                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">SKU {row.item.sku}</div>
                                                </div>
                                                <div className="text-xl font-black text-accent-blue tracking-tighter">{row.quantity_on_hand}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Pending acks */}
                        <AssignmentList
                            title="Awaiting driver acknowledgment"
                            icon={<Clock className="w-3 h-3" />}
                            tone="amber"
                            assignments={selectedDriver.StockAssignments.filter((a) => a.status === "PENDING_ACK")}
                            emptyMessage="No pending acknowledgments."
                        />

                        {/* Disputed */}
                        <AssignmentList
                            title="Disputed (driver reported short)"
                            icon={<AlertTriangle className="w-3 h-3" />}
                            tone="pink"
                            assignments={selectedDriver.StockAssignments.filter((a) => a.status === "DISPUTED")}
                            emptyMessage="No disputes."
                        />
                    </div>
                )}
            </div>

            {/* Push modal */}
            <AnimatePresence>
                {pushModalOpen && selectedDriver && (
                    <PushItemsModal
                        driver={selectedDriver}
                        warehouses={warehouses}
                        inventory={inventory}
                        onClose={() => setPushModalOpen(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

function AssignmentList({
    title,
    icon,
    tone,
    assignments,
    emptyMessage,
}: {
    title: string;
    icon: React.ReactNode;
    tone: "amber" | "pink";
    assignments: StockAssignmentLite[];
    emptyMessage: string;
}) {
    const toneClasses =
        tone === "amber"
            ? "bg-amber-500/5 border-amber-500/20"
            : "bg-accent-pink/5 border-accent-pink/20";
    const toneText = tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-accent-pink";
    return (
        <div className={`rounded-3xl p-5 lg:p-6 border ${toneClasses}`}>
            <h3 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mb-3 ${toneText}`}>
                {icon} {title} ({assignments.length})
            </h3>
            {assignments.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400 italic">{emptyMessage}</div>
            ) : (
                <div className="space-y-2">
                    {assignments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5">
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{a.item.name}</div>
                                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                    Pushed {formatSaudiTime(a.assigned_at, { hour: "2-digit", minute: "2-digit" })}
                                    {a.status === "DISPUTED" && a.acknowledged_qty !== null && (
                                        <> · driver received <span className="font-bold text-accent-pink">{a.acknowledged_qty}</span> of {a.quantity}</>
                                    )}
                                </div>
                                {a.notes && (
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">"{a.notes}"</div>
                                )}
                            </div>
                            <div className="text-right shrink-0 ml-3">
                                <div className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">{a.quantity}</div>
                                <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400">pushed</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function PushItemsModal({
    driver,
    warehouses,
    inventory,
    onClose,
}: {
    driver: DriverWithBag;
    warehouses: WarehouseType[];
    inventory: WarehouseWithItem[];
    onClose: () => void;
}) {
    const [warehouseId, setWarehouseId] = useState<number | "">(warehouses[0]?.id ?? "");
    const [items, setItems] = useState<{ itemId: number; quantity: number }[]>([]);
    const [search, setSearch] = useState("");
    const [isPending, startTransition] = useTransition();

    const stockForWarehouse = useMemo(
        () => inventory.filter((s) => warehouseId !== "" && s.warehouseId === warehouseId && s.quantity_on_hand > 0),
        [inventory, warehouseId]
    );

    const filteredStock = useMemo(() => {
        const q = search.toLowerCase();
        return q ? stockForWarehouse.filter((s) => s.item.name.toLowerCase().includes(q) || s.item.sku.toLowerCase().includes(q)) : stockForWarehouse;
    }, [stockForWarehouse, search]);

    const addItem = (itemId: number) => {
        if (items.some((i) => i.itemId === itemId)) return;
        setItems([...items, { itemId, quantity: 1 }]);
    };

    const updateQty = (itemId: number, qty: number) => {
        setItems(items.map((i) => (i.itemId === itemId ? { ...i, quantity: Math.max(0, qty) } : i)));
    };

    const removeItem = (itemId: number) => setItems(items.filter((i) => i.itemId !== itemId));

    const submit = () => {
        if (warehouseId === "" || items.length === 0) return;
        const lineItems = items.filter((i) => i.quantity > 0);
        if (lineItems.length === 0) {
            toast.error("Add at least one item with quantity > 0.");
            return;
        }
        startTransition(async () => {
            const result = await assignToDriver(driver.id, warehouseId, lineItems);
            if (result.success) {
                toast.success("Pushed to driver bag", {
                    description: `${lineItems.length} item line(s) added. Driver will see an acknowledgment notice on next sync.`,
                });
                onClose();
            } else {
                toast.error("Push failed", { description: result.error });
            }
        });
    };

    const lookupItem = (itemId: number) =>
        stockForWarehouse.find((s) => s.itemId === itemId)?.item;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-[#121214] rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            >
                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/10">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Push items to bag</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{driver.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                        <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </button>
                </div>

                <div className="grid md:grid-cols-2 gap-4 p-6 overflow-y-auto flex-1">
                    {/* Source warehouse + search */}
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">From warehouse</label>
                            <select
                                value={warehouseId}
                                onChange={(e) => setWarehouseId(e.target.value === "" ? "" : Number(e.target.value))}
                                className="w-full bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue/50 transition-all"
                            >
                                {warehouses.map((w) => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">Available items</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by name or SKU..."
                                    className="w-full pl-10 pr-3 py-2.5 bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue/50"
                                />
                            </div>
                            <div className="mt-2 max-h-72 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                                {filteredStock.length === 0 ? (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 italic p-3">No items available.</div>
                                ) : (
                                    filteredStock.map((s) => {
                                        const inSelection = items.some((i) => i.itemId === s.itemId);
                                        return (
                                            <button
                                                key={s.itemId}
                                                onClick={() => addItem(s.itemId)}
                                                disabled={inSelection}
                                                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-left"
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{s.item.name}</div>
                                                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">SKU {s.item.sku} · {s.quantity_on_hand} on hand</div>
                                                </div>
                                                <Plus className={`w-4 h-4 shrink-0 ml-2 ${inSelection ? "text-accent-green" : "text-slate-400"}`} />
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Selected items + qty */}
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">To push ({items.length})</label>
                        {items.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                                Pick items from the left.
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                                {items.map((i) => {
                                    const meta = lookupItem(i.itemId);
                                    const stock = stockForWarehouse.find((s) => s.itemId === i.itemId);
                                    const exceedsStock = stock && i.quantity > stock.quantity_on_hand;
                                    return (
                                        <div key={i.itemId} className={`p-3 rounded-xl border bg-white dark:bg-black/30 ${exceedsStock ? "border-accent-pink/40" : "border-slate-200 dark:border-white/10"}`}>
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{meta?.name || `Item #${i.itemId}`}</div>
                                                    {stock && (
                                                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{stock.quantity_on_hand} on hand</div>
                                                    )}
                                                </div>
                                                <button onClick={() => removeItem(i.itemId)} className="p-1 rounded-lg text-slate-400 hover:text-accent-pink hover:bg-accent-pink/10">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => updateQty(i.itemId, i.quantity - 1)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/10">
                                                    <Minus className="w-4 h-4" />
                                                </button>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    autoComplete="off"
                                                    value={String(i.quantity)}
                                                    onChange={(e) => {
                                                        const raw = e.target.value.replace(/[^0-9]/g, "");
                                                        updateQty(i.itemId, raw === "" ? 0 : parseInt(raw, 10));
                                                    }}
                                                    className={`flex-1 min-w-0 text-center font-bold bg-slate-50 dark:bg-black/40 border rounded-lg py-1.5 ${exceedsStock ? "border-accent-pink/50 text-accent-pink" : "border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"}`}
                                                />
                                                <button onClick={() => updateQty(i.itemId, i.quantity + 1)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/10">
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {exceedsStock && (
                                                <div className="text-[10px] text-accent-pink mt-1">Exceeds warehouse stock.</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={isPending || items.length === 0 || warehouseId === ""}
                        className="inline-flex items-center gap-2 bg-accent-blue text-white font-bold py-2.5 px-5 rounded-xl shadow-lg shadow-accent-blue/20 hover:bg-accent-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                        {isPending ? "Pushing..." : "Push to bag"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
