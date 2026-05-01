"use client";

import { useMemo, useState, useTransition } from "react";
import {
    Backpack,
    Truck,
    Check,
    Trash2,
    AlertTriangle,
    Clock,
    Loader2,
    Crosshair,
    Search,
    Activity,
    Package,
    ArrowRight,
    ChevronDown,
    Hash
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
    const [selectedDriverId, setSelectedDriverId] = useState<string>("");
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">("");
    const [selectedItems, setSelectedItems] = useState<{ itemId: number; quantity: number }[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
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
            } else {
                toast.error("Push failed", { description: result.error });
            }
        });
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-8 animate-in fade-in zoom-in-95 duration-300 pb-20">
            {/* LEFT — Push Items to Bag (5 cols) */}
            <div className="xl:col-span-5 flex flex-col gap-6">
                <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[2rem] p-6 lg:p-8 flex flex-col relative overflow-hidden group">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-accent-blue/10 border border-accent-blue/30 rounded-2xl text-accent-blue shadow-inner shadow-accent-blue/20">
                            <ArrowRight className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Stock Allocation</h2>
                            <p className="text-slate-600 dark:text-slate-400 text-sm mt-0.5">Assign warehouse inventory to drivers</p>
                        </div>
                    </div>

                    <div className="space-y-6 flex-1">
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
                                    Target Driver
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedDriverId}
                                        onChange={(e) => setSelectedDriverId(e.target.value)}
                                        className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all cursor-pointer"
                                    >
                                        <option value="" disabled>-- Select Driver --</option>
                                        {drivers.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronDown className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
                                    Origin Warehouse
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedWarehouseId}
                                        onChange={(e) => {
                                            setSelectedWarehouseId(Number(e.target.value));
                                            setSelectedItems([]);
                                        }}
                                        className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all cursor-pointer"
                                    >
                                        <option value="" disabled>-- Select Warehouse --</option>
                                        {warehouses.map(w => (
                                            <option key={w.id} value={w.id}>{w.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                        <ChevronDown className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedWarehouseId !== "" && (
                            <div className="pt-2 border-t border-slate-200 dark:border-white/10">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-3">
                                    Inventory Selection
                                </label>
                                <div className="relative group mb-3">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent-blue transition-colors">
                                        <Search className="w-4 h-4" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search by name or SKU..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-accent-blue transition-all"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                    {filteredInventory.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                                            {searchQuery ? "No matching items." : "No stock available."}
                                        </div>
                                    ) : (
                                        filteredInventory.map((inv) => {
                                            const isSelected = !!selectedItems.find((i) => i.itemId === inv.itemId);
                                            return (
                                                <button
                                                    key={inv.id}
                                                    onClick={() => !isSelected && addItem(inv.itemId)}
                                                    disabled={inv.quantity_on_hand <= 0}
                                                    className={`flex items-center justify-between p-3 rounded-xl transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed group/item border ${
                                                        isSelected
                                                            ? "border-accent-blue bg-accent-blue/10 shadow-[0_0_10px_rgba(0,180,255,0.1)]"
                                                            : "border-slate-200 dark:border-white/10 hover:border-accent-blue/40 hover:bg-slate-50 dark:hover:bg-white/5 bg-white dark:bg-black/20"
                                                    }`}
                                                    type="button"
                                                >
                                                    <div className="flex flex-col min-w-0 pr-3">
                                                        <span className={`text-sm font-semibold truncate transition-colors ${isSelected ? "text-accent-blue" : "text-slate-900 dark:text-white group-hover/item:text-accent-blue"}`}>
                                                            {inv.item.name}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-slate-500">{inv.item.sku}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span className={`text-xs px-2 py-1 rounded-md font-bold ${isSelected ? "bg-accent-blue/20 text-accent-blue" : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400"}`}>
                                                            {inv.quantity_on_hand}
                                                        </span>
                                                        {isSelected && <Check className="w-4 h-4 text-accent-blue" />}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Manifest / Cart Section */}
                <AnimatePresence>
                    {selectedItems.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="glass-panel border-accent-blue/30 dark:border-accent-blue/20 rounded-[2rem] p-6 lg:p-8 bg-gradient-to-b from-white to-slate-50 dark:from-neo-bg dark:to-neo-bg/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Truck className="w-4 h-4 text-accent-blue" /> Allocation Manifest
                                </h3>
                                <button
                                    onClick={() => setSelectedItems([])}
                                    className="text-[10px] font-bold text-slate-500 hover:text-accent-pink uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                >
                                    <Trash2 className="w-3 h-3" /> Clear All
                                </button>
                            </div>

                            <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                <AnimatePresence>
                                    {selectedItems.map((item) => {
                                        const invItem = inventory.find((i) => i.itemId === item.itemId);
                                        const stock = inventory.find((i) => i.itemId === item.itemId && i.warehouseId === selectedWarehouseId);
                                        const exceedsStock = stock && item.quantity > stock.quantity_on_hand;
                                        
                                        return (
                                            <motion.div
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                key={item.itemId}
                                                className={`flex items-center justify-between p-3 rounded-xl border bg-white dark:bg-black/40 ${exceedsStock ? 'border-accent-pink/50 bg-accent-pink/5' : 'border-slate-200 dark:border-white/5'}`}
                                            >
                                                <div className="flex flex-col min-w-0 pr-3">
                                                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{invItem?.item.name}</span>
                                                    {stock && <span className="text-[10px] font-mono text-slate-500">Max: {stock.quantity_on_hand}</span>}
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        value={String(item.quantity)}
                                                        onChange={(e) => {
                                                            const raw = e.target.value.replace(/[^0-9]/g, "");
                                                            updateQuantity(item.itemId, raw === "" ? 0 : parseInt(raw, 10));
                                                        }}
                                                        className={`w-16 bg-slate-50 dark:bg-white/5 border rounded-lg text-center px-2 py-1.5 text-sm font-bold focus:outline-none transition-colors ${exceedsStock ? "border-accent-pink text-accent-pink" : "border-slate-200 dark:border-white/10 hover:border-accent-blue focus:border-accent-blue text-slate-900 dark:text-white"}`}
                                                    />
                                                    <button
                                                        onClick={() => removeItem(item.itemId)}
                                                        className="p-1.5 text-slate-400 hover:text-accent-pink hover:bg-accent-pink/10 rounded-md transition-colors"
                                                    >
                                                        <Crosshair className="w-4 h-4 rotate-45" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>

                            <button
                                onClick={handlePush}
                                disabled={!selectedDriverId || !selectedWarehouseId || selectedItems.length === 0 || isPending || selectedItems.some(i => {
                                    const stock = inventory.find(inv => inv.itemId === i.itemId && inv.warehouseId === selectedWarehouseId);
                                    return stock && i.quantity > stock.quantity_on_hand;
                                })}
                                className="w-full relative group/btn disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <div className="relative w-full py-3.5 bg-accent-blue hover:bg-accent-blue/90 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-white shadow-lg shadow-accent-blue/20">
                                    {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Backpack className="w-5 h-5" />}
                                    {isPending ? "Assigning..." : "Push to Driver Bag"}
                                </div>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* RIGHT — Driver Bag Detailed View (7 cols) */}
            <div className="xl:col-span-7 flex flex-col h-full space-y-6">
                {!selectedDriver ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center border-dashed flex-1 min-h-[400px]"
                    >
                        <div className="w-20 h-20 rounded-[2rem] bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-6 border border-slate-200 dark:border-white/10 shadow-inner">
                            <Backpack className="w-10 h-10 text-slate-400 dark:text-slate-500" />
                        </div>
                        <h3 className="text-xl text-slate-900 dark:text-white font-bold mb-2 tracking-tight">Driver Stock Dashboard</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">Select a driver from the left pane to view their current inventory, recent activities, and pending acknowledgments.</p>
                    </motion.div>
                ) : (
                    <DriverDashboard driver={selectedDriver} />
                )}
            </div>
        </div>
    );
}

function DriverDashboard({ driver }: { driver: DriverWithBag }) {
    const [activeTab, setActiveTab] = useState<"STOCK" | "REFILLS" | "PENDING">("STOCK");
    
    const pending = driver.StockAssignments.filter((a) => a.status === "PENDING_ACK");
    const disputed = driver.StockAssignments.filter((a) => a.status === "DISPUTED");
    const issuesCount = pending.length + disputed.length;
    
    const bagTotalQty = driver.DriverStock.reduce((s, r) => s + r.quantity_on_hand, 0);

    return (
        <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[2rem] overflow-hidden flex flex-col h-full shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none bg-white/50 dark:bg-neo-bg/50 backdrop-blur-xl">
            {/* Header Profile */}
            <div className="p-6 md:p-8 border-b border-slate-200 dark:border-white/5 bg-gradient-to-r from-slate-50 to-white dark:from-white/[0.02] dark:to-transparent">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue text-xl font-black uppercase shadow-inner">
                            {driver.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{driver.name}</h3>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-white/10">{driver.phone || "No Phone"}</span>
                                {driver.isActive ? (
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-accent-green flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-accent-green" /> Active</span>
                                ) : (
                                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Inactive</span>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-right hidden sm:block">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-1">Total Stock Items</div>
                        <div className="text-3xl font-black text-accent-blue tracking-tighter">{bagTotalQty.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 px-6 md:px-8 pt-4 border-b border-slate-200 dark:border-white/5 overflow-x-auto custom-scrollbar">
                <TabButton 
                    active={activeTab === "STOCK"} 
                    onClick={() => setActiveTab("STOCK")} 
                    icon={<Package className="w-4 h-4" />} 
                    label="Current Stock" 
                    count={driver.DriverStock.length}
                />
                <TabButton 
                    active={activeTab === "REFILLS"} 
                    onClick={() => setActiveTab("REFILLS")} 
                    icon={<Activity className="w-4 h-4" />} 
                    label="Recent Refills" 
                    count={driver.RefillLogs.length}
                />
                <TabButton 
                    active={activeTab === "PENDING"} 
                    onClick={() => setActiveTab("PENDING")} 
                    icon={<AlertTriangle className="w-4 h-4" />} 
                    label="Pending / Disputed" 
                    count={issuesCount}
                    alert={issuesCount > 0}
                />
            </div>

            {/* Content Area */}
            <div className="flex-1 p-6 md:p-8 bg-slate-50/50 dark:bg-black/20 overflow-y-auto">
                <AnimatePresence mode="wait">
                    {activeTab === "STOCK" && (
                        <motion.div key="stock" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {driver.DriverStock.length === 0 ? (
                                <EmptyState icon={<Package className="w-8 h-8" />} title="Bag is Empty" message="Assign items from the warehouse to begin operations." />
                            ) : (
                                <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-neo-bg">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/10 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                                <th className="py-4 px-5">Item Details</th>
                                                <th className="py-4 px-5 text-right">Qty in Bag</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                            {driver.DriverStock.map((row) => (
                                                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                                                    <td className="py-3 px-5">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-400 group-hover:text-accent-blue group-hover:border-accent-blue/30 transition-colors">
                                                                <Hash className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-bold text-slate-900 dark:text-white">{row.item.name}</div>
                                                                <div className="text-[10px] font-mono text-slate-500 mt-0.5">SKU: {row.item.sku}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-5 text-right">
                                                        <span className="inline-flex items-center justify-center px-3 py-1 bg-accent-blue/10 border border-accent-blue/20 text-accent-blue rounded-lg text-sm font-black min-w-[3rem]">
                                                            {row.quantity_on_hand}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "REFILLS" && (
                        <motion.div key="refills" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {driver.RefillLogs.length === 0 ? (
                                <EmptyState icon={<Activity className="w-8 h-8" />} title="No Refill History" message="Driver hasn't made any recent machine refills." />
                            ) : (
                                <div className="space-y-3">
                                    {driver.RefillLogs.map((log) => (
                                        <div key={log.id} className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-neo-bg border border-slate-200 dark:border-white/10 shadow-sm">
                                            <div className="flex flex-col min-w-0 pr-4">
                                                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{log.item.name}</span>
                                                <span className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate">
                                                    <span className="font-medium text-slate-700 dark:text-slate-300">{log.machine.location_name}</span>
                                                    <span className="mx-1 opacity-50">•</span>
                                                    {formatSaudiDate(log.refilled_at)} {formatSaudiTime(log.refilled_at, { hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-lg font-black text-accent-green">+{log.quantity_refilled}</span>
                                                <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Refilled</div>
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
                                <div className="space-y-6">
                                    {disputed.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] uppercase font-bold tracking-widest text-accent-pink mb-3 flex items-center gap-2">
                                                <AlertTriangle className="w-3 h-3" /> Disputed Assignments
                                            </h4>
                                            <div className="space-y-3">
                                                {disputed.map(a => <AssignmentCard key={a.id} assignment={a} isDisputed={true} />)}
                                            </div>
                                        </div>
                                    )}
                                    {pending.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] uppercase font-bold tracking-widest text-amber-500 mb-3 flex items-center gap-2">
                                                <Clock className="w-3 h-3" /> Awaiting Acknowledgment
                                            </h4>
                                            <div className="space-y-3">
                                                {pending.map(a => <AssignmentCard key={a.id} assignment={a} isDisputed={false} />)}
                                            </div>
                                        </div>
                                    )}
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
            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold text-sm transition-all whitespace-nowrap ${
                active 
                    ? alert ? "border-accent-pink text-accent-pink" : "border-accent-blue text-accent-blue bg-accent-blue/5" 
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            }`}
        >
            {icon}
            {label}
            <span className={`px-2 py-0.5 rounded-md text-[10px] ${active ? alert ? "bg-accent-pink/20 text-accent-pink" : "bg-accent-blue/20 text-accent-blue" : "bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400"}`}>
                {count}
            </span>
        </button>
    );
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-center p-8 py-16">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4 text-slate-400 border border-slate-200 dark:border-white/10">
                {icon}
            </div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">{title}</h4>
            <p className="text-sm text-slate-500 max-w-xs">{message}</p>
        </div>
    );
}

function AssignmentCard({ assignment, isDisputed }: { assignment: StockAssignmentLite; isDisputed: boolean }) {
    return (
        <div className={`p-4 rounded-2xl border ${isDisputed ? 'bg-accent-pink/5 border-accent-pink/20' : 'bg-white dark:bg-neo-bg border-slate-200 dark:border-white/10 shadow-sm'}`}>
            <div className="flex items-start justify-between">
                <div>
                    <h5 className="font-bold text-sm text-slate-900 dark:text-white mb-1">{assignment.item.name}</h5>
                    <div className="text-[10px] font-mono text-slate-500">
                        Assigned: {formatSaudiDate(assignment.assigned_at)} {formatSaudiTime(assignment.assigned_at, { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {isDisputed && assignment.acknowledged_qty !== null && (
                        <div className="mt-2 text-xs text-accent-pink font-medium flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Driver claims received {assignment.acknowledged_qty}
                        </div>
                    )}
                    {assignment.notes && (
                        <div className="mt-2 text-xs italic text-slate-600 dark:text-slate-400 border-l-2 border-slate-300 dark:border-slate-600 pl-2">
                            "{assignment.notes}"
                        </div>
                    )}
                </div>
                <div className="text-right">
                    <div className="text-xl font-black text-slate-900 dark:text-white">{assignment.quantity}</div>
                    <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400">Total Pushed</div>
                </div>
            </div>
        </div>
    );
}
