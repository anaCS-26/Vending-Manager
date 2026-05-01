"use client";

import { useMemo, useState, useTransition } from "react";
import {
    Backpack,
    AlertTriangle,
    Clock,
    Loader2,
    Search,
    Activity,
    Package,
    ChevronDown,
    Plus,
    Minus,
    Check
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
    const [searchQuery, setSearchQuery] = useState("");
    const [quantities, setQuantities] = useState<Record<number, number>>({});
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8 animate-in fade-in zoom-in-95 duration-300 pb-20">
            {/* LEFT — Push Items to Bag */}
            <div className="flex flex-col gap-6 h-full">
                <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[2rem] flex flex-col relative overflow-hidden h-full">
                    <div className="p-6 lg:p-8 border-b border-slate-200 dark:border-white/10 bg-gradient-to-r from-slate-50 to-white dark:from-white/[0.02] dark:to-transparent">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight mb-6">Stock Allocation</h2>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
                                    Target Driver
                                </label>
                                <div className="relative">
                                    <select
                                        value={selectedDriverId}
                                        onChange={(e) => setSelectedDriverId(e.target.value)}
                                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all cursor-pointer shadow-sm"
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
                                            setQuantities({});
                                        }}
                                        className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all cursor-pointer shadow-sm"
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
                    </div>

                    <div className="flex-1 flex flex-col p-6 lg:p-8 bg-slate-50/50 dark:bg-transparent">
                        {selectedWarehouseId !== "" ? (
                            <>
                                <div className="relative group mb-4 shrink-0">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent-blue transition-colors">
                                        <Search className="w-4 h-4" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search inventory..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-accent-blue shadow-sm transition-all"
                                    />
                                </div>

                                <div className="h-[400px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                    {filteredInventory.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                                            {searchQuery ? "No matching items." : "No available stock in this warehouse."}
                                        </div>
                                    ) : (
                                        filteredInventory.map((inv) => {
                                            const qty = quantities[inv.itemId] || 0;
                                            const isSelected = qty > 0;
                                            return (
                                                <div
                                                    key={inv.id}
                                                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                                                        isSelected
                                                            ? "border-accent-blue bg-accent-blue/5 shadow-[0_0_10px_rgba(0,180,255,0.05)]"
                                                            : "border-slate-200 dark:border-white/10 bg-white dark:bg-black/20 hover:border-slate-300 dark:hover:border-white/20"
                                                    }`}
                                                >
                                                    <div className="flex flex-col min-w-0 pr-4">
                                                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{inv.item.name}</span>
                                                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                                                            {inv.item.sku}
                                                            <span className="text-slate-300 dark:text-slate-600">|</span>
                                                            Max: {inv.quantity_on_hand}
                                                        </span>
                                                    </div>
                                                    
                                                    {/* Inline Quantity Controls */}
                                                    <div className="flex items-center bg-slate-100 dark:bg-black/40 rounded-lg p-1 border border-slate-200 dark:border-white/5 shrink-0">
                                                        <button 
                                                            onClick={() => handleQtyChange(inv.itemId, String(qty - 1), inv.quantity_on_hand)}
                                                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 rounded-md transition-all"
                                                        >
                                                            <Minus className="w-3 h-3" />
                                                        </button>
                                                        <input 
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={qty || ""}
                                                            placeholder="0"
                                                            onChange={(e) => handleQtyChange(inv.itemId, e.target.value, inv.quantity_on_hand)}
                                                            className="w-10 bg-transparent text-center text-sm font-black text-slate-900 dark:text-white focus:outline-none"
                                                        />
                                                        <button 
                                                            onClick={() => handleQtyChange(inv.itemId, String(qty + 1), inv.quantity_on_hand)}
                                                            disabled={qty >= inv.quantity_on_hand}
                                                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                        >
                                                            <Plus className="w-3 h-3" />
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
                                <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
                                <p className="text-slate-500 dark:text-slate-400 text-sm">Select an origin warehouse to view and allocate inventory.</p>
                            </div>
                        )}
                    </div>

                    {/* Push Bar */}
                    <div className="p-4 lg:p-6 border-t border-slate-200 dark:border-white/10 bg-white/80 dark:bg-neo-bg/80 backdrop-blur-xl">
                        <button
                            onClick={handlePush}
                            disabled={!selectedDriverId || !selectedWarehouseId || !hasSelectedItems || isPending}
                            className="w-full relative py-3.5 bg-accent-blue hover:bg-accent-blue/90 disabled:bg-slate-300 dark:disabled:bg-slate-800 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-white shadow-lg disabled:shadow-none shadow-accent-blue/20 disabled:cursor-not-allowed"
                        >
                            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Backpack className="w-5 h-5" />}
                            {isPending ? "Assigning..." : hasSelectedItems ? `Push ${Object.keys(quantities).length} Items to Bag` : "Select Items to Push"}
                        </button>
                    </div>
                </div>
            </div>

            {/* RIGHT — Driver Bag Detailed View */}
            <div className="flex flex-col h-full space-y-6">
                {!selectedDriver ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center border-dashed h-full"
                    >
                        <div className="w-20 h-20 rounded-[2rem] bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-6 border border-slate-200 dark:border-white/10 shadow-inner">
                            <Backpack className="w-10 h-10 text-slate-400 dark:text-slate-500" />
                        </div>
                        <h3 className="text-xl text-slate-900 dark:text-white font-bold mb-2 tracking-tight">Driver Stock Dashboard</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">Select a driver from the left pane to view their current inventory alongside the allocation menu.</p>
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
                        <div className="w-14 h-14 shrink-0 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue text-xl font-black uppercase shadow-inner">
                            {driver.name.charAt(0)}
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{driver.name}</h3>
                            <div className="mt-1 text-sm font-mono text-slate-500">
                                {driver.phone || "No Phone"}
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-right hidden sm:block shrink-0">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400 mb-1">Total Items</div>
                        <div className="text-3xl font-black text-accent-blue tracking-tighter">{bagTotalQty.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-1 px-4 md:px-6 pt-4 border-b border-slate-200 dark:border-white/5">
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
            <div className="flex-1 p-6 md:p-8 bg-slate-50/50 dark:bg-black/20 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                    {activeTab === "STOCK" && (
                        <motion.div key="stock" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {driver.DriverStock.length === 0 ? (
                                <EmptyState icon={<Package className="w-8 h-8" />} title="Bag is Empty" message="Assign items from the warehouse to begin operations." />
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4">
                                    {driver.DriverStock.map((row) => (
                                        <div key={row.id} className="p-4 rounded-2xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex flex-col justify-between hover:border-accent-blue/30 transition-colors shadow-sm">
                                            <div>
                                                <div className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight">{row.item.name}</div>
                                                <div className="text-[10px] font-mono text-slate-500 mt-1.5">{row.item.sku}</div>
                                            </div>
                                            <div className="mt-5 flex items-end justify-between border-t border-slate-100 dark:border-white/5 pt-3">
                                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">In Bag</div>
                                                <div className="text-2xl font-black text-accent-blue leading-none">{row.quantity_on_hand}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "REFILLS" && (
                        <motion.div key="refills" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            {driver.RefillLogs.length === 0 ? (
                                <EmptyState icon={<Activity className="w-8 h-8" />} title="No Refill History" message="Driver hasn't made any recent machine refills." />
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
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
                                            <div className="grid grid-cols-1 gap-3">
                                                {disputed.map(a => <AssignmentCard key={a.id} assignment={a} isDisputed={true} />)}
                                            </div>
                                        </div>
                                    )}
                                    {pending.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] uppercase font-bold tracking-widest text-amber-500 mb-3 flex items-center gap-2">
                                                <Clock className="w-3 h-3" /> Awaiting Acknowledgment
                                            </h4>
                                            <div className="grid grid-cols-1 gap-3">
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
            className={`flex items-center gap-2 px-3 sm:px-4 py-3 border-b-2 font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${
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
            <div className="w-16 h-16 rounded-[2rem] bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-5 text-slate-400 border border-slate-200 dark:border-white/10 shadow-inner">
                {icon}
            </div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight">{title}</h4>
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
                        <div className="mt-2 text-xs text-accent-pink font-medium flex items-center gap-1.5 bg-accent-pink/10 px-2 py-1 rounded-md inline-flex">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Driver claims received {assignment.acknowledged_qty}
                        </div>
                    )}
                    {assignment.notes && (
                        <div className="mt-2 text-xs italic text-slate-600 dark:text-slate-400 border-l-2 border-slate-300 dark:border-slate-600 pl-2 py-0.5">
                            "{assignment.notes}"
                        </div>
                    )}
                </div>
                <div className="text-right">
                    <div className="text-xl font-black text-slate-900 dark:text-white">{assignment.quantity}</div>
                    <div className="text-[9px] uppercase font-bold tracking-widest text-slate-400 mt-1">Pushed Qty</div>
                </div>
            </div>
        </div>
    );
}
