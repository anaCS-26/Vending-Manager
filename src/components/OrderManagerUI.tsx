"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Plus, CheckCircle2, History, Package, Clock, Loader2, Search, Store, FileText, X, Trash2, ArrowRight, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPurchaseOrder, completePurchaseOrder, cancelPurchaseOrder, createQuickItem } from "@/actions/orders";
import { formatCurrency, formatSaudiDate, formatSaudiTime } from "@/lib/utils";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NumericInput } from "@/components/NumericInput";
import type { Item, Warehouse, PurchaseOrder, PurchaseOrderItem } from "@prisma/client";

type OrderWithRelations = PurchaseOrder & {
    warehouse: Warehouse;
    Items: (PurchaseOrderItem & { item: Item })[];
};

type ItemWithDetails = Item & {
    WarehouseStock?: { warehouseId: number, quantity_on_hand: number, pending_deficit?: number }[];
    _count?: { DispatchItems: number };
};

type Props = {
    warehouses: Warehouse[];
    items: ItemWithDetails[];
    pendingOrders: OrderWithRelations[];
    completedOrders: OrderWithRelations[];
};

export default function OrderManagerUI({ warehouses, items, pendingOrders, completedOrders }: Props) {
    const [activeTab, setActiveTab] = useState<"NEW" | "PENDING" | "HISTORY">("PENDING");
    const [isPending, startTransition] = useTransition();

    // -- Create Order State --
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | "">("");
    const [orderLines, setOrderLines] = useState<Array<{ itemId: number; quantityRequested: number }>>([]);
    const [itemSearchQuery, setItemSearchQuery] = useState("");
    const [isSearchFocused, setIsSearchFocused] = useState(false);

    // New Item State
    const [isCreatingItem, setIsCreatingItem] = useState(false);
    const [newItemForm, setNewItemForm] = useState({ name: "", sku: "", category: "", bulk_format: "" });

    // -- Receive Order State --
    const [receivingOrderId, setReceivingOrderId] = useState<number | null>(null);
    const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});
    const [receivedPrices, setReceivedPrices] = useState<Record<number, { cost: number, price_standard: number, price_hospital: number, price_hotel: number }>>({});

    // -- Order History State --
    const [historySearchQuery, setHistorySearchQuery] = useState("");
    const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<OrderWithRelations | null>(null);

    // -- Print State --
    const [printingOrder, setPrintingOrder] = useState<OrderWithRelations | null>(null);

    // -- Confirmation Modal State --
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        action: "RECEIVE" | "CANCEL" | null;
        payload?: any;
    }>({ isOpen: false, action: null });

    useEffect(() => {
        if (printingOrder) {
            setTimeout(() => {
                window.print();
                setPrintingOrder(null);
            }, 100);
        }
    }, [printingOrder]);

    const handleAddLine = (itemId: number) => {
        if (orderLines.find(l => l.itemId === itemId)) return;
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        setOrderLines([...orderLines, { itemId, quantityRequested: 1 }]);
        setItemSearchQuery("");
        setIsSearchFocused(false);
    };

    const handleCreateOrder = () => {
        if (!selectedWarehouseId || orderLines.length === 0) return;
        startTransition(async () => {
            const res = await createPurchaseOrder({
                warehouseId: Number(selectedWarehouseId),
                items: orderLines
            });
            if (res.success) {
                toast.success("Purchase Order created successfully");
                setSelectedWarehouseId("");
                setOrderLines([]);
                setActiveTab("PENDING");
            } else {
                toast.error(res.error);
            }
        });
    };

    const handleCreateItemAndAdd = async () => {
        if (!newItemForm.name || !newItemForm.sku) {
            toast.error("Please fill out name and SKU.");
            return;
        }
        startTransition(async () => {
            const res = await createQuickItem({
                ...newItemForm
            });
            if (res.success && res.item) {
                toast.success("New product registered!");

                // We physically push it locally so the UI doesn't crash trying to search for it
                items.push(res.item as any);

                // Add it directly to the order line using the returned item
                setOrderLines(prev => {
                    if (prev.find(l => l.itemId === res.item!.id)) return prev;
                    return [...prev, { itemId: res.item!.id, quantityRequested: 1 }];
                });

                setIsCreatingItem(false);
                setNewItemForm({ name: "", sku: "", category: "", bulk_format: "" });
            } else {
                toast.error(res.error);
            }
        });
    };

    const handleStartReceiving = (order: OrderWithRelations) => {
        const initialQtys = order.Items.reduce((acc: Record<number, number>, curr: any) => {
            acc[curr.id] = curr.quantityRequested; // Default to expected amount
            return acc;
        }, {} as Record<number, number>);

        const initialPrices = order.Items.reduce((acc: Record<number, { cost: number, price_standard: number, price_hospital: number, price_hotel: number }>, curr: any) => {
            acc[curr.id] = { cost: (curr.item as any).last_purchase_cost || 0, price_standard: curr.item.price_standard || 0, price_hospital: curr.item.price_hospital || 0, price_hotel: curr.item.price_hotel || 0 };
            return acc;
        }, {} as Record<number, { cost: number, price_standard: number, price_hospital: number, price_hotel: number }>);

        setReceivedQtys(initialQtys);
        setReceivedPrices(initialPrices);
        setReceivingOrderId(order.id);
    };

    const handleCompleteReceipt = (orderId: number) => {
        setConfirmModal({
            isOpen: true,
            action: "RECEIVE",
            payload: orderId
        });
    };

    const handleCancelOrder = (orderId: number) => {
        setConfirmModal({
            isOpen: true,
            action: "CANCEL",
            payload: orderId
        });
    }

    const executeConfirmAction = () => {
        if (!confirmModal.action || !confirmModal.payload) return;

        if (confirmModal.action === "RECEIVE") {
            const orderId = confirmModal.payload;
            startTransition(async () => {
                const payload = Object.keys(receivedQtys).map(k => ({
                    purchaseOrderItemId: Number(k),
                    quantityReceived: receivedQtys[Number(k)],
                    costPerUnit: receivedPrices[Number(k)]?.cost || 0,
                    price_standard: receivedPrices[Number(k)]?.price_standard || 0,
                    price_hospital: receivedPrices[Number(k)]?.price_hospital || 0,
                    price_hotel: receivedPrices[Number(k)]?.price_hotel || 0
                }));
                const res = await completePurchaseOrder(orderId, payload);
                if (res.success) {
                    toast.success("Order received and stock updated!");
                    setReceivingOrderId(null);
                } else {
                    toast.error(res.error);
                }
                setConfirmModal({ isOpen: false, action: null });
            });
        } else if (confirmModal.action === "CANCEL") {
            const orderId = confirmModal.payload;
            startTransition(async () => {
                const res = await cancelPurchaseOrder(orderId);
                if (res.success) toast.success("Order cancelled");
                else toast.error(res.error);
                setConfirmModal({ isOpen: false, action: null });
            });
        }
    };

    /** 
     * Item Priority: 
     * 1. Deficits (Shorted items)
     * 2. Low Stock in selected WH
     * 3. Alphabetical
     */
    const displayedItems = itemSearchQuery
        ? items.filter(i =>
            i.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
            i.sku.toLowerCase().includes(itemSearchQuery.toLowerCase())
        )
        : [...items].sort((a, b) => {
            // Helper function to safely get stock and deficit values purely for the selected warehouse
            const getMetrics = (item: ItemWithDetails) => {
                const stockRecord = selectedWarehouseId && item.WarehouseStock ? item.WarehouseStock.find(ws => ws.warehouseId === selectedWarehouseId) : null;
                return {
                    deficit: stockRecord?.pending_deficit || 0,
                    stock: stockRecord ? stockRecord.quantity_on_hand : -1 // -1 means no stock relation exists yet globally
                };
            };

            const metricsA = getMetrics(a);
            const metricsB = getMetrics(b);

            // TIER 1: Deficits (Highest Priority)
            if (metricsA.deficit > 0 || metricsB.deficit > 0) {
                if (metricsA.deficit > 0 && metricsB.deficit === 0) return -1;
                if (metricsB.deficit > 0 && metricsA.deficit === 0) return 1;
                return metricsB.deficit - metricsA.deficit; // If both have deficits, sort by largest deficit first
            }

            // TIER 2: Local Warehouse Stock exists (sorted ascending from emptiest to fullest)
            if (metricsA.stock >= 0 && metricsB.stock >= 0) {
                return metricsA.stock - metricsB.stock;
            }
            if (metricsA.stock >= 0 && metricsB.stock < 0) return -1;
            if (metricsB.stock >= 0 && metricsA.stock < 0) return 1;

            // TIER 3: Global Catalog items not currently in local warehouse (sorted alphabetically A-Z)
            return a.name.localeCompare(b.name);
        }).slice(0, 10);

    const filteredHistory = completedOrders.filter(o =>
        o.warehouse.name.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
        o.Items.some(oi => oi.item.name.toLowerCase().includes(historySearchQuery.toLowerCase()))
    );

    return (
        <>
        <div className="space-y-6">
            <div className="glass-panel border-slate-200 dark:border-white/10 rounded-2xl p-2 flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setActiveTab("NEW")}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "NEW" ? "bg-accent-purple text-white shadow-lg" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"}`}
                    >
                        <Plus className="w-4 h-4" />
                        Create Order
                    </button>
                    <button
                        onClick={() => setActiveTab("PENDING")}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "PENDING" ? "bg-accent-orange text-white shadow-lg" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"}`}
                    >
                        <Clock className="w-4 h-4" />
                        Pending Receipts
                        {pendingOrders.length > 0 && (
                            <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-md text-[10px]">{pendingOrders.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab("HISTORY")}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === "HISTORY" ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-lg" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"}`}
                    >
                        <History className="w-4 h-4" />
                        Order History
                    </button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === "NEW" && (
                    <motion.div key="NEW" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                        <div className="glass-panel border border-slate-300 shadow-sm dark:border-white/10 rounded-[2rem] p-8">
                            <p className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                                <Store className="w-5 h-5 text-accent-purple" />
                                Purchase Order Details
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">Destination Warehouse</label>
                                    <WarehouseDropdown
                                        warehouses={warehouses}
                                        selected={selectedWarehouseId}
                                        onChange={(val) => {
                                            if (val !== selectedWarehouseId) {
                                                setOrderLines([]);
                                                setSelectedWarehouseId(val);
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="border-t border-slate-200 dark:border-white/10 pt-8">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 block">Order Items</label>

                                {/* Search & Add Item */}
                                <div className="relative mb-6">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input
                                                type="text"
                                                value={itemSearchQuery}
                                                onChange={e => setItemSearchQuery(e.target.value)}
                                                onFocus={() => setIsSearchFocused(true)}
                                                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                                                placeholder="Search item to request (shows top 10)..."
                                                className="w-full pl-11 pr-4 py-3 bg-slate-100 dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-purple/50 transition-all"
                                            />
                                        </div>
                                        <button onClick={() => {
                                            let maxNumericSku = 0;
                                            for (const item of items) {
                                                if (/^\d+$/.test(item.sku)) {
                                                    const skuNum = parseInt(item.sku, 10);
                                                    if (skuNum > maxNumericSku) maxNumericSku = skuNum;
                                                }
                                            }
                                            const nextSku = String(maxNumericSku + 1).padStart(4, '0');
                                            setNewItemForm({ name: "", sku: nextSku, category: "", bulk_format: "" });
                                            setIsCreatingItem(true);
                                        }} className="px-4 py-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white rounded-xl text-sm font-bold transition-all whitespace-nowrap border border-slate-300 dark:border-white/10 flex items-center gap-2">
                                            <Plus className="w-4 h-4" /> New Item
                                        </button>
                                    </div>

                                    {isSearchFocused && (
                                        <div className="absolute top-14 left-0 right-0 z-50 bg-white dark:bg-[#18181b] border border-slate-300 shadow-xl dark:border-white/10 rounded-xl max-h-[300px] overflow-y-auto p-2">
                                            {displayedItems.map(item => {
                                                const currentStock = selectedWarehouseId && item.WarehouseStock
                                                    ? item.WarehouseStock.find(ws => ws.warehouseId === selectedWarehouseId)?.quantity_on_hand || 0
                                                    : 0;

                                                const currentDeficit = selectedWarehouseId && item.WarehouseStock
                                                    ? item.WarehouseStock.find(ws => ws.warehouseId === selectedWarehouseId)?.pending_deficit || 0
                                                    : 0;

                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => handleAddLine(item.id)}
                                                        className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg flex flex-col group transition-colors border-b border-slate-100 dark:border-white/5 last:border-0"
                                                    >
                                                        <div className="flex justify-between items-center w-full">
                                                            <div className="flex flex-col items-start text-left">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="font-bold text-slate-900 dark:text-white group-hover:text-accent-purple transition-colors">{item.name}</p>
                                                                    {currentDeficit > 0 && (
                                                                        <span className="bg-accent-orange/10 text-accent-orange text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-accent-orange/20 animate-pulse">
                                                                            ⚠️ Shorted: {currentDeficit}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs font-mono text-slate-500 uppercase mt-0.5">#{item.sku}</p>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <p className="font-bold text-slate-700 dark:text-slate-300">
                                                                    {formatCurrency((item as any).price_standard || 0)}
                                                                </p>
                                                                <Plus className="w-5 h-5 text-slate-400 group-hover:text-accent-purple transition-all" />
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs font-semibold text-slate-500">
                                                            {selectedWarehouseId && (
                                                                <span className={currentStock < 10 ? "text-accent-orange" : "text-green-500"}>
                                                                    Stock in WH: {currentStock}
                                                                </span>
                                                            )}
                                                            <span>•</span>
                                                            <span>{item.category || "Uncategorized"}</span>
                                                            <span>•</span>
                                                            <span>{item.bulk_format || "Units"}</span>
                                                            <span>•</span>
                                                            <span className="flex items-center gap-1">
                                                                <History className="w-3 h-3" /> {item._count?.DispatchItems || 0} historical dispatches
                                                            </span>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                            {displayedItems.length === 0 && (
                                                <div className="p-4 text-center text-slate-500 text-sm">No items found. Click "New Item" to register it.</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Order Lines */}
                                <div className="space-y-3">
                                    {orderLines.map((line, index) => {
                                        const item = items.find(i => i.id === line.itemId);
                                        if (!item) return null;

                                        const currentStock = selectedWarehouseId && item.WarehouseStock
                                            ? item.WarehouseStock.find(ws => ws.warehouseId === selectedWarehouseId)?.quantity_on_hand || 0
                                            : 0;

                                        return (
                                            <div key={line.itemId} className="flex flex-col xl:flex-row xl:items-center gap-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-xl p-4">
                                                <div className="flex-1">
                                                    <p className="font-bold text-slate-900 dark:text-white">{item.name}</p>
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                                                        <span className="uppercase">#{item.sku}</span>
                                                        <span>•</span>
                                                        <span>{item.category || "Uncategorized"}</span>
                                                        <span>•</span>
                                                        <span>{item.bulk_format || "Units"}</span>

                                                        {selectedWarehouseId && (
                                                            <>
                                                                <span>•</span>
                                                                <span className={currentStock < 10 ? "text-accent-orange font-bold" : "text-green-500 font-bold"}>
                                                                    WH Stock: {currentStock}
                                                                </span>
                                                            </>
                                                        )}
                                                        <span>•</span>
                                                        <span className="flex items-center gap-1">
                                                            <History className="w-3 h-3" /> {item._count?.DispatchItems || 0} history
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6 self-start xl:self-auto">
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Request Qty</label>
                                                        <NumericInput
                                                            value={line.quantityRequested}
                                                            onChange={q => {
                                                                const newLines = [...orderLines];
                                                                newLines[index].quantityRequested = q;
                                                                setOrderLines(newLines);
                                                            }}
                                                            onBlur={() => {
                                                                if (!line.quantityRequested) {
                                                                    const newLines = [...orderLines];
                                                                    newLines[index].quantityRequested = 1;
                                                                    setOrderLines(newLines);
                                                                }
                                                            }}
                                                            className="w-20 px-3 py-2 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-white/10 rounded-lg text-sm text-center focus:outline-none focus:border-accent-purple"
                                                        />
                                                    </div>
                                                    <button onClick={() => setOrderLines(orderLines.filter(l => l.itemId !== line.itemId))} className="p-2 text-slate-400 hover:text-accent-pink hover:bg-accent-pink/10 rounded-lg mt-5 transition-colors">
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {orderLines.length === 0 && (
                                        <div className="text-center p-8 border border-dashed border-slate-300 dark:border-white/10 rounded-xl text-slate-500 dark:text-slate-400 text-sm">
                                            No items added to the request yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {orderLines.length > 0 && (
                                <div className="mt-8 flex justify-end">
                                    <button
                                        onClick={handleCreateOrder}
                                        disabled={isPending || !selectedWarehouseId}
                                        className="flex items-center gap-2 px-6 py-3 bg-accent-purple hover:bg-accent-purple/90 text-white rounded-xl font-bold transition-all disabled:opacity-50"
                                    >
                                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                                        Submit Order
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Create Item Modal */}
                        {isCreatingItem && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-[2rem] p-8 w-full max-w-md shadow-2xl">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Register New Item</h3>
                                        <button onClick={() => setIsCreatingItem(false)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Item Name <span className="text-accent-pink">*</span></label>
                                                <input type="text" value={newItemForm.name} onChange={e => setNewItemForm({ ...newItemForm, name: e.target.value })} className="w-full px-4 py-2 bg-slate-100 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:border-accent-purple" placeholder="e.g., Lays Classic" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">SKU <span className="text-accent-pink">*</span></label>
                                                <input type="text" value={newItemForm.sku} onChange={e => setNewItemForm({ ...newItemForm, sku: e.target.value })} className="w-full px-4 py-2 bg-slate-100 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:border-accent-purple uppercase" placeholder="0001" />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Category (e.g., Snacks)</label>
                                                <input type="text" value={newItemForm.category} onChange={e => setNewItemForm({ ...newItemForm, category: e.target.value })} className="w-full px-4 py-2 bg-slate-100 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:border-accent-purple" placeholder="Enter category..." />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Bulk Format</label>
                                                <input type="text" value={newItemForm.bulk_format} onChange={e => setNewItemForm({ ...newItemForm, bulk_format: e.target.value })} className="w-full px-4 py-2 bg-slate-100 dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:border-accent-purple" placeholder="e.g., Box of 24" />
                                            </div>
                                        </div>
                                        <button onClick={handleCreateItemAndAdd} disabled={isPending || !newItemForm.name || !newItemForm.sku} className="w-full py-3 bg-accent-purple text-white rounded-xl font-bold mt-4 disabled:opacity-50 flex justify-center items-center gap-2">
                                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Register & Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

                {activeTab === "PENDING" && (
                    <motion.div key="PENDING" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                        {pendingOrders.length === 0 ? (
                            <div className="glass-panel border-slate-200 dark:border-white/5 border-dashed rounded-[3rem] p-20 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-6 text-slate-500">
                                    <CheckCircle2 className="w-8 h-8" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No pending deliveries</h3>
                                <p className="text-slate-500 dark:text-slate-400 text-sm">All purchase requests have been received.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6">
                                {pendingOrders.map(order => {
                                    const isReceiving = receivingOrderId === order.id;
                                    return (
                                        <div key={order.id} className="glass-panel border border-slate-300 shadow-sm dark:border-white/10 rounded-[2rem] p-6 lg:p-8 relative overflow-hidden group">
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-accent-orange"></div>

                                            <div className="flex flex-col lg:flex-row gap-8">
                                                <div className="flex-1 space-y-4">
                                                    <div className="flex items-start justify-between">
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-1">
                                                                <span className="px-3 py-1 bg-accent-orange/10 text-accent-orange rounded-lg text-[10px] font-black uppercase tracking-widest border border-accent-orange/20">Awaiting Delivery</span>
                                                                <p className="text-xs font-mono text-slate-500">PO-{order.id.toString().padStart(4, '0')}</p>
                                                            </div>
                                                            <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                                <Store className="w-5 h-5 text-slate-400" /> {order.warehouse.name}
                                                            </h3>
                                                            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                                                                <Clock className="w-4 h-4" /> Ordered on {formatSaudiDate(order.createdAt)} at {formatSaudiTime(order.createdAt, { hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>

                                                        {!isReceiving && (
                                                            <div className="flex gap-2">
                                                                <button onClick={() => setPrintingOrder(order)} className="p-2 text-slate-400 hover:text-accent-purple hover:bg-accent-purple/10 rounded-xl transition-colors" title="Download PDF"><FileText className="w-4 h-4" /></button>
                                                                <button onClick={() => handleStartReceiving(order)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white text-xs font-bold rounded-xl transition-all border border-slate-300 dark:border-white/10">Start Receipt</button>
                                                                <button onClick={() => handleCancelOrder(order.id)} disabled={isPending} className="p-2 text-slate-400 hover:text-accent-pink hover:bg-accent-pink/10 rounded-xl transition-colors"><X className="w-4 h-4" /></button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="border-t border-slate-200 dark:border-white/10 pt-4">
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Line Items ({order.Items.length})</p>
                                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                                            {order.Items.map((oi: any) => (
                                                                <div key={oi.id} className="flex flex-col p-4 bg-slate-50 dark:bg-white/[0.02] rounded-xl border border-slate-200 dark:border-white/5">
                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <div>
                                                                            <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-1">{oi.item.name}</p>
                                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono font-semibold text-slate-500 mb-2">
                                                                                <span className="flex items-center gap-2 whitespace-nowrap">#{oi.item.sku} <span className="opacity-50">•</span></span>
                                                                                <span className="flex items-center gap-2 whitespace-nowrap">{formatCurrency(oi.costPerUnit)} <span className="opacity-50">•</span></span>
                                                                                <span className="flex items-center gap-2 whitespace-nowrap">{oi.item.bulk_format || 'Unit'} <span className="opacity-50">•</span></span>
                                                                                <span className="whitespace-nowrap">{oi.item.category || 'Uncategorized'}</span>
                                                                            </div>
                                                                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 uppercase">
                                                                                <Package className="w-3 h-3 opacity-70" />
                                                                                Live WH Stock: <span className="font-mono text-emerald-700 dark:text-emerald-300">{items.find(i => i.id === oi.itemId)?.WarehouseStock?.find(ws => ws.warehouseId === order.warehouseId)?.quantity_on_hand || 0}</span>
                                                                            </div>
                                                                        </div>
                                                                        {isReceiving && (
                                                                            <div className="flex flex-col gap-2 ml-4">
                                                                                <div className="flex items-center gap-2">
                                                                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex-1 text-right">RCV QTY:</label>
                                                                                    <NumericInput
                                                                                        value={receivedQtys[oi.id] ?? oi.quantityRequested}
                                                                                        onChange={q => setReceivedQtys({ ...receivedQtys, [oi.id]: q })}
                                                                                        className="w-20 px-2 py-1 bg-white dark:bg-[#18181b] border border-accent-orange/50 rounded-lg text-center text-sm font-bold text-slate-900 dark:text-white shadow-sm focus:outline-none focus:ring-1 focus:ring-accent-orange/50"
                                                                                    />
                                                                                </div>
                                                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <label className="text-[8px] font-bold text-slate-500 uppercase flex-1 text-right">Cost:</label>
                                                                                        <NumericInput
                                                                                            decimal
                                                                                            value={receivedPrices[oi.id]?.cost ?? 0}
                                                                                            onChange={cost => setReceivedPrices({
                                                                                                ...receivedPrices,
                                                                                                [oi.id]: { ...receivedPrices[oi.id], cost }
                                                                                            })}
                                                                                            className="w-16 px-1 py-1 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-white/10 rounded-lg text-center text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-accent-purple"
                                                                                        />
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <label className="text-[8px] font-bold text-slate-500 uppercase flex-1 text-right">Standard:</label>
                                                                                        <NumericInput
                                                                                            decimal
                                                                                            value={receivedPrices[oi.id]?.price_standard ?? 0}
                                                                                            onChange={price_standard => setReceivedPrices({
                                                                                                ...receivedPrices,
                                                                                                [oi.id]: { ...receivedPrices[oi.id], price_standard }
                                                                                            })}
                                                                                            className="w-16 px-1 py-1 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-white/10 rounded-lg text-center text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-accent-purple"
                                                                                        />
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <label className="text-[8px] font-bold text-slate-500 uppercase flex-1 text-right">Hospital:</label>
                                                                                        <NumericInput
                                                                                            decimal
                                                                                            value={receivedPrices[oi.id]?.price_hospital ?? 0}
                                                                                            onChange={price_hospital => setReceivedPrices({
                                                                                                ...receivedPrices,
                                                                                                [oi.id]: { ...receivedPrices[oi.id], price_hospital }
                                                                                            })}
                                                                                            className="w-16 px-1 py-1 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-white/10 rounded-lg text-center text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-accent-purple"
                                                                                        />
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <label className="text-[8px] font-bold text-slate-500 uppercase flex-1 text-right">Hotel:</label>
                                                                                        <NumericInput
                                                                                            decimal
                                                                                            value={receivedPrices[oi.id]?.price_hotel ?? 0}
                                                                                            onChange={price_hotel => setReceivedPrices({
                                                                                                ...receivedPrices,
                                                                                                [oi.id]: { ...receivedPrices[oi.id], price_hotel }
                                                                                            })}
                                                                                            className="w-16 px-1 py-1 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-white/10 rounded-lg text-center text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-accent-purple"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono mt-1 pt-2 border-t border-slate-200 dark:border-white/5 w-full">
                                                                        <span>REQ QTY: {oi.quantityRequested}</span>
                                                                        {!isReceiving && <span className="text-slate-400">WAITING</span>}
                                                                        {isReceiving && (receivedQtys[oi.id] ?? oi.quantityRequested) !== oi.quantityRequested && (
                                                                            <span className="text-accent-pink font-bold flex items-center gap-1"><ArrowRight className="w-3 h-3" /> Variance detected</span>
                                                                        )}
                                                                        {isReceiving && (receivedQtys[oi.id] ?? oi.quantityRequested) === oi.quantityRequested && (
                                                                            <span className="text-accent-green font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Match</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {isReceiving && (
                                                        <div className="flex justify-end gap-3 pt-4">
                                                            <button onClick={() => setReceivingOrderId(null)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-xl transition-all border border-slate-300 dark:border-white/10">Cancel</button>
                                                            <button onClick={() => handleCompleteReceipt(order.id)} disabled={isPending} className="px-6 py-2 bg-accent-orange hover:bg-accent-orange/90 text-white text-xs font-bold rounded-xl transition-all shadow-lg flex items-center gap-2">
                                                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Complete & Store Check-In
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </motion.div>
                )}

                {activeTab === "HISTORY" && (
                    <motion.div key="HISTORY" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                        <div className="relative mb-6 max-w-sm">
                            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                value={historySearchQuery}
                                onChange={e => setHistorySearchQuery(e.target.value)}
                                placeholder="Search past orders..."
                                className="w-full pl-11 pr-4 py-2.5 bg-slate-100 dark:bg-black/40 border border-slate-300 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-all"
                            />
                        </div>

                        <div className="glass-panel border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden relative">
                            <div className="overflow-x-auto scroll-fade-right custom-scrollbar">
                                <table className="w-full text-left border-collapse min-w-[900px]">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-400 font-bold bg-slate-50 dark:bg-black/20 tracking-wider">
                                            <th className="px-3 py-3 md:px-6 md:py-4 uppercase">PO Number</th>
                                            <th className="px-3 py-3 md:px-6 md:py-4 uppercase">Destination</th>
                                            <th className="px-3 py-3 md:px-6 md:py-4 uppercase">Items Received</th>
                                            <th className="px-3 py-3 md:px-6 md:py-4 uppercase">Status</th>
                                            <th className="px-3 py-3 md:px-6 md:py-4 uppercase text-right">Completion Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                                        {filteredHistory.map(o => {
                                            const totalItems = o.Items.reduce((a: number, c: any) => a + c.quantityReceived, 0);
                                            return (
                                                <tr key={o.id} onClick={() => setSelectedHistoryOrder(o)} className="group hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 cursor-pointer">
                                                    <td className="px-3 py-3 md:px-6 md:py-4 font-mono text-xs md:text-sm text-slate-900 dark:text-white font-medium">PO-{o.id.toString().padStart(4, '0')}</td>
                                                    <td className="px-3 py-3 md:px-6 md:py-4">
                                                        <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/5 flex items-center gap-2 w-max">
                                                            <Store className="w-3.5 h-3.5 text-slate-500" /> {o.warehouse.name}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 md:px-6 md:py-4 text-xs md:text-sm font-mono text-slate-600 dark:text-slate-400">{totalItems} units</td>
                                                    <td className="px-3 py-3 md:px-6 md:py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-widest border ${o.status === "COMPLETED" ? "bg-accent-green/10 text-accent-green border-accent-green/20" : "bg-accent-pink/10 text-accent-pink border-accent-pink/20"}`}>
                                                            {o.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 md:px-6 md:py-4 text-right text-xs md:text-sm font-mono text-slate-500 dark:text-slate-400">
                                                        {o.completedAt ? `${formatSaudiDate(o.completedAt)} ${formatSaudiTime(o.completedAt, { hour: '2-digit', minute: '2-digit' })}` : "--"}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        {filteredHistory.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-slate-600 dark:text-slate-400 text-xs md:text-sm">
                                                    No past orders or invoices found.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* History Order Details Modal */}
                        {selectedHistoryOrder && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-[2rem] p-6 lg:p-10 w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
                                    <div className="flex items-start justify-between mb-6 shrink-0">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest border rounded-lg ${selectedHistoryOrder.status === "COMPLETED" ? "bg-accent-green/10 text-accent-green border-accent-green/20" : "bg-accent-pink/10 text-accent-pink border-accent-pink/20"}`}>
                                                    {selectedHistoryOrder.status}
                                                </span>
                                                <p className="font-mono text-slate-500">PO-{selectedHistoryOrder.id.toString().padStart(4, '0')}</p>
                                            </div>
                                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                <Store className="w-6 h-6 text-slate-400" /> {selectedHistoryOrder.warehouse.name}
                                            </h3>
                                            <p className="text-sm text-slate-500 mt-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 font-mono">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Ordered: {formatSaudiDate(selectedHistoryOrder.createdAt)} {formatSaudiTime(selectedHistoryOrder.createdAt, { hour: '2-digit', minute: '2-digit' })}</span>
                                                {selectedHistoryOrder.completedAt && (
                                                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Handled: {formatSaudiDate(selectedHistoryOrder.completedAt)} {formatSaudiTime(selectedHistoryOrder.completedAt, { hour: '2-digit', minute: '2-digit' })}</span>
                                                )}
                                            </p>
                                        </div>
                                        <button onClick={() => setSelectedHistoryOrder(null)} className="p-2 -mr-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full">
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>

                                    <div className="overflow-y-auto pr-2 custom-scrollbar">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-200 dark:border-white/10 text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">
                                                    <th className="py-3 px-2">Item</th>
                                                    <th className="py-3 px-2 text-center">Req Qty</th>
                                                    <th className="py-3 px-2 text-center">Rcvd Qty</th>
                                                    <th className="py-3 px-2 text-right">Cost/Unit</th>
                                                    <th className="py-3 px-2 text-right">Total Line</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                {selectedHistoryOrder.Items.map((oi: any) => (
                                                    <tr key={oi.id}>
                                                        <td className="py-4 px-2">
                                                            <p className="text-sm font-bold text-slate-900 dark:text-white">{oi.item.name}</p>
                                                            <p className="text-[10px] font-mono text-slate-500 mt-1">#{oi.item.sku} • {oi.item.category || "Uncategorized"}</p>
                                                        </td>
                                                        <td className="py-4 px-2 text-center text-sm font-mono text-slate-600 dark:text-slate-400">{oi.quantityRequested}</td>
                                                        <td className="py-4 px-2 text-center text-sm font-mono font-bold text-slate-900 dark:text-white">{oi.quantityReceived}</td>
                                                        <td className="py-4 px-2 text-right text-sm font-mono text-slate-600 dark:text-slate-400">{formatCurrency(oi.costPerUnit)}</td>
                                                        <td className="py-4 px-2 text-right text-sm font-bold font-mono text-slate-900 dark:text-white">{formatCurrency(oi.costPerUnit * oi.quantityReceived)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-white/10 flex justify-between items-center shrink-0">
                                        <p className="text-slate-500 text-sm font-medium">Total Received Value</p>
                                        <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                                            {formatCurrency(selectedHistoryOrder.Items.reduce((acc: number, oi: any) => acc + (oi.costPerUnit * oi.quantityReceived), 0))}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Printable Invoice Container */}
            <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[9999] print:p-8">
                {printingOrder && (
                    <div className="max-w-4xl mx-auto text-black">
                        <div className="flex justify-between items-start border-b-2 border-black pb-6 mb-8">
                            <div>
                                <h1 className="text-4xl font-black uppercase tracking-tighter">Purchase Order</h1>
                                <p className="text-lg font-mono font-bold mt-2">PO-{printingOrder.id.toString().padStart(4, '0')}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-xl uppercase tracking-widest mb-1">Company Vending</p>
                                <p className="text-sm font-medium">Destination: {printingOrder.warehouse.name}</p>
                                <p className="text-sm font-medium text-slate-500">PO Date: {formatSaudiDate(printingOrder.createdAt)}</p>
                            </div>
                        </div>

                        <table className="w-full text-left border-collapse border border-black mb-16">
                            <thead>
                                <tr className="border-b border-black bg-slate-100 uppercase text-xs font-bold tracking-widest">
                                    <th className="p-3 border-r border-black">Item Name</th>
                                    <th className="p-3 border-r border-black">SKU</th>
                                    <th className="p-3 border-r border-black">Category</th>
                                    <th className="p-3 border-r border-black hidden sm:table-cell">Bulk Format</th>
                                    <th className="p-3 text-center w-24">Req Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/20">
                                {printingOrder.Items.map((oi: any) => (
                                    <tr key={oi.id} className="text-sm group hover:bg-slate-50">
                                        <td className="p-3 border-r border-black font-semibold">{oi.item.name}</td>
                                        <td className="p-3 border-r border-black font-mono text-slate-600">{oi.item.sku}</td>
                                        <td className="p-3 border-r border-black text-slate-600">{oi.item.category || "-"}</td>
                                        <td className="p-3 border-r border-black text-slate-600 hidden sm:table-cell">{oi.item.bulk_format || "-"}</td>
                                        <td className="p-3 text-center font-black text-lg">{oi.quantityRequested}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="grid grid-cols-2 gap-12 text-sm mt-auto pb-8 pt-8 border-t-2 border-black border-dashed">
                            <div>
                                <p className="font-bold uppercase tracking-wider mb-8 text-slate-500">Prepared By</p>
                                <div className="border-b border-black w-full pb-1">
                                    <span className="text-slate-400 text-xs">Signature & Date</span>
                                </div>
                            </div>
                            <div>
                                <p className="font-bold uppercase tracking-wider mb-8 text-slate-500">Received By</p>
                                <div className="border-b border-black w-full pb-1">
                                    <span className="text-slate-400 text-xs">Signature & Date</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                isDestructive={confirmModal.action === "CANCEL"}
                title={confirmModal.action === "CANCEL" ? "Cancel Purchase Order" : "Complete Stock Check-In"}
                message={
                    confirmModal.action === "CANCEL"
                        ? "Are you sure you want to cancel this order? This action cannot be undone."
                        : "Are you sure you want to finalize this receipt? This action cannot be undone."
                }
                confirmText={confirmModal.action === "CANCEL" ? "Yes, Cancel Order" : "Confirm Receipt"}
                onConfirm={executeConfirmAction}
                onCancel={() => setConfirmModal({ isOpen: false, action: null })}
            />
        </>
    );
}

function WarehouseDropdown({ warehouses, selected, onChange }: { warehouses: Warehouse[], selected: number | "", onChange: (val: number | "") => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedWarehouse = warehouses.find(w => w.id === selected);

    return (
        <div className="relative text-left">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-slate-100 dark:bg-white/5 border ${isOpen ? 'border-accent-purple shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:border-white/20'} rounded-xl px-4 py-3 flex items-center justify-between text-slate-900 dark:text-white focus:outline-none transition-all font-medium gap-3`}
            >
                <span className={`truncate flex-1 text-left ${selectedWarehouse ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                    {selectedWarehouse ? selectedWarehouse.name : '-- Choose Origin Warehouse --'}
                </span>
                <ChevronDown className={`w-5 h-5 text-slate-500 dark:text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180 text-accent-purple' : ''}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-2xl z-[50]"
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
                                    className={`w-full text-left px-5 py-3 hover:bg-accent-purple/10 transition-colors ${selected === w.id ? 'text-accent-purple bg-accent-purple/5' : 'text-slate-900 dark:text-white'}`}
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
