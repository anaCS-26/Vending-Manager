"use client"
import { useState, useTransition, useEffect } from "react"
import { CheckCircle2, ChevronDown, Package, Plus, MapPin, Zap, Search, Loader2, Save, Camera } from "lucide-react"
import { logBatchRefills, getMachineInventoryDetails, getItems, uploadItemImage } from "@/actions/inventory"
import imageCompression from 'browser-image-compression';
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { ShieldCheck, LogOut } from "lucide-react"
import type { MachineType, DispatchWithRelations, DispatchItemWithItem, RefillLogWithMachine } from "@/types"

import { ThemeToggle } from "@/components/ThemeToggle";

type DriverRefillUIProps = {
    machines: MachineType[];
    activeDispatches: DispatchWithRelations[];
    userRole?: 'admin' | 'driver';
};

type ItemFormState = {
    itemId: number;
    item: any;
    refilled: number;
    expired: number;
    capacity: number;
    bagQuantity: number;
    inBag: boolean;
    estimated_stock: number;
};

export function DriverRefillUI({ machines, activeDispatches, userRole = 'driver' }: DriverRefillUIProps) {
    const [selectedDispatchIndex, setSelectedDispatchIndex] = useState(0)
    const currentDispatch = activeDispatches[selectedDispatchIndex]

    const [selectedMachine, setSelectedMachine] = useState<string>("")
    const [isPending, startTransition] = useTransition()
    const [itemSearch, setItemSearch] = useState("")

    // Complex state for the active machine form
    const [machineItems, setMachineItems] = useState<Record<number, ItemFormState>>({})
    const [isLoadingMachineStock, setIsLoadingMachineStock] = useState(false)
    const [allCatalogItems, setAllCatalogItems] = useState<any[]>([])

    // For visual submission state
    const [isSuccess, setIsSuccess] = useState(false)

    // SSE-based real-time refresh
    useRealtimeRefresh();

    // Fetch Global Catalog once
    useEffect(() => {
        getItems().then(setAllCatalogItems).catch(console.error)
    }, [])

    const getRemainingStock = (itemId: number, given: number) => {
        if (!currentDispatch) return 0;
        const refilled = (currentDispatch.RefillLogs as RefillLogWithMachine[]).filter((r) => r.itemId === itemId).reduce((sum: number, log) => sum + log.quantity_refilled, 0);
        return given - refilled;
    }

    // Initialize list when machine changes
    useEffect(() => {
        if (selectedMachine && currentDispatch) {
            setIsLoadingMachineStock(true)
            getMachineInventoryDetails(parseInt(selectedMachine))
                .then(stocks => {
                    const newState: Record<number, ItemFormState> = {};

                    // Add items already mapped to this machine
                    stocks.forEach(ms => {
                        const bagMatched = currentDispatch.DispatchItems.find(di => di.itemId === ms.itemId);
                        const bagRemaining = bagMatched ? getRemainingStock(bagMatched.itemId, bagMatched.quantity_given) : 0;

                        newState[ms.itemId] = {
                            itemId: ms.itemId,
                            item: ms.item,
                            refilled: 0,
                            expired: 0,
                            capacity: (ms as any).capacity || 10, // Defaults to schema capacity
                            bagQuantity: bagRemaining,
                            inBag: !!bagMatched,
                            estimated_stock: ms.estimated_stock
                        };
                    });

                    // Add items that are in the bag but not structurally present in the machine
                    currentDispatch.DispatchItems.forEach(di => {
                        if (!newState[di.itemId]) {
                            newState[di.itemId] = {
                                itemId: di.itemId,
                                item: di.item,
                                refilled: 0,
                                expired: 0,
                                capacity: 10,
                                bagQuantity: getRemainingStock(di.itemId, di.quantity_given),
                                inBag: true,
                                estimated_stock: 0
                            };
                        }
                    });

                    setMachineItems(newState);
                    setIsLoadingMachineStock(false);
                })
                .catch(err => {
                    console.error("Failed to fetch machine stock", err);
                    setIsLoadingMachineStock(false);
                })
        } else {
            setMachineItems({});
        }
    }, [selectedMachine, currentDispatch])


    if (!currentDispatch) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-neo-bg rounded-3xl min-h-[50vh] relative overflow-hidden border border-slate-200 dark:border-white/5">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    {userRole === 'admin' ? (
                        <Link href="/admin" className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                            <ShieldCheck className="w-5 h-5 text-accent-green" />
                        </Link>
                    ) : (
                        <button onClick={() => signOut({ callbackUrl: '/login' })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                            <LogOut className="w-5 h-5 text-accent-pink" />
                        </button>
                    )}
                    <ThemeToggle />
                </div>
                <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-6 relative z-10 border border-slate-200 dark:border-white/10">
                    <Package className="w-10 h-10 text-slate-600 dark:text-slate-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center tracking-tight leading-tight">No Active<br />Route Assigned</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-4 text-center px-4">Awaiting dispatch assignment from HQ.</p>
            </div>
        )
    }

    const handleBatchSubmit = async () => {
        if (!selectedMachine) return;

        // Find items that were modified (refilled or expired > 0)
        const modifiedItems = Object.values(machineItems).filter(item => item.refilled > 0 || item.expired > 0);

        if (modifiedItems.length === 0) {
            toast.error("No changes made", { description: "You haven't added or expired any stock." });
            return;
        }

        startTransition(async () => {
            const payload = modifiedItems.map(m => ({
                itemId: m.itemId,
                refilled: m.refilled,
                expired: m.expired,
                capacity: m.capacity
            }));

            const result = await logBatchRefills(currentDispatch.id, parseInt(selectedMachine), payload);
            if (result.success) {
                setIsSuccess(true)
                toast.success("Inventory Logs Saved", {
                    description: `${modifiedItems.length} item(s) pushed to HQ.`,
                })
                setTimeout(() => {
                    setIsSuccess(false)
                    setSelectedMachine("")
                }, 1500)
            } else {
                toast.error("Sync Failed", {
                    description: result.error,
                })
            }
        })
    }

    // Handlers
    const updateItem = (id: number, field: keyof ItemFormState, val: any) => {
        setMachineItems(prev => ({
            ...prev,
            [id]: { ...prev[id], [field]: val }
        }));
    };

    const handleFillMax = (id: number) => {
        const row = machineItems[id];
        // Calculate gap based on projected stock = estimated_stock - expired
        // So the amount needed to hit capacity is capacity - projected stock
        const projectedStock = Math.max(0, row.estimated_stock - row.expired);
        const gap = Math.max(0, row.capacity - projectedStock);

        // We can only fill up to what we have in the bag
        const actualFill = Math.min(gap, row.bagQuantity);
        if (actualFill > 0) {
            updateItem(id, 'refilled', actualFill);
        } else {
            // Already full or out of bag stock
            toast.info("Cannot fill to max", { description: row.bagQuantity === 0 ? "You have no remaining stock in your bag." : "Machine is already at calculated capacity." });
        }
    };

    // Add external global item to the row list
    const handleAddGlobalItem = (catalogItem: any) => {
        if (machineItems[catalogItem.id]) {
            toast.info("Item already in view");
            return;
        }

        const bagMatched = currentDispatch.DispatchItems.find(di => di.itemId === catalogItem.id);
        const bagRemaining = bagMatched ? getRemainingStock(bagMatched.itemId, bagMatched.quantity_given) : 0;

        setMachineItems(prev => ({
            ...prev,
            [catalogItem.id]: {
                itemId: catalogItem.id,
                item: catalogItem,
                refilled: 0,
                expired: 0,
                capacity: 10, // Defaults to 10
                bagQuantity: bagRemaining,
                inBag: !!bagMatched,
                estimated_stock: 0
            }
        }));

        setItemSearch("");
    };

    const totalGiven = currentDispatch.DispatchItems.reduce((sum: number, item: DispatchItemWithItem) => sum + item.quantity_given, 0);
    const totalRefilled = (currentDispatch.RefillLogs as RefillLogWithMachine[]).reduce((sum: number, log) => sum + log.quantity_refilled, 0);
    const progressPercent = totalGiven > 0 ? (totalRefilled / totalGiven) * 100 : 0;
    const isComplete = progressPercent === 100;

    return (
        <div className="bg-slate-50 dark:bg-[#121214] min-h-[90vh] sm:rounded-[2.5rem] shadow-2xl shadow-black/50 overflow-hidden relative flex flex-col border-0 sm:border border-slate-200 dark:border-white/10 pb-24">

            {/* Top Header Section */}
            <div className="bg-white/80 dark:bg-black/40 backdrop-blur-3xl pt-10 pb-10 px-8 rounded-b-[2rem] relative z-20 border-b border-slate-200 dark:border-white/10 shrink-0">
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                    {userRole === 'admin' ? (
                        <Link href="/admin" className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10" title="Return to Admin HQ">
                            <ShieldCheck className="w-5 h-5 text-accent-green" />
                        </Link>
                    ) : (
                        <button onClick={() => signOut({ callbackUrl: '/login' })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10" title="Sign Out">
                            <LogOut className="w-5 h-5 text-accent-pink" />
                        </button>
                    )}
                    <ThemeToggle />
                </div>

                <p className="text-accent-blue text-xs font-semibold mb-2 flex items-center gap-2 uppercase tracking-wider">
                    <Zap className="w-3 h-3 text-accent-blue" />
                    Route {isComplete ? 'Complete' : 'Active'}
                </p>

                {userRole === 'admin' && activeDispatches.length > 1 ? (
                    <select
                        className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-4 bg-transparent border-b border-slate-300 dark:border-slate-600 focus:outline-none focus:border-accent-blue cursor-pointer"
                        value={selectedDispatchIndex}
                        onChange={(e) => setSelectedDispatchIndex(Number(e.target.value))}
                    >
                        {activeDispatches.map((d, index) => (
                            <option key={d.id} value={index} className="text-sm font-medium text-slate-900 dark:text-white bg-slate-100 dark:bg-[#121214]">
                                {d.driver.name} (Dispatch #{d.id})
                            </option>
                        ))}
                    </select>
                ) : (
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-4">{currentDispatch.driver.name}</h1>
                )}

                {/* Animated Progress Bar */}
                <div className="h-1.5 bg-slate-200 dark:bg-white/10 w-full rounded-full overflow-hidden relative mt-4">
                    <motion.div
                        className={`absolute top-0 left-0 h-full rounded-full ${isComplete ? 'bg-accent-blue' : 'bg-accent-green'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ type: "spring", bounce: 0, duration: 1.5 }}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-6 relative z-10 custom-scrollbar">

                {/* Machine Selection Bar */}
                <div className="mb-6 relative z-50 sticky top-0 bg-slate-50/90 dark:bg-[#121214]/90 backdrop-blur-md pb-2 pt-2">
                    <div className="relative group">
                        <select
                            value={selectedMachine}
                            onChange={(e) => setSelectedMachine(e.target.value)}
                            className="w-full appearance-none bg-white dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl py-4 pl-12 pr-12 text-slate-900 dark:text-white font-bold text-lg focus:outline-none focus:border-accent-purple shadow-sm transition-all"
                        >
                            <option value="" className="text-slate-500">Pick Machine Location...</option>
                            {machines.map((m) => (
                                <option key={m.id} value={m.id} className="text-slate-900 dark:text-white">{m.location_name}</option>
                            ))}
                        </select>
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-purple w-5 h-5 pointer-events-none" />
                        <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5 pointer-events-none" />
                    </div>
                </div>

                {selectedMachine && isLoadingMachineStock && (
                    <div className="flex justify-center my-12">
                        <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
                    </div>
                )}

                {/* Dense Item List */}
                {selectedMachine && !isLoadingMachineStock && (
                    <div className="space-y-3 pb-6">
                        {Object.values(machineItems)
                            .sort((a, b) => a.item.name.localeCompare(b.item.name))
                            .map((row) => {
                                const isModified = row.refilled > 0 || row.expired > 0;

                                return (
                                    <div key={row.itemId} className={`p-4 rounded-3xl transition-colors border ${isModified ? 'bg-accent-blue/5 border-accent-blue/40 shadow-sm' : 'bg-white dark:bg-[#1a1a1c] border-slate-200 dark:border-white/5'}`}>

                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3 flex-1 pr-2">
                                                <div className="flex-shrink-0">
                                                    {row.item.imageUrl ? (
                                                        <label className="relative block w-16 h-16 cursor-pointer group">
                                                            <img src={row.item.imageUrl} alt={row.item.name} className="w-16 h-16 rounded-xl object-cover bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 group-hover:opacity-50 transition-opacity shadow-sm" />
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Camera className="w-6 h-6 text-white" />
                                                            </div>
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (!file) return;
                                                                    const toastId = toast.loading("Compressing & Updating image...");
                                                                    try {
                                                                        const compressedFile = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 800 });
                                                                        const formData = new FormData();
                                                                        formData.append("image", compressedFile);
                                                                        const res = await uploadItemImage(row.itemId, formData);
                                                                        if (res.success && res.data) {
                                                                            toast.success("Image updated", { id: toastId });
                                                                            updateItem(row.itemId, 'item', { ...row.item, imageUrl: res.data });
                                                                        } else {
                                                                            toast.error("Upload failed", { id: toastId, description: 'error' in res ? res.error : "Failed" });
                                                                        }
                                                                    } catch (err) {
                                                                        toast.error("Compression failed", { id: toastId });
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                    ) : (
                                                        <label className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm gap-1">
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (!file) return;
                                                                    const toastId = toast.loading("Compressing & Uploading image...");
                                                                    try {
                                                                        const compressedFile = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 800 });
                                                                        const formData = new FormData();
                                                                        formData.append("image", compressedFile);
                                                                        const res = await uploadItemImage(row.itemId, formData);
                                                                        if (res.success && res.data) {
                                                                            toast.success("Image uploaded", { id: toastId });
                                                                            updateItem(row.itemId, 'item', { ...row.item, imageUrl: res.data });
                                                                        } else {
                                                                            toast.error("Upload failed", { id: toastId, description: 'error' in res ? res.error : "Failed" });
                                                                        }
                                                                    } catch (err) {
                                                                        toast.error("Compression failed", { id: toastId });
                                                                    }
                                                                }}
                                                            />
                                                            <Camera className="w-5 h-5 text-slate-400" />
                                                            <span className="text-[8px] font-bold text-slate-500 uppercase">Add Photo</span>
                                                        </label>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight mb-1">{row.item.name}</h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${row.inBag && row.bagQuantity > 0 ? 'bg-accent-blue/20 text-accent-blue' : row.inBag && row.bagQuantity === 0 ? 'bg-accent-pink/20 text-accent-pink' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'}`}>
                                                            Bag: {row.bagQuantity}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                                            SYS: <span className="font-bold">{row.estimated_stock}</span> / MAX:
                                                            <input
                                                                type="number"
                                                                value={row.capacity === 0 ? '' : row.capacity}
                                                                onChange={(e) => updateItem(row.itemId, 'capacity', parseInt(e.target.value) || 0)}
                                                                className="w-10 bg-transparent border-b border-slate-300 dark:border-slate-600 text-center font-bold text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue px-0 py-0"
                                                            />
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {userRole !== 'admin' && (
                                                <button
                                                    onClick={() => handleFillMax(row.itemId)}
                                                    className="shrink-0 flex items-center gap-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors"
                                                >
                                                    <Zap className="w-3 h-3 text-accent-blue" /> Max Out
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-white/5">

                                            {/* Expired Counter */}
                                            <div className="flex flex-col flex-1 pl-1 border-r border-slate-100 dark:border-white/5">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-accent-orange mb-1">Expired</span>
                                                <div className="flex items-center h-10 w-28 bg-slate-50 dark:bg-black/30 rounded-full border border-slate-200 dark:border-white/5 shrink-0 overflow-hidden">
                                                    {userRole !== 'admin' ? (
                                                        <button onClick={() => updateItem(row.itemId, 'expired', Math.max(0, row.expired - 1))} className="w-8 h-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300">-</button>
                                                    ) : (
                                                        <div className="w-8 h-full"></div>
                                                    )}
                                                    <span className="flex-1 text-center font-bold text-slate-900 dark:text-white">{row.expired}</span>
                                                    {userRole !== 'admin' ? (
                                                        <button onClick={() => updateItem(row.itemId, 'expired', row.expired + 1)} className="w-8 h-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300 text-lg">+</button>
                                                    ) : (
                                                        <div className="w-8 h-full"></div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Refilled Counter */}
                                            <div className="flex flex-col flex-1 pl-4">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-accent-green mb-1">Refilled</span>
                                                <div className="flex items-center h-10 w-28 bg-slate-50 dark:bg-black/30 rounded-full border border-slate-200 dark:border-white/5 shrink-0 overflow-hidden">
                                                    {userRole !== 'admin' ? (
                                                        <button onClick={() => updateItem(row.itemId, 'refilled', Math.max(0, row.refilled - 1))} className="w-8 h-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300">-</button>
                                                    ) : (
                                                        <div className="w-8 h-full"></div>
                                                    )}
                                                    <span className="flex-1 text-center font-bold text-slate-900 dark:text-white">{row.refilled}</span>
                                                    {userRole !== 'admin' ? (
                                                        <button onClick={() => {
                                                            const newVal = Math.min(row.bagQuantity, row.refilled + 1);
                                                            updateItem(row.itemId, 'refilled', newVal);
                                                        }} className="w-8 h-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300 text-lg">+</button>
                                                    ) : (
                                                        <div className="w-8 h-full"></div>
                                                    )}
                                                </div>
                                            </div>

                                        </div>

                                    </div>
                                )
                            })
                        }

                        {/* Search to Add New Items (Driver Only) */}
                        {userRole !== 'admin' && (
                            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/10">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">Not in list? Add Item</h4>
                                <div className="relative">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search global catalog..."
                                        value={itemSearch}
                                        onChange={(e) => setItemSearch(e.target.value)}
                                        className="w-full bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:border-accent-blue transition-all"
                                    />
                                    {itemSearch && (
                                        <div className="absolute top-[110%] left-0 right-0 bg-white dark:bg-[#18181b] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl max-h-60 overflow-y-auto z-50">
                                            {allCatalogItems.filter(i =>
                                                i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
                                                i.sku.toLowerCase().includes(itemSearch.toLowerCase())
                                            ).slice(0, 10).map(catItem => (
                                                <button
                                                    key={catItem.id}
                                                    onClick={() => handleAddGlobalItem(catItem)}
                                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 border-b border-slate-100 dark:border-white/5 last:border-0 flex justify-between items-center"
                                                >
                                                    <span className="font-bold text-sm text-slate-900 dark:text-white">{catItem.name}</span>
                                                    <Plus className="w-4 h-4 text-accent-blue" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Bottom Sticky Action Bar */}
            {selectedMachine && userRole !== 'admin' && (
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-[#121214]/90 backdrop-blur-xl border-t border-slate-200 dark:border-white/10 z-50">
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={handleBatchSubmit}
                        disabled={isSuccess || isPending}
                        className={`w-full flex items-center justify-center gap-3 h-14 rounded-[1rem] font-bold text-lg transition-all shadow-xl ${isSuccess ? 'bg-accent-green text-black shadow-accent-green/20' : 'bg-accent-blue text-black hover:bg-accent-blue/90 shadow-accent-blue/20 disabled:opacity-50'}`}
                    >
                        {isSuccess ? (
                            <>
                                <CheckCircle2 className="w-6 h-6" />
                                Synced Successfully
                            </>
                        ) : isPending ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                Saving Data...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Submit Inventory
                            </>
                        )}
                    </motion.button>
                </div>
            )}
        </div>
    )
}
