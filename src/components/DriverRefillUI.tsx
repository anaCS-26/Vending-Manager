"use client"
import { useState, useTransition, useEffect } from "react"
import { CheckCircle2, ChevronDown, Package, Plus, MapPin, Zap, Search, Loader2, Save, Camera, Navigation, FileText, WifiOff, Wifi } from "lucide-react"
import { logBatchRefills, getMachineInventoryDetails, getItems, uploadItemImage } from "@/actions/inventory"
import imageCompression from 'browser-image-compression';
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { ShieldCheck, LogOut, Settings } from "lucide-react"
import type { MachineType, DispatchWithRelations, DispatchItemWithItem, RefillLogWithMachine } from "@/types"

import { ThemeToggle } from "@/components/ThemeToggle";
import { useDriverStore, OfflineLog } from "@/stores/useDriverStore";

type DriverRefillUIProps = {
    machines: MachineType[];
    activeDispatches: DispatchWithRelations[];
    userRole?: 'admin' | 'super_admin' | 'driver';
};

type ItemFormState = {
    itemId: number;
    item: any;
    refilled: number;
    returned: number;
    bagQuantity: number;
    inBag: boolean;
    estimated_stock: number;
};

export function DriverRefillUI({ machines: serverMachines, activeDispatches: serverDispatches, userRole = 'driver' }: DriverRefillUIProps) {
    // Zustand Store
    const { 
        activeDispatches: storeDispatches, 
        machines: storeMachines, 
        setServerData, 
        offlineLogs, 
        addOfflineLog, 
        removeOfflineLogs 
    } = useDriverStore();

    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
        setHydrated(true);
        // Only update base source of truth from server if we are online.
        if (navigator.onLine) {
            setServerData(serverDispatches, serverMachines);
        }
    }, [serverDispatches, serverMachines]);

    // Use store data if offline, otherwise default to server to avoid hydration mismatch briefly
    const activeDispatches = navigator.onLine ? serverDispatches : (storeDispatches.length > 0 ? storeDispatches : serverDispatches);
    const machines = navigator.onLine ? serverMachines : (storeMachines.length > 0 ? storeMachines : serverMachines);

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

    // View mode toggle
    const [viewMode, setViewMode] = useState<"BAG" | "MACHINE">("BAG");

    // Fetch Global Catalog once (if online)
    useEffect(() => {
        if (navigator.onLine) {
            getItems().then(setAllCatalogItems).catch(console.error)
        }
    }, [])

    const [isOffline, setIsOffline] = useState(false);
    const pendingSyncCount = offlineLogs.length;

    const autoSyncQueue = async () => {
        if (offlineLogs.length === 0) return;

        toast.info(`Syncing ${offlineLogs.length} offline records...`);
        let successCount = 0;
        const failedTimestamps: string[] = [];
        const successTimestamps: string[] = [];

        for (const log of offlineLogs) {
            try {
                const normalizedPayload = (log.payload || []).map((p: any) => ({
                    itemId: p.itemId,
                    refilled: p.refilled || 0,
                    returned: p.returned ?? p.expired ?? 0
                }));
                const result = await logBatchRefills(log.dispatchId, log.machineId, normalizedPayload);
                if (result.success) {
                    successCount++;
                    successTimestamps.push(log.timestamp);
                } else {
                    failedTimestamps.push(log.timestamp);
                }
            } catch (e) {
                failedTimestamps.push(log.timestamp);
            }
        }

        if (successTimestamps.length > 0) {
            removeOfflineLogs(successTimestamps);
            toast.success(`Successfully synced ${successCount} offline logs.`);
            // Force a hard refresh of the page to pull down the newly synced server state seamlessly
            window.location.reload(); 
        }
        if (failedTimestamps.length > 0) {
            toast.error(`Failed to sync ${failedTimestamps.length} logs. Still in offline queue.`);
        }
    };

    useEffect(() => {
        setIsOffline(!navigator.onLine);

        const handleOnline = () => {
            setIsOffline(false);
            // Give Next a moment to breathe before syncing
            setTimeout(() => autoSyncQueue(), 1500);
        };
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Check pending on boot
        if (navigator.onLine && offlineLogs.length > 0 && hydrated) {
            autoSyncQueue();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [offlineLogs, hydrated]);

    const getInitialBagQuantity = (itemId: number) => {
        if (!currentDispatch) return 0;
        const assigned = currentDispatch.DispatchItems.find(di => di.itemId === itemId)?.quantity_given || 0;
        const kept = ((currentDispatch.driver as any)?.DriverStock || []).find((ds: any) => ds.itemId === itemId)?.quantity_on_hand || 0;
        return assigned + kept;
    }

    const getRemainingStock = (itemId: number) => {
        if (!currentDispatch) return 0;
        
        const given = getInitialBagQuantity(itemId);

        // 1. Calculate consumed from SERVER database. (Only items put INTO the machine consume given stock)
        const serverConsumed = (currentDispatch.RefillLogs as RefillLogWithMachine[])
            .filter((r) => r.itemId === itemId)
            .reduce((sum: number, log: any) => sum + log.quantity_refilled, 0);
            
        // 2. Calculate consumed from pending OFFLINE logs.
        const offlineConsumed = offlineLogs
            .filter(log => log.dispatchId === currentDispatch.id)
            .flatMap(log => log.payload)
            .filter(payload => payload.itemId === itemId)
            .reduce((sum, payload) => sum + payload.refilled, 0);

        return Math.max(0, given - serverConsumed - offlineConsumed);
    }

    const getOfflineSysDelta = (itemId: number) => {
        if (!currentDispatch || !selectedMachine) return 0;
        return offlineLogs
            .filter(log => log.dispatchId === currentDispatch.id && log.machineId === parseInt(selectedMachine))
            .flatMap(log => log.payload)
            .filter(payload => payload.itemId === itemId)
            .reduce((sum, payload) => sum + payload.refilled - payload.returned, 0);
    }

    // Initialize list when machine changes
    useEffect(() => {
        if (selectedMachine && currentDispatch) {
            setIsLoadingMachineStock(true)

            const targetMachineId = parseInt(selectedMachine);
            const targetMachine = machines.find(m => m.id === targetMachineId);
            const machineStocks = (targetMachine as any)?.Stock || [];

            const newState: Record<number, ItemFormState> = {};

            // Helper to compile ALL available items for the driver (both newly assigned and kept from yesterday)
            const driverItemIds = new Set<number>();
            currentDispatch.DispatchItems.forEach(di => driverItemIds.add(di.itemId));
            ((currentDispatch.driver as any)?.DriverStock || []).forEach((ds: any) => driverItemIds.add(ds.itemId));

            // Helper to extract raw item meta dynamically
            const getItemMeta = (itemId: number) => {
                return currentDispatch.DispatchItems.find(di => di.itemId === itemId)?.item || 
                       ((currentDispatch.driver as any)?.DriverStock || []).find((ds: any) => ds.itemId === itemId)?.item;
            }

            // 1. Pre-fill any items the machine explicitly holds (so driver sees SYS and capacity)
            machineStocks.forEach((ms: any) => {
                const isAvailableToDriver = driverItemIds.has(ms.itemId);
                const bagRemaining = isAvailableToDriver ? getRemainingStock(ms.itemId) : 0;
                const sysDelta = getOfflineSysDelta(ms.itemId);

                newState[ms.itemId] = {
                    itemId: ms.itemId,
                    item: ms.item,
                    refilled: 0,
                    returned: 0,
                    bagQuantity: bagRemaining,
                    inBag: isAvailableToDriver,
                    estimated_stock: Math.max(0, ms.estimated_stock + sysDelta)
                };
            });

            // 2. Add anything else in the driver's bag that the machine doesn't structurally own yet
            driverItemIds.forEach(itemId => {
                if (!newState[itemId]) {
                    newState[itemId] = {
                        itemId: itemId,
                        item: getItemMeta(itemId),
                        refilled: 0,
                        returned: 0,
                        bagQuantity: getRemainingStock(itemId),
                        inBag: true,
                        estimated_stock: Math.max(0, getOfflineSysDelta(itemId))
                    };
                }
            });

            setMachineItems(newState);
            setIsLoadingMachineStock(false);
        } else {
            setMachineItems({});
        }
    }, [selectedMachine, currentDispatch, offlineLogs, machines])


    // Avoid rendering mismatch
    if (!hydrated) return null;

    if (!currentDispatch) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-neo-bg rounded-3xl min-h-[50vh] relative overflow-hidden border border-slate-200 dark:border-white/5">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    {userRole === 'admin' || userRole === 'super_admin' ? (
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

        // Find items that were modified (refilled or returned > 0)
        const modifiedItems = Object.values(machineItems).filter(item => item.refilled > 0 || item.returned > 0);

        if (modifiedItems.length === 0) {
            toast.error("No changes made", { description: "You haven't added or returned any stock." });
            return;
        }

        startTransition(async () => {
            const payload = modifiedItems.map(m => ({
                itemId: m.itemId,
                refilled: m.refilled,
                returned: m.returned
            }));

            if (isOffline || !navigator.onLine) {
                // Instantly log in Zustand store
                addOfflineLog({
                    dispatchId: currentDispatch.id,
                    machineId: parseInt(selectedMachine),
                    payload,
                    timestamp: new Date().toISOString()
                });

                setIsSuccess(true)
                toast.success("Saved Offline", {
                    description: `${modifiedItems.length} item(s) saved to device temporarily.`,
                })
                setTimeout(() => {
                    setIsSuccess(false)
                    setSelectedMachine("")
                }, 1500)
                return;
            }

            try {
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
            } catch (error) {
                console.warn("Network Error during submit, falling back to offline", error);
                
                // Force UI into offline mode since we just proved the network is down
                setIsOffline(true);
                
                // Instantly log in Zustand store as fallback
                addOfflineLog({
                    dispatchId: currentDispatch.id,
                    machineId: parseInt(selectedMachine),
                    payload,
                    timestamp: new Date().toISOString()
                });

                setIsSuccess(true)
                toast.success("Saved Offline", {
                    description: `Network unreachable. ${modifiedItems.length} item(s) saved to device temporarily.`,
                })
                setTimeout(() => {
                    setIsSuccess(false)
                    setSelectedMachine("")
                }, 1500)
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


    const totalGiven = currentDispatch.DispatchItems.reduce((sum: number, item: DispatchItemWithItem) => sum + item.quantity_given, 0);
    const totalConsumed = (currentDispatch.RefillLogs as RefillLogWithMachine[])
        .reduce((sum: number, log: any) => sum + log.quantity_refilled + (log.expired_quantity || 0) + (log.damaged_quantity || 0), 0);
    
    // Account for offline progress too
    const pendingConsumed = offlineLogs
        .filter(log => log.dispatchId === currentDispatch.id)
        .flatMap(log => log.payload)
        .reduce((sum, payload) => sum + payload.refilled + payload.returned, 0);

    const progressPercent = totalGiven > 0 ? Math.min(100, ((totalConsumed + pendingConsumed) / totalGiven) * 100) : 0;
    const isComplete = progressPercent === 100;

    const activeMachineDetails = machines.find(m => m.id.toString() === selectedMachine);

    return (
        <div className="bg-slate-50 dark:bg-[#121214] min-h-[90vh] sm:rounded-[2.5rem] shadow-2xl shadow-black/50 overflow-hidden relative flex flex-col border-0 sm:border border-slate-200 dark:border-white/10 pb-24">

            {/* Top Header Section */}
            <div className="bg-white/80 dark:bg-black/40 backdrop-blur-3xl pt-10 pb-10 px-8 rounded-b-[2rem] relative z-20 border-b border-slate-200 dark:border-white/10 shrink-0">
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                    {userRole === 'admin' || userRole === 'super_admin' ? (
                        <Link href="/admin" className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10" title="Return to Admin HQ">
                            <ShieldCheck className="w-5 h-5 text-accent-green" />
                        </Link>
                    ) : (
                        <>
                            <Link href="/driver/settings" className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10" title="Settings">
                                <Settings className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            </Link>
                            <button onClick={() => signOut({ callbackUrl: '/login' })} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10" title="Sign Out">
                                <LogOut className="w-5 h-5 text-accent-pink" />
                            </button>
                        </>
                    )}
                    <ThemeToggle />
                </div>

                <AnimatePresence>
                    {isOffline && (
                        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20 whitespace-nowrap">
                            <WifiOff className="w-3.5 h-3.5" />
                            Offline Mode - Saving Locally
                            {pendingSyncCount > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-full">{pendingSyncCount} pending</span>}
                        </motion.div>
                    )}
                </AnimatePresence>

                <p className="text-accent-blue text-xs font-semibold mb-2 flex items-center gap-2 uppercase tracking-wider">
                    <Zap className="w-3 h-3 text-accent-blue" />
                    Route {isComplete ? 'Complete' : 'Active'}
                </p>

                {(userRole === 'admin' || userRole === 'super_admin') && activeDispatches.length > 1 ? (
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
                <div className="mb-6 relative z-40 sticky top-0 bg-slate-50/90 dark:bg-[#121214]/90 backdrop-blur-md pb-2 pt-2">
                    <div className="relative group mb-3">
                        <select
                            value={selectedMachine}
                            onChange={(e) => setSelectedMachine(e.target.value)}
                            className="w-full appearance-none bg-white dark:bg-black/50 border border-slate-300 dark:border-white/10 rounded-2xl py-4 pl-12 pr-12 text-slate-900 dark:text-white font-bold text-lg focus:outline-none focus:border-accent-purple shadow-sm transition-all"
                        >
                            <option value="" className="text-slate-500 bg-white dark:bg-slate-900">Pick Machine Location...</option>
                            {machines.map((m) => (
                                <option key={m.id} value={m.id} className="text-slate-900 dark:text-white bg-white dark:bg-slate-900">
                                    {m.id} - {m.location_name}
                                </option>
                            ))}
                        </select>
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-purple w-5 h-5 pointer-events-none" />
                        <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5 pointer-events-none" />
                    </div>

                    {/* Machine Details & Routing Panel */}
                    <AnimatePresence>
                        {activeMachineDetails && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl p-4 overflow-hidden"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-start gap-2">
                                            <MapPin className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900 dark:text-white">{activeMachineDetails.address || 'No Address Provided'}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">{activeMachineDetails.district}</p>
                                            </div>
                                        </div>

                                        {activeMachineDetails.notes && (
                                            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 p-2.5 rounded-lg border border-amber-200 dark:border-amber-500/20">
                                                <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 leading-snug">{activeMachineDetails.notes}</p>
                                            </div>
                                        )}
                                    </div>

                                    {(activeMachineDetails.latitude && activeMachineDetails.longitude) ? (
                                        <a
                                            href={`https://www.google.com/maps/dir/?api=1&destination=${activeMachineDetails.latitude},${activeMachineDetails.longitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors border border-blue-200 dark:border-blue-500/20 whitespace-nowrap"
                                        >
                                            <Navigation className="w-4 h-4" />
                                            Get Directions
                                        </a>
                                    ) : null}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {selectedMachine && isLoadingMachineStock && (
                    <div className="flex justify-center my-12">
                        <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
                    </div>
                )}

                {/* Dense Item List */}
                {selectedMachine && !isLoadingMachineStock && (
                    <div className="space-y-4 pb-6">

                        {/* View Mode Toggle */}
                        <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-xl border border-slate-200 dark:border-white/10 w-full mb-4">
                            <button
                                onClick={() => setViewMode("BAG")}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === "BAG" ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                            >
                                Bag Inventory
                            </button>
                            <button
                                onClick={() => setViewMode("MACHINE")}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === "MACHINE" ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white'}`}
                            >
                                Machine Stock
                            </button>
                        </div>

                        {/* Search Bar (Offline Capable) */}
                        <div className="relative mb-4">
                            <input
                                type="text"
                                placeholder="Search by SKU or Item Name..."
                                value={itemSearch}
                                onChange={(e) => setItemSearch(e.target.value)}
                                className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue transition-colors shadow-sm"
                            />
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        </div>

                        <div className="space-y-3">
                            {Object.values(machineItems)
                                .filter(row => {
                                    if (itemSearch) {
                                        const query = itemSearch.toLowerCase();
                                        const matchesName = row.item.name?.toLowerCase().includes(query);
                                        const matchesSku = row.item.sku?.toLowerCase().includes(query);
                                        if (!matchesName && !matchesSku) return false;
                                    }
                                    if (viewMode === "BAG") {
                                        return row.bagQuantity > 0 || row.refilled > 0;
                                    } else {
                                        return row.estimated_stock > 0 || row.returned > 0;
                                    }
                                })
                                .sort((a, b) => a.item.name.localeCompare(b.item.name))
                                .map((row) => {
                                    const isModified = row.refilled > 0 || row.returned > 0;

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
                                                        <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight mb-1">
                                                            <span className="font-mono text-slate-500 dark:text-slate-400 font-medium">[{row.item.sku || '0000'}]</span> {row.item.name}
                                                        </h3>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${row.inBag && row.bagQuantity > 0 ? 'bg-accent-blue/20 text-accent-blue' : row.inBag && row.bagQuantity === 0 ? 'bg-accent-pink/20 text-accent-pink' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'}`}>
                                                                Bag: {row.bagQuantity}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                                                SYS: <span className="font-bold">{Math.max(0, row.estimated_stock + row.refilled - row.returned)}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-white/5 w-full">

                                                {/* Returned Counter (Machine View Only) */}
                                                {viewMode === "MACHINE" && (
                                                    <div className="flex flex-col flex-1 pl-1">
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-orange mb-1">Returned (Warehouse)</span>
                                                        <div className="flex items-center h-10 w-full max-w-[140px] bg-slate-50 dark:bg-black/30 rounded-full border border-slate-200 dark:border-white/5 shrink-0 overflow-hidden">
                                                            <button onClick={() => updateItem(row.itemId, 'returned', Math.max(0, row.returned - 1))} className="w-10 h-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300">-</button>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                pattern="[0-9]*"
                                                                autoComplete="off"
                                                                value={String(row.returned)}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.replace(/[^0-9]/g, "");
                                                                    const n = raw === "" ? 0 : parseInt(raw, 10);
                                                                    updateItem(row.itemId, 'returned', Math.max(0, n));
                                                                }}
                                                                aria-label="Returned quantity"
                                                                className="flex-1 min-w-0 text-center font-bold text-slate-900 dark:text-white bg-transparent border-none outline-none"
                                                            />
                                                            <button onClick={() => {
                                                                const newVal = row.returned + 1;
                                                                updateItem(row.itemId, 'returned', Math.max(0, newVal));
                                                            }} className="w-10 h-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300 text-lg">+</button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Refilled Counter (Bag View Only) */}
                                                {viewMode === "BAG" && (
                                                    <div className="flex flex-col flex-1 pl-4">
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-green mb-1">Refilled (Machine)</span>
                                                        <div className="flex items-center h-10 w-full max-w-[140px] bg-slate-50 dark:bg-black/30 rounded-full border border-slate-200 dark:border-white/5 shrink-0 overflow-hidden">
                                                            <button onClick={() => updateItem(row.itemId, 'refilled', Math.max(0, row.refilled - 1))} className="w-10 h-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300">-</button>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                pattern="[0-9]*"
                                                                autoComplete="off"
                                                                value={String(row.refilled)}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.replace(/[^0-9]/g, "");
                                                                    const n = raw === "" ? 0 : parseInt(raw, 10);
                                                                    // Let the driver type freely; bag-capacity is enforced on commit
                                                                    // (the "+" button still clamps for tap-to-increment UX).
                                                                    updateItem(row.itemId, 'refilled', Math.max(0, n));
                                                                }}
                                                                onBlur={() => {
                                                                    if (row.refilled > row.bagQuantity) {
                                                                        updateItem(row.itemId, 'refilled', row.bagQuantity);
                                                                        toast.warning(`Capped to bag size (${row.bagQuantity}).`);
                                                                    }
                                                                }}
                                                                aria-label="Refilled quantity"
                                                                className={`flex-1 min-w-0 text-center font-bold bg-transparent border-none outline-none ${row.refilled > row.bagQuantity ? 'text-accent-pink' : 'text-slate-900 dark:text-white'}`}
                                                            />
                                                            <button onClick={() => {
                                                                const newVal = Math.min(row.bagQuantity, row.refilled + 1); // Can only refill up to what is in the bag
                                                                updateItem(row.itemId, 'refilled', newVal);
                                                            }} className="w-10 h-full flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300 text-lg">+</button>
                                                        </div>
                                                    </div>
                                                )}

                                            </div>

                                        </div>
                                    )
                                })
                            }
                            {Object.values(machineItems).filter(row => {
                                    if (viewMode === "BAG") {
                                        return row.bagQuantity > 0 || row.refilled > 0;
                                    } else {
                                        return row.estimated_stock > 0 || row.returned > 0;
                                    }
                                }).length === 0 && (
                                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm font-medium">
                                    No items in this view.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Sticky Action Bar */}
            {selectedMachine && (
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
