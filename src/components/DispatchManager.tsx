"use client";
import { useState, useTransition } from "react";
import { Truck, PackageOpen, Check, AlertTriangle, Crosshair, Navigation, ChevronDown, Loader2, History, ChevronRight, Trash2 } from "lucide-react";
import { dispatchToDriver, returnDispatch, getRecentDispatchForDriver } from "@/actions/inventory";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { DriverType, WarehouseWithItem, DispatchWithRelations, DispatchItemWithItem, RefillLogWithMachine, WarehouseType } from "@/types";
import { formatID, formatSaudiTime } from "@/lib/utils";
import { DriverBagManager } from "./DriverBagManager";

type DispatchManagerProps = {
    drivers: DriverType[];
    inventory: WarehouseWithItem[];
    activeDispatches: DispatchWithRelations[];
    warehouses: WarehouseType[];
};

export function DispatchManager({ drivers, inventory, activeDispatches, warehouses }: DispatchManagerProps) {
    const [selectedDriver, setSelectedDriver] = useState<string>("");
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">("");
    const [selectedItems, setSelectedItems] = useState<{ itemId: number, quantity: number }[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPending, startTransition] = useTransition();
    const [isCopying, setIsCopying] = useState(false);
    const [bulkQty, setBulkQty] = useState<string>("");
    const [activeTab, setActiveTab] = useState<"dispatch" | "bags">("dispatch");

    const handleDispatch = async () => {
        // Dispatches inventory from Warehouse -> Driver bag.
        if (!selectedDriver || !selectedWarehouseId || selectedItems.length === 0) return;
        startTransition(async () => {
            const result = await dispatchToDriver(parseInt(selectedDriver), selectedWarehouseId, selectedItems);
            if (result.success) {
                toast.success("Dispatch created successfully", {
                    description: `Assigned ${selectedItems.length} item(s) to route.`,
                });
                setSelectedDriver("");
                setSelectedItems([]);
                setBulkQty("");
            } else {
                toast.error("Dispatch failed", {
                    description: result.error,
                });
            }
        });
    };

    const handleCopyRecent = async () => {
        // Fetches previous manifest and validates against current WH stock
        if (!selectedDriver) {
            toast.error("Please select a driver first");
            return;
        }
        
        setIsCopying(true);
        try {
            const result = await getRecentDispatchForDriver(parseInt(selectedDriver));
            if (result.success && result.data) {
                const latestItems = result.data.DispatchItems.map((di: any) => ({
                    itemId: di.itemId,
                    quantity: di.quantity_given
                }));
                
                // If a warehouse is selected, filter items strictly by what's available there
                if (selectedWarehouseId) {
                    const warehouseItems = inventory.filter(inv => inv.warehouseId === selectedWarehouseId);
                    const validItems = latestItems.filter((li: any) => 
                        warehouseItems.some(wi => wi.itemId === li.itemId && wi.quantity_on_hand > 0)
                    );
                    
                    if (validItems.length < latestItems.length) {
                        toast.warning(`${latestItems.length - validItems.length} items from the previous dispatch were skipped because they are out of stock in this warehouse.`);
                    }
                    
                    if (validItems.length === 0) {
                        toast.error("None of the items from the previous dispatch are available in the current warehouse.");
                    } else {
                        setSelectedItems(validItems);
                        toast.success("Manifest copied from history");
                    }
                } else {
                    // If no warehouse selected, just set them all (validation will happen when warehouse is selected)
                    setSelectedItems(latestItems);
                    toast.success("Manifest items loaded from history");
                }
            } else {
                toast.error(result.success === false ? result.error : "No recent dispatches found for this driver");
            }
        } catch (err) {
            toast.error("Failed to load history");
        } finally {
            setIsCopying(false);
        }
    };

    const addItemToDispatch = (itemId: number) => {
        if (!selectedItems.find(i => i.itemId === itemId)) {
            setSelectedItems([...selectedItems, { itemId, quantity: 10 }]);
        }
    };

    const updateQuantity = (itemId: number, qty: number) => {
        setSelectedItems(selectedItems.map(i => i.itemId === itemId ? { ...i, quantity: qty } : i));
    };

    return (
        <div className="space-y-6">
            <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab("dispatch")}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "dispatch" ? "bg-white dark:bg-[#18181b] text-accent-blue shadow-sm" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}
                >
                    Route Planning & Operations
                </button>
                <button
                    onClick={() => setActiveTab("bags")}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "bags" ? "bg-white dark:bg-[#18181b] text-accent-blue shadow-sm" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}
                >
                    Driver Bags Manager
                </button>
            </div>

            {activeTab === "dispatch" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-300">
                    {/* Create New Dispatch */}
                    <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[2rem] p-8 flex flex-col relative overflow-hidden group">
                        <div className="flex items-center gap-4 mb-8 relative z-10">
                            <div className="p-3 bg-accent-blue/10 border border-accent-blue/30 rounded-2xl text-accent-blue">
                                <Truck className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">New Route Dispatch</h2>
                                <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Assign inventory to fleet</p>
                            </div>
                        </div>

                        <div className="space-y-6 flex-1 relative z-10">
                            <div className="relative z-[100]">
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-300 mb-2">
                                    Select Driver & Origin Warehouse
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <DriverSelect drivers={drivers} selected={selectedDriver} onChange={setSelectedDriver} />

                                    <WarehouseSelect
                                        warehouses={warehouses}
                                        selected={selectedWarehouseId}
                                        onChange={(id) => {
                                            setSelectedWarehouseId(id);
                                            setSelectedItems([]);
                                        }}
                                    />
                                </div>
                            </div>

                            {selectedDriver && (
                                <button
                                    type="button"
                                    onClick={handleCopyRecent}
                                    disabled={isCopying}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-accent-blue hover:border-accent-blue/50 transition-all w-fit"
                                >
                                    {isCopying ? <Loader2 className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
                                    Copy Latest Route Items
                                </button>
                            )}

                            {/* Show what the driver is currently carrying via their DriverStock */}
                            {selectedDriver && (drivers.find(d => d.id.toString() === selectedDriver)?.DriverStock?.length ?? 0) > 0 && (
                                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 mt-4 relative z-50">
                                    <div className="flex items-center gap-2 mb-2">
                                        <PackageOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                        <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Currently in Driver's Bag</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {drivers.find(d => d.id.toString() === selectedDriver)?.DriverStock?.map(stock => (
                                            <span key={stock.id} className="text-xs bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-1 rounded font-medium">
                                                {stock.item.name}: {stock.quantity_on_hand}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-2">These items will be automatically prioritized and deducted from their bag during route assignment.</p>
                                </div>
                            )}

                            <div className="flex flex-col gap-3 mb-4">
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-300">
                                    Available Inventory {selectedWarehouseId && `- ${warehouses.find(w => w.id === selectedWarehouseId)?.name}`}
                                </label>
                                
                                {selectedWarehouseId && (
                                    <div className="relative group">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent-blue transition-colors">
                                            <Truck className="w-4 h-4" />
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
                                {!selectedWarehouseId ? (
                                    <div className="col-span-2 p-4 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                                        Please select an origin warehouse first.
                                    </div>
                                ) : inventory.filter(inv => 
                                    inv.warehouseId === selectedWarehouseId && 
                                    (inv.item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                        inv.item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
                                ).length === 0 ? (
                                    <div className="col-span-2 p-4 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 rounded-xl border border-dashed border-slate-200 dark:border-white/10">
                                        {searchQuery ? "No items match your search." : "No stock available in this warehouse."}
                                    </div>
                                ) : (
                                    inventory.filter(inv => 
                                        inv.warehouseId === selectedWarehouseId && 
                                        (inv.item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                            inv.item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
                                    ).map((inv) => {
                                        const isSelected = selectedItems.find(i => i.itemId === inv.itemId);
                                        return (
                                            <button
                                                key={inv.id}
                                                onClick={() => !isSelected && addItemToDispatch(inv.itemId)}
                                                disabled={inv.quantity_on_hand <= 0}
                                                className={`flex flex-col items-start p-4 border rounded-xl transition-all text-left disabled:opacity-30 disabled:border-slate-200 dark:border-white/10 disabled:bg-transparent group/item relative overflow-hidden ${isSelected ? 'border-accent-blue bg-accent-blue/10 shadow-[0_0_15px_rgba(0,180,255,0.15)] scale-[0.98]' : 'border-slate-200 dark:border-white/10 hover:border-accent-blue/50 hover:bg-accent-blue/5'}`}
                                                type="button"
                                            >
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2">
                                                        <Check className="w-4 h-4 text-accent-blue" />
                                                    </div>
                                                )}
                                                <span className={`text-sm font-semibold mb-2 transition-colors ${isSelected ? 'text-accent-blue' : 'text-slate-900 dark:text-white group-hover/item:text-accent-blue'}`}>{inv.item.name}</span>
                                                <span className={`text-xs px-2.5 py-1 rounded border ${isSelected ? 'bg-accent-blue/20 border-accent-blue/30 text-accent-blue' : 'bg-white/10 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 dark:text-slate-300'}`}>
                                                    {inv.quantity_on_hand} available
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-5 border border-slate-200 dark:border-white/10 mt-6 min-h-[140px] flex flex-col">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-300">Dispatch Manifest</h3>
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
                                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 mb-4 group/bulk">
                                        <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Bulk Set Qty:</div>
                                        <input
                                            type="number"
                                            placeholder="Set all..."
                                            value={bulkQty}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setBulkQty(val);
                                                const q = parseInt(val);
                                                if (q > 0) {
                                                    setSelectedItems(prev => prev.map(i => ({ ...i, quantity: q })));
                                                }
                                            }}
                                            className="flex-1 bg-transparent border-none outline-none text-xs text-accent-blue font-bold placeholder:text-slate-600"
                                        />
                                    </div>
                                )}

                                {selectedItems.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-xl bg-white/[0.02]">
                                        <motion.div animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0.8, 0.5] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                                            <PackageOpen className="w-8 h-8 text-slate-500 dark:text-slate-400 mb-3 opacity-50" />
                                        </motion.div>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">No items added to route.</p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Select multiple items from the inventory above.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <AnimatePresence>
                                            {selectedItems.map((item) => {
                                                const invItem = inventory.find((i) => i.itemId === item.itemId);
                                                return (
                                                    <motion.div
                                                        layout
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        exit={{ opacity: 0, scale: 0.95 }}
                                                        key={item.itemId}
                                                        className="flex items-center justify-between glass-panel-hover p-3 rounded-lg border border-slate-200 dark:border-white/5 bg-black/20"
                                                    >
                                                        <span className="text-sm font-medium text-slate-900 dark:text-white flex-1">{invItem?.item.name}</span>
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                className="w-20 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-accent-blue focus:border-accent-blue rounded text-center px-2 py-1.5 text-sm text-slate-900 dark:text-white font-semibold focus:outline-none transition-colors"
                                                                value={item.quantity}
                                                                onChange={(e) => updateQuantity(item.itemId, parseInt(e.target.value) || 0)}
                                                            />
                                                            <button
                                                                onClick={() => setSelectedItems(selectedItems.filter(i => i.itemId !== item.itemId))}
                                                                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-accent-pink hover:bg-accent-pink/10 rounded-md transition-colors"
                                                            >
                                                                <Crosshair className="w-4 h-4 rotate-45" />
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                )
                                            })}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={handleDispatch}
                            disabled={!selectedDriver || !selectedWarehouseId || selectedItems.length === 0 || isPending}
                            className="mt-8 relative w-full group/btn disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="relative w-full py-4 bg-accent-blue hover:bg-accent-blue/90 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors text-slate-900 dark:text-white">
                                {isPending ? (
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                        <Loader2 className="w-5 h-5" />
                                    </motion.div>
                                ) : (
                                    <Navigation className="w-5 h-5" />
                                )}
                                {isPending ? "Assigning Route..." : "Assign to Route"}
                            </div>
                        </button>
                    </div>

                    {/* Active Dispatches */}
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                            Active Routes
                        </h2>

                        {activeDispatches.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center border-dashed"
                            >
                                <motion.div
                                    animate={{ y: [0, -10, 0] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                    className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4 border border-slate-200 dark:border-white/10"
                                >
                                    <Truck className="w-8 h-8 text-slate-500 dark:text-slate-400 opacity-50" />
                                </motion.div>
                                <h3 className="text-slate-900 dark:text-white font-bold mb-1">No Active Routes</h3>
                                <p className="text-slate-600 dark:text-slate-400 text-sm">All drivers have completed their assignments.</p>
                            </motion.div>
                        ) : (
                            <div className="space-y-4">
                                <AnimatePresence mode="popLayout">
                                    {activeDispatches.map((dispatch) => (
                                        <DispatchCard key={dispatch.id} dispatch={dispatch} />
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === "bags" && (
                <DriverBagManager drivers={drivers} />
            )}
        </div>
    );
}

function DispatchCard({ dispatch }: { dispatch: DispatchWithRelations }) {
    const [isReturning, setIsReturning] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});

    // Live Route Progress Calculation
    const totalGiven = dispatch.DispatchItems.reduce((sum: number, item: DispatchItemWithItem) => sum + item.quantity_given, 0);
    const totalConsumedOnRoute = (dispatch.RefillLogs as any[]).reduce((sum: number, log: any) => sum + log.quantity_refilled + (log.expired_quantity || 0) + (log.damaged_quantity || 0), 0);
    const progressPercent = totalGiven > 0 ? Math.min(100, (totalConsumedOnRoute / totalGiven) * 100) : 0;
    const isComplete = progressPercent === 100;

    const handleStartReturn = () => {
        const initialQtys = dispatch.DispatchItems.reduce((acc: Record<number, number>, curr: DispatchItemWithItem) => {
            const itemConsumed = (dispatch.RefillLogs as any[]).filter((r: any) => r.itemId === curr.itemId).reduce((sum: number, log: any) => sum + log.quantity_refilled + (log.expired_quantity || 0) + (log.damaged_quantity || 0), 0);
            const expectedReturn = Math.max(0, curr.quantity_given - itemConsumed);
            acc[curr.id] = expectedReturn;
            return acc;
        }, {});
        setReturnQtys(initialQtys);
        setIsReturning(true);
    };

    const handleReturn = async () => {
        // Reconciliation: Compares Expected vs Actual returns. Returns items to DriverStock.
        startTransition(async () => {
            const returns = Object.keys(returnQtys).map(id => ({
                dispatchItemId: parseInt(id),
                quantity_returned: returnQtys[parseInt(id)],
                quantity_damaged: 0
            }));
            const result = await returnDispatch(dispatch.id, returns);
            if (result.success) {
                toast.success("Route reconciled successfully", {
                    description: `Dispatch #${formatID(dispatch.id)} has been closed.`,
                });
                setIsReturning(false);
            } else {
                toast.error("Reconciliation failed", {
                    description: result.error,
                });
            }
        });
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-panel border-slate-200 dark:border-white/10 overflow-hidden rounded-2xl transition-all"
        >
            <div 
                className="p-5 flex items-center justify-between border-slate-200 dark:border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors"
                onClick={() => !isReturning && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-4">
                    <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        className="text-slate-400"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </motion.div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white tracking-tight">{dispatch.driver.name}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Route started: {formatSaudiTime(dispatch.dispatch_date)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block mr-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Route Progress</p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{Math.round(progressPercent)}%</p>
                    </div>
                    <motion.div 
                        animate={!isComplete ? { 
                            scale: [1, 1.05, 1],
                            opacity: [1, 0.8, 1]
                        } : {}}
                        transition={{ 
                            duration: 3, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                        }}
                        className={`px-3 py-1 border text-xs font-semibold rounded-full flex items-center gap-1.5 ${isComplete ? 'bg-accent-green/10 border-accent-green/20 text-accent-green' : 'bg-accent-blue/10 border-accent-blue/20 text-accent-blue'}`}
                    >
                        {!isComplete && <div className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />}
                        {isComplete ? 'Route Complete' : 'In Transit'}
                    </motion.div>
                </div>
            </div>

            {/* Animated Progress Bar */}
            <div className="h-1 bg-slate-100 dark:bg-white/5 w-full overflow-hidden relative">
                <motion.div
                    className={`absolute top-0 left-0 h-full ${isComplete ? 'bg-accent-green' : 'bg-accent-blue'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ type: "spring", bounce: 0, duration: 1.5 }}
                />
            </div>

            <AnimatePresence initial={false}>
                {(isExpanded || isReturning) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        {!isReturning ? (
                            <div className="p-5 relative border-t border-slate-200 dark:border-white/5">
                                <div className="space-y-4 mb-6 relative z-10">
                                    {dispatch.DispatchItems.map((di: DispatchItemWithItem) => {
                                        const itemRefills = (dispatch.RefillLogs as RefillLogWithMachine[]).filter((r) => r.itemId === di.itemId).reduce((sum: number, log) => sum + log.quantity_refilled, 0);
                                        return (
                                            <div key={di.id} className="flex items-center justify-between text-sm">
                                                <span className="font-medium text-slate-500 dark:text-slate-400 dark:text-slate-300">{di.item.name}</span>
                                                <div className="text-right flex items-center gap-3">
                                                    <span className="font-semibold text-slate-900 dark:text-white">{itemRefills} <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">Delivered</span></span>
                                                    <span className="text-slate-900 dark:text-white/20">/</span>
                                                    <span className="text-slate-600 dark:text-slate-400">{di.quantity_given} <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">Total</span></span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleStartReturn(); }}
                                    className="w-full py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-white/10 border border-slate-200 dark:border-white/10 hover:border-accent-blue text-slate-900 dark:text-white rounded-xl font-medium transition-colors text-sm"
                                >
                                    Complete Route & Return Stock
                                </button>
                            </div>
                        ) : (
                            <div className="p-5 relative border-t-2 border-accent-orange/50 bg-accent-orange/[0.02]">
                                <h4 className="font-semibold text-accent-orange mb-4 text-sm flex items-center gap-2 tracking-tight">
                                    <AlertTriangle className="w-4 h-4 text-accent-orange" />
                                    Verify End-of-Route Returns
                                </h4>

                                <div className="space-y-3 mb-6 relative z-10">
                                    {dispatch.DispatchItems.map((di: DispatchItemWithItem) => {
                                        const itemConsumed = (dispatch.RefillLogs as any[]).filter((r: any) => r.itemId === di.itemId).reduce((sum: number, log: any) => sum + log.quantity_refilled + (log.expired_quantity || 0) + (log.damaged_quantity || 0), 0);
                                        const expectedValue = Math.max(0, di.quantity_given - itemConsumed);
                                        const isMismatch = returnQtys[di.id] !== expectedValue;

                                        return (
                                            <div key={di.id} className="flex items-center justify-between text-sm p-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/5">
                                                <div className="flex flex-col pr-2">
                                                    <span className="font-bold text-slate-900 dark:text-white mb-0.5">{di.item.name}</span>
                                                    <span className="text-xs text-slate-500 dark:text-slate-400">Expected: {expectedValue} Units</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Returned</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={returnQtys[di.id]}
                                                            onChange={e => setReturnQtys({ ...returnQtys, [di.id]: parseInt(e.target.value) || 0 })}
                                                            className={`w-16 bg-white dark:bg-black/50 border rounded-lg px-2 py-1.5 text-center font-bold text-sm focus:outline-none transition-colors ${isMismatch ? 'border-accent-orange text-accent-orange' : 'border-slate-200 dark:border-white/10 text-slate-900 dark:text-white hover:border-slate-300 dark:border-white/20 focus:border-accent-blue'}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex gap-3 relative z-10">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsReturning(false); }}
                                        className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-500 dark:text-slate-400 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-xl font-medium text-sm transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleReturn(); }}
                                        disabled={isPending}
                                        className="flex-1 py-2.5 bg-accent-blue hover:bg-accent-blue/90 text-slate-900 dark:text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        {isPending ? (
                                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                                                <Loader2 className="w-4 h-4" />
                                            </motion.div>
                                        ) : (
                                            <Check className="w-4 h-4" />
                                        )}
                                        {isPending ? "Processing..." : "Confirm Return"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

function DriverSelect({ drivers, selected, onChange }: { drivers: DriverType[], selected: string, onChange: (val: string) => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedDriver = drivers.find(d => d.id.toString() === selected);

    return (
        <div className="relative z-[100] text-left">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-slate-100 dark:bg-white/5 border ${isOpen ? 'border-accent-blue shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/20'} rounded-xl px-4 py-3 flex items-center justify-between text-slate-900 dark:text-white focus:outline-none transition-all font-medium gap-3`}
            >
                <span className={`truncate flex-1 text-left ${selectedDriver ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                    {selectedDriver ? selectedDriver.name : '-- Choose Driver --'}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-500 dark:text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180 text-accent-blue' : ''}`} />
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
                            {drivers.map(d => (
                                <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => { onChange(d.id.toString()); setIsOpen(false); }}
                                    className={`w-full text-left px-5 py-3 hover:bg-accent-blue/10 transition-colors ${selected === d.id.toString() ? 'text-accent-blue bg-accent-blue/5' : 'text-slate-900 dark:text-white'}`}
                                >
                                    {d.name}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function WarehouseSelect({ warehouses, selected, onChange }: { warehouses: WarehouseType[], selected: number | "", onChange: (val: number | "") => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedWarehouse = warehouses.find(w => w.id === selected);

    return (
        <div className="relative z-[90] text-left">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-slate-100 dark:bg-white/5 border ${isOpen ? 'border-accent-blue shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/20'} rounded-xl px-4 py-3 flex items-center justify-between text-slate-900 dark:text-white focus:outline-none transition-all font-medium gap-3`}
            >
                <span className={`truncate flex-1 text-left ${selectedWarehouse ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                    {selectedWarehouse ? selectedWarehouse.name : '-- Choose Origin Warehouse --'}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-500 dark:text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180 text-accent-blue' : ''}`} />
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
                                onClick={() => { onChange(""); setIsOpen(false); }}
                                className="w-full text-left px-5 py-3 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-white/5 transition-colors text-slate-500 dark:text-slate-400 text-sm italic"
                            >
                                -- Clear Selection --
                            </button>
                            {warehouses.map(w => (
                                <button
                                    key={w.id}
                                    type="button"
                                    onClick={() => { onChange(w.id); setIsOpen(false); }}
                                    className={`w-full text-left px-5 py-3 hover:bg-accent-blue/10 transition-colors ${selected === w.id ? 'text-accent-blue bg-accent-blue/5' : 'text-slate-900 dark:text-white'}`}
                                >
                                    {w.name}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
