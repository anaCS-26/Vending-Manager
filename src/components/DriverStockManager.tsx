"use client";

import { useMemo, useState, useTransition } from "react";
import {
    Backpack,
    Truck,
    PackageOpen,
    Check,
    Trash2,
    AlertTriangle,
    Clock,
    Loader2,
    ChevronDown,
    Crosshair,
    Search,
    Activity,
    Package,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { assignToDriver } from "@/actions/driver-stock";
import { formatSaudiDate, formatSaudiTime } from "@/lib/utils";
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
};

export function DriverStockManager({ drivers, inventory, warehouses }: Props) {
    const [selectedDriverId, setSelectedDriverId] = useState<string>(drivers[0]?.id.toString() ?? "");
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">("");
    const [selectedItems, setSelectedItems] = useState<{ itemId: number; quantity: number }[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [bulkQty, setBulkQty] = useState<string>("");
    const [isPending, startTransition] = useTransition();

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
                (q === "" || inv.item.name.toLowerCase().includes(q) || inv.item.sku.toLowerCase().includes(q))
        );
    }, [inventory, selectedWarehouseId, searchQuery]);

    const addItem = (itemId: number) => {
        if (!selectedItems.find((i) => i.itemId === itemId)) {
            setSelectedItems([...selectedItems, { itemId, quantity: 10 }]);
        }
    };

    const updateQuantity = (itemId: number, qty: number) => {
        setSelectedItems(selectedItems.map((i) => (i.itemId === itemId ? { ...i, quantity: qty } : i)));
    };

    const removeItem = (itemId: number) => setSelectedItems(selectedItems.filter((i) => i.itemId !== itemId));

    const handlePush = () => {
        if (!selectedDriverId || !selectedWarehouseId || selectedItems.length === 0) return;
        const driverId = parseInt(selectedDriverId);
        const lineItems = selectedItems.filter((i) => i.quantity > 0);
        if (lineItems.length === 0) {
            toast.error("Add at least one item with quantity > 0.");
            return;
        }
        startTransition(async () => {
            const result = await assignToDriver(driverId, selectedWarehouseId, lineItems);
            if (result.success) {
                toast.success("Pushed to driver bag", {
                    description: `${lineItems.length} line(s) added. Driver will see an acknowledgment notice on next sync.`,
                });
                setSelectedItems([]);
                setBulkQty("");
            } else {
                toast.error("Push failed", { description: result.error });
            }
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-300">
            {/* LEFT — push items to bag */}
            <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[2rem] p-8 flex flex-col relative overflow-hidden group">
                <div className="flex items-center gap-4 mb-8 relative z-10">
                    <div className="p-3 bg-accent-blue/10 border border-accent-blue/30 rounded-2xl text-accent-blue">
                        <Backpack className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Push to Driver Bag</h2>
                        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Assign inventory directly to a driver.</p>
                    </div>
                </div>

                <div className="space-y-6 flex-1 relative z-10">
                    <div className="relative z-[100]">
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                            Select Driver & Origin Warehouse
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DriverDropdown
                                drivers={drivers}
                                selected={selectedDriverId}
                                onChange={setSelectedDriverId}
                            />
                            <WarehouseDropdown
                                warehouses={warehouses}
                                selected={selectedWarehouseId}
                                onChange={(id) => {
                                    setSelectedWarehouseId(id);
                                    setSelectedItems([]);
                                }}
                            />
                        </div>
                    </div>



                    <div className="flex flex-col gap-3">
                        <label className="block text-sm font-medium text-slate-500 dark:text-slate-400">
                            Available Inventory{" "}
                            {selectedWarehouseId !== "" && `- ${warehouses.find((w) => w.id === selectedWarehouseId)?.name}`}
                        </label>

                        {selectedWarehouseId !== "" && (
                            <div className="relative group">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent-blue transition-colors">
                                    <Search className="w-4 h-4" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search items by name or SKU..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-accent-blue transition-all"
                                />
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedWarehouseId === "" ? (
                            <div className="col-span-2 p-4 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                                Please select an origin warehouse first.
                            </div>
                        ) : filteredInventory.length === 0 ? (
                            <div className="col-span-2 p-4 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                                {searchQuery ? "No items match your search." : "No stock available in this warehouse."}
                            </div>
                        ) : (
                            filteredInventory.map((inv) => {
                                const isSelected = !!selectedItems.find((i) => i.itemId === inv.itemId);
                                return (
                                    <button
                                        key={inv.id}
                                        onClick={() => !isSelected && addItem(inv.itemId)}
                                        disabled={inv.quantity_on_hand <= 0}
                                        className={`flex flex-col items-start p-4 border rounded-xl transition-all text-left disabled:opacity-30 disabled:bg-transparent group/item relative overflow-hidden ${
                                            isSelected
                                                ? "border-accent-blue bg-accent-blue/10 shadow-[0_0_15px_rgba(0,180,255,0.15)] scale-[0.98]"
                                                : "border-slate-200 dark:border-white/10 hover:border-accent-blue/50 hover:bg-accent-blue/5"
                                        }`}
                                        type="button"
                                    >
                                        {isSelected && (
                                            <div className="absolute top-2 right-2">
                                                <Check className="w-4 h-4 text-accent-blue" />
                                            </div>
                                        )}
                                        <span
                                            className={`text-sm font-semibold mb-2 transition-colors ${
                                                isSelected ? "text-accent-blue" : "text-slate-900 dark:text-white group-hover/item:text-accent-blue"
                                            }`}
                                        >
                                            {inv.item.name}
                                        </span>
                                        <span
                                            className={`text-xs px-2.5 py-1 rounded border ${
                                                isSelected
                                                    ? "bg-accent-blue/20 border-accent-blue/30 text-accent-blue"
                                                    : "bg-white/10 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400"
                                            }`}
                                        >
                                            {inv.quantity_on_hand} available
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-5 border border-slate-200 dark:border-white/10 mt-2 min-h-[140px] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Push Manifest</h3>
                                <span className="text-[10px] uppercase font-bold tracking-wider text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded-full border border-accent-blue/20">
                                    {selectedItems.length} Items Selected
                                </span>
                            </div>
                            {selectedItems.length > 0 && (
                                <button
                                    onClick={() => setSelectedItems([])}
                                    className="text-[10px] font-bold text-slate-400 hover:text-accent-pink uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                >
                                    <Trash2 className="w-3 h-3" /> Clear All
                                </button>
                            )}
                        </div>

                        {selectedItems.length > 0 && (
                            <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 mb-4">
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Bulk Set Qty:</div>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    autoComplete="off"
                                    placeholder="Set all..."
                                    value={bulkQty}
                                    onChange={(e) => {
                                        const raw = e.target.value.replace(/[^0-9]/g, "");
                                        setBulkQty(raw);
                                        const q = raw === "" ? 0 : parseInt(raw, 10);
                                        if (q > 0) setSelectedItems((prev) => prev.map((i) => ({ ...i, quantity: q })));
                                    }}
                                    className="flex-1 bg-transparent border-none outline-none text-xs text-accent-blue font-bold placeholder:text-slate-600"
                                />
                            </div>
                        )}

                        {selectedItems.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl bg-white/[0.02]">
                                <motion.div
                                    animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0.8, 0.5] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    <PackageOpen className="w-8 h-8 text-slate-500 dark:text-slate-400 mb-3 opacity-50" />
                                </motion.div>
                                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">No items added.</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Tap items above to build the manifest.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <AnimatePresence>
                                    {selectedItems.map((item) => {
                                        const invItem = inventory.find((i) => i.itemId === item.itemId);
                                        const stock = inventory.find(
                                            (i) => i.itemId === item.itemId && i.warehouseId === selectedWarehouseId
                                        );
                                        const exceedsStock = stock && item.quantity > stock.quantity_on_hand;
                                        return (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                key={item.itemId}
                                                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-white/5 bg-white dark:bg-black/20"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{invItem?.item.name}</div>
                                                    {stock && (
                                                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{stock.quantity_on_hand} on hand</div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        autoComplete="off"
                                                        value={String(item.quantity)}
                                                        onChange={(e) => {
                                                            const raw = e.target.value.replace(/[^0-9]/g, "");
                                                            updateQuantity(item.itemId, raw === "" ? 0 : parseInt(raw, 10));
                                                        }}
                                                        className={`w-20 bg-slate-50 dark:bg-white/5 border rounded text-center px-2 py-1.5 text-sm font-semibold focus:outline-none transition-colors ${
                                                            exceedsStock
                                                                ? "border-accent-pink/50 text-accent-pink"
                                                                : "border-slate-200 dark:border-white/10 hover:border-accent-blue focus:border-accent-blue text-slate-900 dark:text-white"
                                                        }`}
                                                    />
                                                    <button
                                                        onClick={() => removeItem(item.itemId)}
                                                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-accent-pink hover:bg-accent-pink/10 rounded-md transition-colors"
                                                    >
                                                        <Crosshair className="w-4 h-4 rotate-45" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={handlePush}
                    disabled={!selectedDriverId || !selectedWarehouseId || selectedItems.length === 0 || isPending}
                    className="mt-8 relative w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <div className="relative w-full py-4 bg-accent-blue hover:bg-accent-blue/90 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors text-white">
                        {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
                        {isPending ? "Pushing..." : "Push to Bag"}
                    </div>
                </button>
            </div>

            {/* RIGHT — driver bag detail */}
            <div className="space-y-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                    <Backpack className="w-5 h-5" />
                    Driver Bag
                </h2>

                {!selectedDriver ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center border-dashed"
                    >
                        <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4 border border-slate-200 dark:border-white/10">
                            <Backpack className="w-8 h-8 text-slate-500 dark:text-slate-400 opacity-50" />
                        </div>
                        <h3 className="text-slate-900 dark:text-white font-bold mb-1">No Driver Selected</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">Pick a driver from the left to see their bag.</p>
                    </motion.div>
                ) : (
                    <DriverBagDetail driver={selectedDriver} />
                )}
            </div>
        </div>
    );
}

function DriverBagDetail({ driver }: { driver: DriverWithBag }) {
    const pending = driver.StockAssignments.filter((a) => a.status === "PENDING_ACK");
    const disputed = driver.StockAssignments.filter((a) => a.status === "DISPUTED");
    const bagTotal = driver.DriverStock.reduce((s, r) => s + r.quantity_on_hand, 0);
    const refilledTotal = driver.RefillLogs.reduce((s, r) => s + r.quantity_refilled, 0);

    return (
        <div className="space-y-4">
            {/* Driver header card */}
            <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[1.5rem] p-6">
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{driver.name}</h3>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{driver.phone || "No phone on file"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {pending.length > 0 && (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                {pending.length} ack
                            </span>
                        )}
                        {disputed.length > 0 && (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-accent-pink/15 text-accent-pink border border-accent-pink/20">
                                {disputed.length} disp
                            </span>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <Stat label="In bag" value={bagTotal} subLabel={`${driver.DriverStock.length} item${driver.DriverStock.length === 1 ? "" : "s"}`} tone="blue" />
                    <Stat label="Refilled (recent)" value={refilledTotal} subLabel={`${driver.RefillLogs.length} log${driver.RefillLogs.length === 1 ? "" : "s"}`} tone="green" />
                    <Stat label="Pending acks" value={pending.length} subLabel={pending.length === 0 ? "all clear" : "needs review"} tone={pending.length > 0 ? "amber" : "neutral"} />
                </div>
            </div>

            {/* Current bag */}
            <Section title="Current Bag" icon={<Package className="w-4 h-4" />}>
                {driver.DriverStock.length === 0 ? (
                    <Empty>Bag is empty.</Empty>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        {driver.DriverStock.map((row) => (
                            <div
                                key={row.id}
                                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{row.item.name}</div>
                                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">SKU {row.item.sku}</div>
                                </div>
                                <div className="text-xl font-black text-accent-blue tracking-tighter">{row.quantity_on_hand}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* Pending acks */}
            {pending.length > 0 && (
                <Section title="Awaiting acknowledgment" icon={<Clock className="w-4 h-4" />} tone="amber">
                    {pending.map((a) => (
                        <AssignmentRow key={a.id} assignment={a} />
                    ))}
                </Section>
            )}

            {/* Disputes */}
            {disputed.length > 0 && (
                <Section title="Disputed (driver reported short)" icon={<AlertTriangle className="w-4 h-4" />} tone="pink">
                    {disputed.map((a) => (
                        <AssignmentRow key={a.id} assignment={a} />
                    ))}
                </Section>
            )}

            {/* Recent refills */}
            <Section title="Recent Refills" icon={<Activity className="w-4 h-4" />}>
                {driver.RefillLogs.length === 0 ? (
                    <Empty>No recent refill activity.</Empty>
                ) : (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                        {driver.RefillLogs.map((log) => (
                            <div
                                key={log.id}
                                className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{log.item.name}</div>
                                    <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                        {log.machine.location_name} · {formatSaudiDate(log.refilled_at)} {formatSaudiTime(log.refilled_at, { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-sm font-bold text-accent-green">+{log.quantity_refilled}</span>
                                    <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400">refilled</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}

function Section({
    title,
    icon,
    tone,
    children,
}: {
    title: string;
    icon: React.ReactNode;
    tone?: "amber" | "pink";
    children: React.ReactNode;
}) {
    const toneClasses =
        tone === "amber"
            ? "bg-amber-500/5 border-amber-500/20"
            : tone === "pink"
            ? "bg-accent-pink/5 border-accent-pink/20"
            : "glass-panel border-slate-200 dark:border-white/10";
    const titleTone =
        tone === "amber" ? "text-amber-600 dark:text-amber-400" : tone === "pink" ? "text-accent-pink" : "text-slate-600 dark:text-slate-300";
    return (
        <div className={`rounded-[1.5rem] border p-5 ${toneClasses}`}>
            <h4 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mb-3 ${titleTone}`}>
                {icon} {title}
            </h4>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function AssignmentRow({ assignment }: { assignment: StockAssignmentLite }) {
    return (
        <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/5">
            <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{assignment.item.name}</div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Pushed {formatSaudiTime(assignment.assigned_at, { hour: "2-digit", minute: "2-digit" })}
                    {assignment.status === "DISPUTED" && assignment.acknowledged_qty !== null && (
                        <>
                            {" "}
                            · driver received <span className="font-bold text-accent-pink">{assignment.acknowledged_qty}</span> of {assignment.quantity}
                        </>
                    )}
                </div>
                {assignment.notes && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">"{assignment.notes}"</div>
                )}
            </div>
            <div className="text-right shrink-0 ml-3">
                <div className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">{assignment.quantity}</div>
                <div className="text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400">pushed</div>
            </div>
        </div>
    );
}

function Stat({
    label,
    value,
    subLabel,
    tone,
}: {
    label: string;
    value: number | string;
    subLabel?: string;
    tone: "blue" | "green" | "amber" | "neutral";
}) {
    const colorClass = {
        blue: "text-accent-blue",
        green: "text-accent-green",
        amber: "text-amber-500",
        neutral: "text-slate-700 dark:text-slate-300",
    }[tone];
    return (
        <div className="bg-slate-50 dark:bg-black/30 rounded-xl p-3 border border-slate-200 dark:border-white/5 text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">{label}</div>
            <div className={`text-2xl font-black tracking-tighter ${colorClass}`}>{value}</div>
            {subLabel && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{subLabel}</div>}
        </div>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-xs text-slate-500 dark:text-slate-400 italic p-3 text-center">{children}</div>
    );
}

// --- Local dropdowns (kept inline so we don't have to export the dispatch
// page's private DriverSelect/WarehouseSelect; same visual language). ---

function DriverDropdown({
    drivers,
    selected,
    onChange,
}: {
    drivers: DriverWithBag[];
    selected: string;
    onChange: (val: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedDriver = drivers.find((d) => d.id.toString() === selected);

    return (
        <div className="relative z-[100] text-left">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-slate-100 dark:bg-white/5 border ${
                    isOpen
                        ? "border-accent-blue shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                } rounded-xl px-4 py-3 flex items-center justify-between text-slate-900 dark:text-white focus:outline-none transition-all font-medium gap-3`}
            >
                <span className={`truncate flex-1 text-left ${selectedDriver ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                    {selectedDriver ? selectedDriver.name : "-- Choose Driver --"}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-500 dark:text-slate-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180 text-accent-blue" : ""}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-black/80 z-[99999]"
                    >
                        <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                            {drivers.map((d) => (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(d.id.toString());
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-5 py-3 hover:bg-accent-blue/10 transition-colors ${
                                        selected === d.id.toString() ? "text-accent-blue bg-accent-blue/5" : "text-slate-900 dark:text-white"
                                    }`}
                                >
                                    {d.name}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function WarehouseDropdown({
    warehouses,
    selected,
    onChange,
}: {
    warehouses: WarehouseType[];
    selected: number | "";
    onChange: (val: number | "") => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedWarehouse = warehouses.find((w) => w.id === selected);

    return (
        <div className="relative z-[90] text-left">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-slate-100 dark:bg-white/5 border ${
                    isOpen
                        ? "border-accent-blue shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                } rounded-xl px-4 py-3 flex items-center justify-between text-slate-900 dark:text-white focus:outline-none transition-all font-medium gap-3`}
            >
                <span className={`truncate flex-1 text-left ${selectedWarehouse ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                    {selectedWarehouse ? selectedWarehouse.name : "-- Choose Origin Warehouse --"}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-500 dark:text-slate-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180 text-accent-blue" : ""}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-black/80 z-[99999]"
                    >
                        <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
                            <button
                                type="button"
                                onClick={() => {
                                    onChange("");
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-5 py-3 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-slate-500 dark:text-slate-400 text-sm italic"
                            >
                                -- Clear Selection --
                            </button>
                            {warehouses.map((w) => (
                                <button
                                    key={w.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(w.id);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-5 py-3 hover:bg-accent-blue/10 transition-colors ${
                                        selected === w.id ? "text-accent-blue bg-accent-blue/5" : "text-slate-900 dark:text-white"
                                    }`}
                                >
                                    {w.name}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
