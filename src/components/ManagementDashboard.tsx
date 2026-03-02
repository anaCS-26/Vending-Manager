"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Edit2, Save, X, Settings2, Package, MapPin, Users, Loader2, Search, Store, Activity, Phone, Mail, Info } from "lucide-react";
import { createDriver, updateDriver, deleteDriver, createMachine, updateMachine, deleteMachine, createItem, updateItem, deleteItem } from "@/actions/inventory";
import { createWarehouse, updateWarehouse, deleteWarehouse } from "@/actions/warehouses";
import { formatCurrency } from "@/lib/utils";
import { ConfirmModal } from "./ConfirmModal";
import AddressAutocomplete from "./AddressAutocomplete";

type Driver = { id: number; name: string; phone?: string | null; email?: string | null; };
type Machine = { id: number; location_name: string; district: string; address?: string | null; notes?: string | null; terminalId?: string | null; };
type ItemWithWarehouse = {
    id: number;
    name: string;
    sku: string;
    category: string;
    price: number;
    bulk_format?: string | null;
    WarehouseStock: {
        quantity_on_hand: number;
        warehouse: { name: string };
    }[]
};
type WarehouseType = {
    id: number;
    name: string;
    location: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
};

type Props = {
    drivers: Driver[];
    machines: Machine[];
    warehouses: WarehouseType[];
    items: ItemWithWarehouse[];
};

export default function ManagementDashboard({ drivers, machines, warehouses, items }: Props) {
    const [activeTab, setActiveTab] = useState<"drivers" | "machines" | "items" | "warehouses">("items");
    const [isPending, startTransition] = useTransition();

    // Generic state for "adding new" modes
    const [isAdding, setIsAdding] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Edit states
    const [editingId, setEditingId] = useState<number | null>(null);

    // Delete Modal state
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: number | null; type: 'driver' | 'machine' | 'item' | 'warehouse' | null }>({ isOpen: false, id: null, type: null });

    const triggerDelete = (id: number, type: 'driver' | 'machine' | 'item' | 'warehouse') => {
        setDeleteModal({ isOpen: true, id, type });
    };

    const confirmDelete = () => {
        if (!deleteModal.id) return;
        if (deleteModal.type === 'driver') {
            startTransition(async () => {
                const res = await deleteDriver(deleteModal.id!);
                if (res.success) toast.success("Driver deleted");
                else toast.error(res.error);
            });
        } else if (deleteModal.type === 'machine') {
            startTransition(async () => {
                const res = await deleteMachine(deleteModal.id!);
                if (res.success) toast.success("Machine deleted");
                else toast.error(res.error);
            });
        } else if (deleteModal.type === 'item') {
            startTransition(async () => {
                const res = await deleteItem(deleteModal.id!);
                if (res.success) toast.success("Item deleted");
                else toast.error(res.error);
            });
        } else if (deleteModal.type === 'warehouse') {
            startTransition(async () => {
                const res = await deleteWarehouse(deleteModal.id!);
                if (res.success) toast.success("Warehouse deleted");
                else toast.error(res.error);
            });
        }
    }

    // Forms
    const [driverForm, setDriverForm] = useState({ name: "", phone: "", email: "" });
    const [machineForm, setMachineForm] = useState({ location_name: "", district: "", address: "", notes: "", terminalId: "", latitude: undefined as number | undefined, longitude: undefined as number | undefined });
    const [itemForm, setItemForm] = useState({ name: "", category: "", sku: "", price: 0, bulk_format: "", warehouseId: undefined as number | undefined, initialStock: 0 });
    const [warehouseForm, setWarehouseForm] = useState({ name: "", location: "", address: "", latitude: undefined as number | undefined, longitude: undefined as number | undefined });

    // Reset forms when switching tabs or canceling
    const resetForms = () => {
        setIsAdding(false);
        setEditingId(null);
        setDriverForm({ name: "", phone: "", email: "" });
        setMachineForm({ location_name: "", district: "", address: "", notes: "", terminalId: "", latitude: undefined, longitude: undefined });
        setItemForm({ name: "", category: "", sku: "", price: 0, bulk_format: "", warehouseId: undefined, initialStock: 0 });
        setWarehouseForm({ name: "", location: "", address: "", latitude: undefined, longitude: undefined });
    };

    const handleTabChange = (tab: "drivers" | "machines" | "items" | "warehouses") => {
        resetForms();
        setSearchQuery("");
        setActiveTab(tab);
    }

    // --- DRIVER HANDLERS ---
    const handleSaveDriver = (id?: number) => {
        startTransition(async () => {
            let res;
            if (id) res = await updateDriver(id, driverForm.name, driverForm.phone, driverForm.email);
            else res = await createDriver(driverForm.name, driverForm.phone, driverForm.email);

            if (res.success) {
                toast.success(`Driver ${id ? 'updated' : 'added'} successfully`);
                resetForms();
            } else toast.error(res.error);
        });
    };

    const handleDeleteDriver = (id: number) => {
        triggerDelete(id, 'driver');
    };

    // --- MACHINE HANDLERS ---
    const handleSaveMachine = (id?: number) => {
        startTransition(async () => {
            let res;
            if (id) res = await updateMachine(id, machineForm.location_name, machineForm.district, machineForm.address, machineForm.notes, machineForm.latitude, machineForm.longitude, machineForm.terminalId || undefined);
            else res = await createMachine(machineForm.location_name, machineForm.district, machineForm.address, machineForm.notes, machineForm.latitude, machineForm.longitude, machineForm.terminalId || undefined);

            if (res.success) {
                toast.success(`Machine ${id ? 'updated' : 'added'} successfully`);
                resetForms();
            } else toast.error(res.error);
        });
    };

    const handleDeleteMachine = (id: number) => {
        triggerDelete(id, 'machine');
    };

    // --- ITEM HANDLERS ---
    const handleSaveItem = (id?: number) => {
        startTransition(async () => {
            let res;
            if (id) res = await updateItem(id, itemForm.name, itemForm.category, itemForm.sku, itemForm.price, itemForm.bulk_format);
            else res = await createItem(itemForm.name, itemForm.category, itemForm.sku, itemForm.price, itemForm.warehouseId, itemForm.initialStock, itemForm.bulk_format);

            if (res.success) {
                toast.success(`Item ${id ? 'updated' : 'added'} successfully`);
                resetForms();
            } else toast.error(res.error);
        });
    };

    const handleDeleteItem = (id: number) => {
        triggerDelete(id, 'item');
    };

    // --- WAREHOUSE HANDLERS ---
    const handleSaveWarehouse = (id?: number) => {
        startTransition(async () => {
            let res;
            if (id) res = await updateWarehouse(id, warehouseForm);
            else res = await createWarehouse(warehouseForm);

            if (res.success) {
                toast.success(`Warehouse ${id ? 'updated' : 'added'} successfully`);
                resetForms();
            } else toast.error(res.error);
        });
    };

    const handleDeleteWarehouse = (id: number) => {
        triggerDelete(id, 'warehouse');
    };

    const filteredItems = items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.sku.toLowerCase().includes(searchQuery.toLowerCase()) || i.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredMachines = machines.filter(m => m.location_name.toLowerCase().includes(searchQuery.toLowerCase()) || m.district.toLowerCase().includes(searchQuery.toLowerCase()) || (m.address || "").toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredDrivers = drivers.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredWarehouses = warehouses.filter(w => w.name.toLowerCase().includes(searchQuery.toLowerCase()) || (w.address || "").toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-6 lg:p-8 relative">
            {/* Header / Search Controls */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-8 relative z-10">
                <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 dark:bg-black/40 rounded-2xl w-fit border border-slate-200 dark:border-white/10 relative z-10">
                    {(["items", "machines", "drivers", "warehouses"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => handleTabChange(tab)}
                            className={`relative px-6 py-2.5 rounded-xl text-sm font-bold transition-colors ${activeTab === tab ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white"
                                }`}
                        >
                            {activeTab === tab && (
                                <motion.div
                                    layoutId="manage-tab-bg"
                                    className="absolute inset-0 bg-white/10 rounded-xl border border-slate-200 dark:border-white/10"
                                    initial={false}
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <span className="relative z-10 capitalize flex items-center gap-2">
                                {tab === "items" && <Package className="w-4 h-4" />}
                                {tab === "machines" && <MapPin className="w-4 h-4" />}
                                {tab === "drivers" && <Users className="w-4 h-4" />}
                                {tab === "warehouses" && <Store className="w-4 h-4" />}
                                {tab}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Global Search Bar */}
                <div className="w-full lg:w-72 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 flex items-center gap-2 focus-within:border-brand-500/50 focus-within:shadow-[0_0_15px_rgba(59,130,246,0.15)] transition-all">
                    <Search className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={`Search ${activeTab}...`}
                        className="bg-transparent border-none outline-none text-sm text-slate-900 dark:text-white w-full placeholder:text-slate-500 dark:text-slate-400"
                    />
                </div>
            </div>

            <div className="relative z-10 min-h-[400px]">
                {/* ITEMS TAB */}
                {activeTab === "items" && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Product Catalog</h2>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Manage snack and beverage inventory across all warehouses.</p>
                            </div>
                            {!isAdding && (
                                <button onClick={() => { resetForms(); setIsAdding(true); }} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                                    <Plus className="w-4 h-4" /> Add Item
                                </button>
                            )}
                        </div>

                        {isAdding && (
                            <div className="bg-slate-100 dark:bg-white/5 border border-brand-500/30 p-6 rounded-[2rem] mb-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                                    <div className="lg:col-span-2">
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Product Name</label>
                                        <input type="text" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Lays Yellow Salt" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">SKU</label>
                                        <input type="text" value={itemForm.sku} onChange={e => setItemForm({ ...itemForm, sku: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="052" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Bulk Format</label>
                                        <input type="text" value={itemForm.bulk_format} onChange={e => setItemForm({ ...itemForm, bulk_format: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="14x1" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Category</label>
                                        <input type="text" value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Snack" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Unit Price</label>
                                        <input type="number" step="0.01" value={itemForm.price} onChange={e => setItemForm({ ...itemForm, price: parseFloat(e.target.value) || 0 })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Initial Warehouse</label>
                                        <select
                                            value={itemForm.warehouseId || ""}
                                            onChange={e => setItemForm({ ...itemForm, warehouseId: e.target.value ? parseInt(e.target.value) : undefined })}
                                            className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none appearance-none"
                                        >
                                            <option value="">None / Floating</option>
                                            {warehouses.map(w => (
                                                <option key={w.id} value={w.id}>{w.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Starting Stock</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={itemForm.initialStock}
                                            onChange={e => setItemForm({ ...itemForm, initialStock: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none disabled:opacity-30"
                                            disabled={!itemForm.warehouseId}
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setIsAdding(false)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors">Cancel</button>
                                    <button onClick={() => handleSaveItem()} disabled={isPending || !itemForm.name || !itemForm.sku} className="flex items-center gap-2 px-6 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                                        {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Finish & Save
                                    </button>
                                </div>
                            </div>
                        )}

                        {filteredItems.length === 0 ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center border-dashed col-span-full"><Package className="w-12 h-12 text-slate-500 dark:text-slate-400 opacity-30 mb-4" /><h3 className="text-slate-900 dark:text-white font-bold mb-1">No Items Found</h3><p className="text-slate-600 dark:text-slate-400 text-sm">Add products to your catalog to start managing stock.</p></motion.div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredItems.map(item => (
                                    <div key={item.id} className="bg-white dark:bg-black/20 border border-slate-300 shadow-sm dark:border-white/10 rounded-2xl p-5 hover:border-slate-400 dark:hover:border-white/20 transition-colors group">
                                        {editingId === item.id ? (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Item Name</label>
                                                    <input type="text" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Name" />
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">SKU</label>
                                                        <input type="text" value={itemForm.sku} onChange={e => setItemForm({ ...itemForm, sku: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="SKU" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Bulk</label>
                                                        <input type="text" value={itemForm.bulk_format} onChange={e => setItemForm({ ...itemForm, bulk_format: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="14x1" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Price</label>
                                                        <input type="number" step="0.01" value={itemForm.price} onChange={e => setItemForm({ ...itemForm, price: parseFloat(e.target.value) || 0 })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Price" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Category</label>
                                                    <input type="text" value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Category" />
                                                </div>
                                                <div className="flex gap-2 pt-2">
                                                    <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-xs font-medium transition-colors">Cancel</button>
                                                    <button onClick={() => handleSaveItem(item.id)} disabled={isPending} className="flex-1 py-1.5 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50">Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0">
                                                            <Package className="w-5 h-5" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <h3 className="font-bold text-base text-slate-900 dark:text-white leading-tight truncate">{item.name}</h3>
                                                                {item.category && (
                                                                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full border border-slate-200 dark:border-white/5 flex-shrink-0">{item.category}</span>
                                                                )}
                                                            </div>


                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">SKU</span>
                                                                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 dark:text-slate-300">{item.sku}</span>
                                                                </div>
                                                                <span className="text-slate-700 hidden sm:inline">•</span>
                                                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">Price</span>
                                                                    <span className="text-[11px] text-brand-400 font-bold">{formatCurrency(item.price)}</span>
                                                                </div>
                                                                {(item as any).bulk_format && (
                                                                    <>
                                                                        <span className="text-slate-700 hidden sm:inline">•</span>
                                                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">Bulk</span>
                                                                            <span className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-300 font-bold">{(item as any).bulk_format}</span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
                                                        <button onClick={() => { setEditingId(item.id); setItemForm({ name: item.name, sku: item.sku, category: item.category, price: item.price, bulk_format: (item as any).bulk_format || "", warehouseId: undefined, initialStock: 0 }); }} className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 hover:bg-white/10 rounded-md transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-accent-pink bg-slate-100 dark:bg-white/5 hover:bg-accent-pink/20 rounded-md transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>

                                                {/* Stock Breakdown with improved visual labels */}
                                                <div className="pt-4 mt-2 border-t border-slate-200 dark:border-white/5 space-y-2">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Storage & Inventory</span>
                                                    </div>
                                                    {item.WarehouseStock.length > 0 ? (
                                                        item.WarehouseStock.map((ws, index) => (
                                                            <div key={index} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-slate-200 dark:border-white/5">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                                                    <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-300 font-bold">{ws.warehouse.name}</span>
                                                                </div>
                                                                <div className="flex items-end gap-1.5">
                                                                    <span className="text-base font-bold text-slate-900 dark:text-white font-mono leading-none">{ws.quantity_on_hand}</span>
                                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase mb-0.5">Units</span>
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-slate-200 dark:border-white/5 border-dashed">
                                                            <span className="text-xs text-slate-500 dark:text-slate-400 italic">No inventory tracked yet</span>
                                                            <span className="text-sm font-bold text-slate-600 font-mono">0</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* MACHINES TAB */}
                {activeTab === "machines" && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Machine Locations</h2>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Manage your active vending points and terminal IDs.</p>
                            </div>
                            {!isAdding && (
                                <button onClick={() => { resetForms(); setIsAdding(true); }} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_25px_rgba(59,130,246,0.4)]">
                                    <Plus className="w-4 h-4" /> Add Machine
                                </button>
                            )}
                        </div>

                        {isAdding && (
                            <div className="bg-slate-100 dark:bg-white/5 border border-brand-500/30 p-6 rounded-[2rem] mb-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Location Name</label>
                                        <input type="text" value={machineForm.location_name} onChange={e => setMachineForm({ ...machineForm, location_name: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Floor 1 Lobby" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">District</label>
                                        <input type="text" value={machineForm.district} onChange={e => setMachineForm({ ...machineForm, district: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Downtown / East Side" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Terminal ID (Nayax/Local)</label>
                                        <input type="text" value={machineForm.terminalId} onChange={e => setMachineForm({ ...machineForm, terminalId: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="ID-12345" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Driver Notes</label>
                                        <input type="text" value={machineForm.notes} onChange={e => setMachineForm({ ...machineForm, notes: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Key is with reception" />
                                    </div>
                                    <div className="col-span-full">
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Full Physical Address</label>
                                        <AddressAutocomplete value={machineForm.address} onChange={(address, lat, lon) => setMachineForm({ ...machineForm, address, latitude: lat, longitude: lon })} />
                                    </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setIsAdding(false)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors">Cancel</button>
                                    <button onClick={() => handleSaveMachine()} disabled={isPending || !machineForm.location_name} className="flex items-center gap-2 px-6 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                                        {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Finish & Save
                                    </button>
                                </div>
                            </div>
                        )}

                        {machines.length === 0 ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center border-dashed"><MapPin className="w-12 h-12 text-slate-500 dark:text-slate-400 opacity-30 mb-4" /><h3 className="text-slate-900 dark:text-white font-bold mb-1">No Machines</h3><p className="text-slate-600 dark:text-slate-400 text-sm">Add your first machine to manage inventory.</p></motion.div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {filteredMachines.map(machine => (
                                    <div key={machine.id} className="bg-white dark:bg-black/20 border border-slate-300 shadow-sm dark:border-white/10 rounded-[2rem] p-6 hover:border-slate-400 dark:hover:border-white/20 transition-all group relative">
                                        {editingId === machine.id ? (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input type="text" value={machineForm.location_name} onChange={e => setMachineForm({ ...machineForm, location_name: e.target.value })} className="bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Name" />
                                                    <input type="text" value={machineForm.district} onChange={e => setMachineForm({ ...machineForm, district: e.target.value })} className="bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="District" />
                                                    <input type="text" value={machineForm.terminalId} onChange={e => setMachineForm({ ...machineForm, terminalId: e.target.value })} className="bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Terminal ID" />
                                                    <input type="text" value={machineForm.notes} onChange={e => setMachineForm({ ...machineForm, notes: e.target.value })} className="bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Notes" />
                                                </div>
                                                <AddressAutocomplete value={machineForm.address} onChange={(address, lat, lon) => setMachineForm({ ...machineForm, address, latitude: lat, longitude: lon })} />
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingId(null)} className="flex-1 py-2 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-xs font-medium transition-colors">Cancel</button>
                                                    <button onClick={() => handleSaveMachine(machine.id)} disabled={isPending} className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-lg text-xs font-bold transition-all">Save Changes</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                                                            <Store className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">{machine.location_name}</h3>
                                                            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded border border-slate-200 dark:border-white/5">{machine.district}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => { setEditingId(machine.id); setMachineForm({ location_name: machine.location_name, district: machine.district, address: machine.address || "", notes: machine.notes || "", terminalId: machine.terminalId || "", latitude: undefined, longitude: undefined }) }} className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 hover:bg-white/10 rounded-xl transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteMachine(machine.id)} className="p-2 text-slate-600 dark:text-slate-400 hover:text-accent-pink bg-slate-100 dark:bg-white/5 hover:bg-accent-pink/20 rounded-xl transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 mb-4">
                                                    <div className="p-3 bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl">
                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block mb-1">Terminal ID</span>
                                                        <span className="text-xs font-mono text-brand-400 font-bold">{machine.terminalId || "UNASSIGNED"}</span>
                                                    </div>
                                                    <div className="p-3 bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl">
                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase block mb-1">Status</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 dark:text-slate-300">Active</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="flex items-start gap-2.5">
                                                        <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                                                        <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">{machine.address || "Address not specified"}</span>
                                                    </div>
                                                    {machine.notes && (
                                                        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-brand-500/5 border border-brand-500/10">
                                                            <Info className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                                                            <div>
                                                                <span className="text-[10px] font-bold text-brand-400 uppercase block mb-0.5">Driver Notes</span>
                                                                <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-300 leading-relaxed">{machine.notes}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* DRIVERS TAB */}
                {activeTab === "drivers" && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Route Drivers</h2>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Manage your delivery and maintenance team.</p>
                            </div>
                            {!isAdding && (
                                <button onClick={() => { resetForms(); setIsAdding(true); }} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                                    <Plus className="w-4 h-4" /> Add Driver
                                </button>
                            )}
                        </div>

                        {isAdding && (
                            <div className="bg-slate-100 dark:bg-white/5 border border-brand-500/30 p-6 rounded-[2rem] mb-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div className="col-span-full">
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Full Name</label>
                                        <input type="text" value={driverForm.name} onChange={e => setDriverForm({ ...driverForm, name: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="John Doe" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Phone Number</label>
                                        <input type="tel" value={driverForm.phone} onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="+123..." />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Email Address</label>
                                        <input type="email" value={driverForm.email} onChange={e => setDriverForm({ ...driverForm, email: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="john@example.com" />
                                    </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setIsAdding(false)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors">Cancel</button>
                                    <button onClick={() => handleSaveDriver()} disabled={isPending || !driverForm.name} className="flex items-center gap-2 px-6 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                                        {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save Profile
                                    </button>
                                </div>
                            </div>
                        )}

                        {drivers.length === 0 ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center border-dashed"><Users className="w-12 h-12 text-slate-500 dark:text-slate-400 opacity-30 mb-4" /><h3 className="text-slate-900 dark:text-white font-bold mb-1">No Drivers</h3><p className="text-slate-600 dark:text-slate-400 text-sm">Register your first driver to start assigning dispatches.</p></motion.div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredDrivers.map(driver => (
                                    <div key={driver.id} className="bg-white dark:bg-black/20 border border-slate-300 shadow-sm dark:border-white/10 rounded-[2rem] p-6 hover:border-slate-400 dark:hover:border-white/20 transition-all group relative overflow-hidden">
                                        {editingId === driver.id ? (
                                            <div className="space-y-3">
                                                <input type="text" value={driverForm.name} onChange={e => setDriverForm({ ...driverForm, name: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Name" />
                                                <input type="tel" value={driverForm.phone} onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Phone" />
                                                <input type="email" value={driverForm.email} onChange={e => setDriverForm({ ...driverForm, email: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Email" />
                                                <div className="flex gap-2 pt-1 border-t border-slate-200 dark:border-white/5 mt-2">
                                                    <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-xs font-medium transition-colors">Cancel</button>
                                                    <button onClick={() => handleSaveDriver(driver.id)} disabled={isPending} className="flex-1 py-1.5 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-lg text-xs font-bold transition-all">Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-bold text-lg shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]">
                                                            {driver.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">{driver.name}</h3>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Authorized Personnel</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => { setEditingId(driver.id); setDriverForm({ name: driver.name, phone: driver.phone || "", email: driver.email || "" }) }} className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 hover:bg-white/10 rounded-xl transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteDriver(driver.id)} className="p-2 text-slate-600 dark:text-slate-400 hover:text-accent-pink bg-slate-100 dark:bg-white/5 hover:bg-accent-pink/20 rounded-xl transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>

                                                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-400">
                                                            <Phone className="w-3.5 h-3.5" />
                                                        </div>
                                                        <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-300 font-medium">{driver.phone || "No phone registered"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-400">
                                                            <Mail className="w-3.5 h-3.5" />
                                                        </div>
                                                        <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-300 font-medium truncate">{driver.email || "No email registered"}</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* WAREHOUSES TAB */}
                {activeTab === "warehouses" && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Storage Warehouses</h2>
                                <p className="text-sm text-slate-600 dark:text-slate-400">Manage your distribution hubs and inventory centers.</p>
                            </div>
                            {!isAdding && (
                                <button onClick={() => { resetForms(); setIsAdding(true); }} className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                                    <Plus className="w-4 h-4" /> Add Warehouse
                                </button>
                            )}
                        </div>

                        {isAdding && (
                            <div className="bg-slate-100 dark:bg-white/5 border border-brand-500/30 p-6 rounded-[2rem] mb-8">
                                <div className="grid grid-cols-1 gap-4 mb-4">
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Warehouse Name</label>
                                        <input type="text" value={warehouseForm.name} onChange={e => setWarehouseForm({ ...warehouseForm, name: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="HQ Warehouse / Secondary Hub" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1">Physical Address</label>
                                        <AddressAutocomplete value={warehouseForm.address} onChange={(address, lat, lon) => setWarehouseForm({ ...warehouseForm, address, latitude: lat, longitude: lon })} />
                                    </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => setIsAdding(false)} className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors">Cancel</button>
                                    <button onClick={() => handleSaveWarehouse()} disabled={isPending || !warehouseForm.name} className="flex items-center gap-2 px-6 py-2 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                                        {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save Warehouse
                                    </button>
                                </div>
                            </div>
                        )}

                        {warehouses.length === 0 ? (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel border-slate-200 dark:border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center border-dashed"><Store className="w-12 h-12 text-slate-500 dark:text-slate-400 opacity-30 mb-4" /><h3 className="text-slate-900 dark:text-white font-bold mb-1">No Warehouses</h3><p className="text-slate-600 dark:text-slate-400 text-sm">Create your first storage hub to start tracking inventory.</p></motion.div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredWarehouses.map(warehouse => (
                                    <div key={warehouse.id} className="bg-white dark:bg-black/20 border border-slate-300 shadow-sm dark:border-white/10 rounded-[2rem] p-6 hover:border-slate-400 dark:hover:border-white/20 transition-all group relative">
                                        {editingId === warehouse.id ? (
                                            <div className="space-y-4">
                                                <input type="text" value={warehouseForm.name} onChange={e => setWarehouseForm({ ...warehouseForm, name: e.target.value })} className="w-full bg-white dark:bg-black/50 border border-slate-300 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" placeholder="Name" />
                                                <AddressAutocomplete value={warehouseForm.address} onChange={(address, lat, lon) => setWarehouseForm({ ...warehouseForm, address, latitude: lat, longitude: lon })} />
                                                <div className="flex gap-2 pt-1 border-t border-slate-200 dark:border-white/5 mt-2">
                                                    <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white rounded-lg text-xs font-medium transition-colors">Cancel</button>
                                                    <button onClick={() => handleSaveWarehouse(warehouse.id)} disabled={isPending} className="flex-1 py-1.5 bg-brand-500 hover:bg-brand-600 text-slate-900 dark:text-white rounded-lg text-xs font-bold transition-all">Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                                                            <Package className="w-6 h-6" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-tight">{warehouse.name}</h3>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                                                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Primary Distribution Hub</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => { setEditingId(warehouse.id); setWarehouseForm({ name: warehouse.name, location: warehouse.location || "", address: warehouse.address || "", latitude: warehouse.latitude || undefined, longitude: warehouse.longitude || undefined }) }} className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 hover:bg-white/10 rounded-xl transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                                                        <button onClick={() => handleDeleteWarehouse(warehouse.id)} className="p-2 text-slate-600 dark:text-slate-400 hover:text-accent-pink bg-slate-100 dark:bg-white/5 hover:bg-accent-pink/20 rounded-xl transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex items-start gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-400 flex-shrink-0">
                                                            <MapPin className="w-4 h-4" />
                                                        </div>
                                                        <span className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-300 font-medium leading-relaxed">{warehouse.address || "No address assigned to this hub"}</span>
                                                    </div>

                                                    <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Storage Status</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-slate-900 dark:text-white">In Operation</span>
                                                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title={`Delete ${deleteModal.type === 'driver' ? 'Driver' : deleteModal.type === 'machine' ? 'Machine' : deleteModal.type === 'warehouse' ? 'Warehouse' : 'Item'}?`}
                message={`Are you sure you want to permanently delete this ${deleteModal.type}? ${deleteModal.type === 'item' ? 'This will also delete its warehouse stock.' : deleteModal.type === 'warehouse' ? 'Warning: Items currently in this warehouse will lose their location records.' : 'This cannot be undone.'}`}
                confirmText="Delete"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteModal({ isOpen: false, id: null, type: null })}
            />
        </div>
    );
}
