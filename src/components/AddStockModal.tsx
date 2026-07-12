"use client";

import { useState, useTransition } from "react";
import { X, Search, Plus, Save, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { createWarehouseItem, updateWarehouseItemStock } from "@/actions/inventory";
import { NumericInput } from "@/components/NumericInput";
import type { WarehouseType, WarehouseWithItem } from "@/types";
import type { Item } from "@prisma/client";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    warehouses: WarehouseType[];
    existingItems: Item[];
    inventory: WarehouseWithItem[]; // All stock entries to check location
    selectedWarehouseId: number | "all";
};

export default function AddStockModal({ isOpen, onClose, warehouses, existingItems, inventory, selectedWarehouseId }: Props) {
    const [isPending, startTransition] = useTransition();

    // Mode: "NEW" (create brand new item) or "EXISTING" (search and add stock to an existing item)
    const [mode, setMode] = useState<"NEW" | "EXISTING">("EXISTING");
    const [searchQuery, setSearchQuery] = useState("");

    // Form data
    const [warehouseId, setWarehouseId] = useState<number>(selectedWarehouseId === "all" ? (warehouses[0]?.id || 0) : selectedWarehouseId);
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [quantityToAdd, setQuantityToAdd] = useState<number>(0);

    // New item form exclusively
    const [newItemForm, setNewItemForm] = useState({
        name: "",
        category: "",
        sku: "",
        price: 0,
        bulk_format: ""
    });

    if (!isOpen) return null;

    // Logic: Only show items that ALREADY exist in the selected warehouse
    const itemsInSelectedWarehouse = inventory
        .filter(inv => inv.warehouseId === warehouseId)
        .map(inv => inv.itemId);

    const filteredItems = existingItems.filter(item => {
        return item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    }).slice(0, 5);

    const handleSave = () => {
        if (!warehouseId) {
            toast.error("Please select a valid warehouse.");
            return;
        }

        const isItemAllowedInWarehouse = itemsInSelectedWarehouse.includes(selectedItemId || -1);

        startTransition(async () => {
            let result;
            if (mode === "EXISTING") {
                if (!selectedItemId) {
                    toast.error("Please select an item to restock.");
                    return;
                }

                if (!isItemAllowedInWarehouse) {
                    const item = existingItems.find(i => i.id === selectedItemId);
                    const itemLocations = inventory
                        .filter(inv => inv.itemId === selectedItemId)
                        .map(inv => inv.warehouse?.name)
                        .filter(Boolean);

                    toast.error(`Cannot add to this warehouse: "${item?.name}" is currently stored in ${itemLocations.join(", ") || 'another location'}. Please select the correct warehouse.`);
                    return;
                }

                if (quantityToAdd <= 0) {
                    toast.error("Quantity must be greater than zero.");
                    return;
                }

                result = await updateWarehouseItemStock(warehouseId, selectedItemId, quantityToAdd);
            } else {
                // New Item Mode
                if (!newItemForm.name || !newItemForm.sku) {
                    toast.error("Name and Item Code are required.");
                    return;
                }

                result = await createWarehouseItem(
                    warehouseId,
                    newItemForm.name,
                    newItemForm.category,
                    newItemForm.sku,
                    newItemForm.price,
                    newItemForm.price, // hospital fallback
                    newItemForm.price, // hotel fallback
                    quantityToAdd,
                    newItemForm.bulk_format
                );
            }

            if (result?.success) {
                toast.success("Stock updated successfully");
                onClose();
            } else {
                toast.error(result?.error || "An error occurred");
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
                        className="relative bg-[#0a0a0b] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Receive Stock</h2>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Register new items or top-up existing inventory</p>
                            </div>
                            <button onClick={onClose} className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-white/5 hover:text-slate-900 dark:hover:text-white rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                            {/* Warehouse Selection */}
                            <div>
                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 flex items-center gap-2 uppercase tracking-wider">
                                    <MapPin className="w-3.5 h-3.5" /> Destination Warehouse
                                </label>
                                <select
                                    className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
                                    value={warehouseId}
                                    onChange={(e) => {
                                        setWarehouseId(parseInt(e.target.value));
                                        setSelectedItemId(null); // Clear selection when warehouse changes
                                    }}
                                >
                                    <option value={0} disabled>Select a location...</option>
                                    {warehouses.map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Mode Toggle with Sliding Bar */}
                            <div className="relative flex bg-black/40 border border-slate-200 dark:border-white/10 p-1 rounded-xl shrink-0">
                                <motion.div
                                    className="absolute inset-y-1 bg-white/10 rounded-lg shadow-sm"
                                    initial={false}
                                    animate={{
                                        x: mode === "EXISTING" ? 0 : "100%",
                                        width: "calc(50% - 4px)"
                                    }}
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                                <button
                                    onClick={() => setMode("EXISTING")}
                                    className={`relative z-10 flex-1 py-2 text-sm font-semibold transition-colors duration-200 ${mode === "EXISTING" ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-500 dark:text-slate-400 dark:text-slate-300"}`}
                                >
                                    Existing Item
                                </button>
                                <button
                                    onClick={() => setMode("NEW")}
                                    className={`relative z-10 flex-1 py-2 text-sm font-semibold transition-colors duration-200 ${mode === "NEW" ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400 hover:text-slate-500 dark:text-slate-400 dark:text-slate-300"}`}
                                >
                                    New Item
                                </button>
                            </div>

                            <AnimatePresence mode="wait">
                                {mode === "EXISTING" ? (
                                    <motion.div
                                        key="existing"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-4"
                                    >
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500 dark:text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Search by name or code..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors"
                                            />
                                        </div>

                                        {searchQuery && (
                                            <div className="bg-black/30 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden divide-y divide-white/5 max-h-[200px] overflow-y-auto">
                                                {filteredItems.map(item => {
                                                    const inCurrent = itemsInSelectedWarehouse.includes(item.id);
                                                    const locations = inventory
                                                        .filter(inv => inv.itemId === item.id)
                                                        .map(inv => inv.warehouse?.name)
                                                        .filter(Boolean);

                                                    return (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => { setSelectedItemId(item.id); setSearchQuery(""); }}
                                                            className={`w-full text-left px-4 py-3 hover:bg-white/[0.02] flex justify-between items-center group transition-colors ${!inCurrent ? 'opacity-60' : ''}`}
                                                        >
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <p className={`text-sm font-bold transition-colors ${inCurrent ? 'text-slate-900 dark:text-white group-hover:text-brand-400' : 'text-slate-600 dark:text-slate-400'}`}>{item.name}</p>
                                                                    {!inCurrent && (
                                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 uppercase font-black tracking-tighter">Other location</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">#{item.sku}</p>
                                                                    {locations.length > 0 && (
                                                                        <p className="text-[9px] text-slate-600 truncate max-w-[150px]">At: {locations.join(", ")}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {inCurrent ? (
                                                                <Plus className="w-4 h-4 text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            ) : (
                                                                <X className="w-4 h-4 text-slate-600" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                                {filteredItems.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">No items found</div>}
                                            </div>
                                        )}

                                        {selectedItemId && (
                                            <div className={`border rounded-xl p-4 flex items-start justify-between ${itemsInSelectedWarehouse.includes(selectedItemId) ? 'bg-brand-500/5 border-brand-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                                                <div className="flex-1">
                                                    <p className={`text-xs font-bold mb-1 uppercase tracking-wider ${itemsInSelectedWarehouse.includes(selectedItemId) ? 'text-brand-400' : 'text-red-400'}`}>
                                                        {itemsInSelectedWarehouse.includes(selectedItemId) ? 'Selected Item' : 'Location Mismatch'}
                                                    </p>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{existingItems.find(i => i.id === selectedItemId)?.name}</p>
                                                    {!itemsInSelectedWarehouse.includes(selectedItemId) && (
                                                        <p className="text-[11px] text-red-500/70 mt-1 leading-tight">
                                                            This item is not registered in the selected warehouse. Please select the correct warehouse or add it as a new item.
                                                        </p>
                                                    )}
                                                </div>
                                                <button onClick={() => setSelectedItemId(null)} className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white underline ml-4">Change</button>
                                            </div>
                                        )}

                                        <div>
                                            <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Quantity to Receive</label>
                                            <NumericInput
                                                value={quantityToAdd}
                                                onChange={setQuantityToAdd}
                                                className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors font-mono"
                                            />
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="new"
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="space-y-4"
                                    >
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="col-span-2">
                                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Item Name</label>
                                                <input
                                                    type="text"
                                                    placeholder="LAYS YELLOW SALT"
                                                    value={newItemForm.name}
                                                    onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                                                    className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Item Code (SKU)</label>
                                                <input
                                                    type="text"
                                                    placeholder="052"
                                                    value={newItemForm.sku}
                                                    onChange={(e) => setNewItemForm({ ...newItemForm, sku: e.target.value })}
                                                    className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Bulk Format</label>
                                                <input
                                                    type="text"
                                                    placeholder="14x1"
                                                    value={newItemForm.bulk_format}
                                                    onChange={(e) => setNewItemForm({ ...newItemForm, bulk_format: e.target.value })}
                                                    className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Category</label>
                                                <input
                                                    type="text"
                                                    placeholder="Chips"
                                                    value={newItemForm.category}
                                                    onChange={(e) => setNewItemForm({ ...newItemForm, category: e.target.value })}
                                                    className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Price (Per Pcs)</label>
                                                <NumericInput
                                                    decimal
                                                    placeholder="1.111"
                                                    value={newItemForm.price}
                                                    onChange={(price) => setNewItemForm({ ...newItemForm, price })}
                                                    className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors font-mono"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="text-xs text-slate-600 dark:text-slate-400 font-bold mb-2 block uppercase tracking-wider">Initial Quantity</label>
                                                <NumericInput
                                                    value={quantityToAdd}
                                                    onChange={setQuantityToAdd}
                                                    className="w-full bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors font-mono"
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-200 dark:border-white/5 flex justify-end gap-3 bg-white/[0.02] shrink-0">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 dark:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isPending || (mode === "EXISTING" && !selectedItemId)}
                                className="flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 dark:text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-500/20 transition-all active:scale-95"
                            >
                                {isPending ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                                Receive Stock
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
