"use client"
import { useState, useTransition, useEffect, useMemo } from "react"
import { CheckCircle2, ChevronDown, Package, Plus, MapPin, Zap, Search, Loader2, Save, Camera, Navigation, FileText, History, ListChecks, AlertTriangle, X } from "lucide-react"
import { logBatchRefills, getMachineInventoryDetails, getItems, uploadItemImage, getRefillHints } from "@/actions/inventory"
import imageCompression from 'browser-image-compression';
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ShieldCheck, LogOut, Settings } from "lucide-react"
import type { MachineType, DispatchWithRelations, DispatchItemWithItem, RefillLogWithMachine } from "@/types"

import { ThemeToggle } from "@/components/ThemeToggle";
import { NumericInput } from "@/components/NumericInput";
import { useDriverStore, OfflineLog } from "@/stores/useDriverStore";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { seedRefillQuantity, splitRefillRows, countUnconfirmed } from "@/lib/refill-entry";

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
    bag_returned: number;
    bagQuantity: number;
    inBag: boolean;
    estimated_stock: number;
    /** What this machine took of this item last visit; null when it has no history here. */
    lastQty: number | null;
    /** True when `refilled` was seeded by prefill mode rather than by the driver. */
    prefilled: boolean;
    /**
     * The driver has looked at this number. Set by any manual edit or by tapping
     * a suggestion chip; cleared only by a prefill seed. Nothing unconfirmed can
     * reach `logBatchRefills` — refilled quantity IS booked revenue, so a figure
     * nobody read must not become one.
     */
    confirmed: boolean;
};

export function DriverRefillUI({ machines: serverMachines, activeDispatches: serverDispatches, userRole = 'driver' }: DriverRefillUIProps) {
    const router = useRouter();

    // Zustand Store
    const {
        activeDispatches: storeDispatches,
        machines: storeMachines,
        setServerData,
        offlineLogs,
        addOfflineLog,
        removeOfflineLogs,
        clearOfflineLogs,
        refillHints,
        setRefillHints,
        refillMode
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

    // Warn before losing staged counts. Mobile browsers ship pull-to-refresh on by
    // default and the back gesture is easy to trigger one-handed, so an unguarded
    // navigation silently discards everything the driver has counted at the machine.
    useEffect(() => {
        const hasStagedWork = Object.values(machineItems).some(
            (i) => i.refilled > 0 || i.returned > 0 || i.bag_returned > 0
        );
        if (!hasStagedWork || isSuccess) return;

        const warn = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [machineItems, isSuccess]);

    // View mode toggle
    const [viewMode, setViewMode] = useState<"BAG" | "MACHINE">("BAG");

    // Pre-submit review sheet (prefill mode) and the "everything else" disclosure.
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [showAllItems, setShowAllItems] = useState(false);

    // Fetch Global Catalog once (if online)
    useEffect(() => {
        if (navigator.onLine) {
            getItems().then(setAllCatalogItems).catch(console.error)
        }
    }, [])

    // Refresh the suggestion hints whenever the portal is opened online, and keep
    // the last good copy otherwise. A failure here is silent on purpose: hints are
    // a convenience, and a driver standing at a machine should not be shown an
    // error for something that costs him nothing.
    useEffect(() => {
        if (!navigator.onLine) return;
        getRefillHints().then(setRefillHints).catch(() => { /* keep cached hints */ })
    }, [])

    /**
     * The visible sheet: search + tab filter, then the needs-stock split from
     * `src/lib/refill-entry.ts`. Emptiest first inside the primary group, since
     * that is the order the driver works the machine in.
     *
     * Declared up here with the other hooks, above the "no active route" early
     * return — a useMemo below it would run on some renders and not others.
     */
    const { primaryRows, secondaryRows } = useMemo(() => {
        const query = itemSearch.toLowerCase();
        const rows = Object.values(machineItems)
            .filter(row => {
                if (query
                    && !row.item?.name?.toLowerCase().includes(query)
                    && !row.item?.sku?.toLowerCase().includes(query)) return false;
                return viewMode === "BAG"
                    ? row.bagQuantity > 0 || row.refilled > 0
                    : row.estimated_stock > 0 || row.returned > 0;
            })
            .sort((a, b) => a.item.name.localeCompare(b.item.name));

        const { primary, secondary } = splitRefillRows(rows, {
            isSearching: itemSearch.length > 0,
            viewMode,
        });
        return {
            primaryRows: [...primary].sort((a, b) =>
                a.estimated_stock - b.estimated_stock || a.item.name.localeCompare(b.item.name)
            ),
            secondaryRows: secondary,
        };
    }, [machineItems, itemSearch, viewMode]);

    /** machineId → itemId → last quantity. Rebuilt only when the cache changes. */
    const hintIndex = useMemo(() => {
        const byMachine = new Map<number, Map<number, number>>();
        for (const h of refillHints) {
            let m = byMachine.get(h.machineId);
            if (!m) { m = new Map(); byMachine.set(h.machineId, m); }
            m.set(h.itemId, h.lastQty);
        }
        return byMachine;
    }, [refillHints])

    const [isOffline, setIsOffline] = useState(false);

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
                    returned: p.returned ?? p.expired ?? 0,
                    bag_returned: p.bag_returned || 0
                }));
                // dispatchId=0 is the dispatchless sentinel — translate to null at the
                // server-action boundary so logBatchRefills routes to the bag-based path.
                const wireDispatchId = log.dispatchId === 0 ? null : log.dispatchId;
                const result = await logBatchRefills(wireDispatchId, log.machineId, normalizedPayload, log.clientRequestId ?? null);
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

        if (failedTimestamps.length > 0) {
            toast.error(`Failed to sync ${failedTimestamps.length} logs. Still in offline queue.`);
        }
        if (successTimestamps.length > 0) {
            removeOfflineLogs(successTimestamps);
            toast.success(`Successfully synced ${successCount} offline logs.`);
            // Pull down the newly synced server state WITHOUT a full page reload —
            // `window.location.reload()` here would destroy any counts the driver has
            // already staged for the machine they're standing at.
            router.refresh();
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
            .reduce((sum, payload) => sum + payload.refilled + (payload.bag_returned || 0), 0);

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

            // Helper to compile ALL available items for the driver
            const driverItemIds = new Set<number>();
            currentDispatch.DispatchItems.forEach(di => driverItemIds.add(di.itemId));
            ((currentDispatch.driver as any)?.DriverStock || []).forEach((ds: any) => driverItemIds.add(ds.itemId));

            // Helper to extract raw item meta dynamically
            const getItemMeta = (itemId: number) => {
                return currentDispatch.DispatchItems.find(di => di.itemId === itemId)?.item || 
                       ((currentDispatch.driver as any)?.DriverStock || []).find((ds: any) => ds.itemId === itemId)?.item;
            }

            const machineHints = hintIndex.get(targetMachineId);

            setMachineItems(prevState => {
                const newState: Record<number, ItemFormState> = {};

                /**
                 * Quantities the driver has already staged always win. This effect
                 * re-runs whenever the offline queue or the machine list changes, so
                 * re-seeding an existing row would overwrite a count taken at the
                 * machine — and in prefill mode would silently resurrect a number the
                 * driver had deliberately zeroed.
                 */
                const seed = (itemId: number, bagQuantity: number) => {
                    const existing = prevState[itemId];
                    const lastQty = machineHints?.get(itemId) ?? null;
                    if (existing) {
                        return {
                            refilled: existing.refilled || 0,
                            returned: existing.returned || 0,
                            bag_returned: existing.bag_returned || 0,
                            lastQty,
                            prefilled: existing.prefilled,
                            confirmed: existing.confirmed,
                        };
                    }
                    return {
                        returned: 0,
                        bag_returned: 0,
                        lastQty,
                        ...seedRefillQuantity(refillMode, lastQty, bagQuantity),
                    };
                };

                // 1. Pre-fill any items the machine explicitly holds
                machineStocks.forEach((ms: any) => {
                    const isAvailableToDriver = driverItemIds.has(ms.itemId);
                    const bagRemaining = isAvailableToDriver ? getRemainingStock(ms.itemId) : 0;
                    const sysDelta = getOfflineSysDelta(ms.itemId);

                    newState[ms.itemId] = {
                        itemId: ms.itemId,
                        item: ms.item,
                        bagQuantity: bagRemaining,
                        inBag: isAvailableToDriver,
                        estimated_stock: Math.max(0, ms.estimated_stock + sysDelta),
                        ...seed(ms.itemId, bagRemaining),
                    };
                });

                // 2. Add anything else in the driver's bag
                driverItemIds.forEach(itemId => {
                    if (!newState[itemId]) {
                        const bagRemaining = getRemainingStock(itemId);
                        newState[itemId] = {
                            itemId: itemId,
                            item: getItemMeta(itemId),
                            bagQuantity: bagRemaining,
                            inBag: true,
                            estimated_stock: Math.max(0, getOfflineSysDelta(itemId)),
                            ...seed(itemId, bagRemaining),
                        };
                    }
                });

                return newState;
            });
            setIsLoadingMachineStock(false);
        } else {
            setMachineItems({});
        }
    }, [selectedMachine, currentDispatch, offlineLogs, machines, hintIndex, refillMode])


    // Avoid rendering mismatch
    if (!hydrated) return null;

    if (!currentDispatch) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-neo-bg rounded-3xl min-h-[70dvh] sm:min-h-[50vh] relative overflow-hidden border border-slate-200 dark:border-white/5">
                <div className="absolute top-[calc(env(safe-area-inset-top,0px)+1rem)] right-4 flex items-center gap-2">
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

    const submitStaged = async () => {
        if (!selectedMachine) return;

        // Find items that were modified (refilled or returned > 0)
        const modifiedItems = Object.values(machineItems).filter(item => item.refilled > 0 || item.returned > 0 || item.bag_returned > 0);

        if (modifiedItems.length === 0) {
            toast.error("No changes made", { description: "You haven't added or returned any stock." });
            return;
        }

        startTransition(async () => {
            const payload = modifiedItems.map(m => ({
                itemId: m.itemId,
                refilled: m.refilled,
                returned: m.returned,
                bag_returned: m.bag_returned
            }));

            // One idempotency key for this submission, generated before we know
            // whether it goes out online or into the queue. The online attempt and
            // its offline fallback below MUST share it: if the request actually
            // committed and only the response was lost, the fallback entry would
            // otherwise replay it and double-count the refill.
            const clientRequestId = crypto.randomUUID();

            if (isOffline || !navigator.onLine) {
                // Instantly log in Zustand store
                addOfflineLog({
                    dispatchId: currentDispatch.id,
                    machineId: parseInt(selectedMachine),
                    payload,
                    timestamp: new Date().toISOString(),
                    clientRequestId
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
                // dispatchId=0 is the dispatchless sentinel — translate to null at the
                // server-action boundary so logBatchRefills routes to the bag-based path.
                const wireDispatchId = currentDispatch.id === 0 ? null : currentDispatch.id;
                const result = await logBatchRefills(wireDispatchId, parseInt(selectedMachine), payload, clientRequestId);
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
                
                // Instantly log in Zustand store as fallback. Reuses the same
                // clientRequestId as the failed attempt above, so if that request
                // did reach the server the replay is recognised and discarded
                // instead of being committed a second time.
                addOfflineLog({
                    dispatchId: currentDispatch.id,
                    machineId: parseInt(selectedMachine),
                    payload,
                    timestamp: new Date().toISOString(),
                    clientRequestId
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

    /**
     * Submit, or first make the driver read what he's about to submit.
     *
     * Prefill mode puts numbers in the boxes that nobody has looked at yet, and
     * `logBatchRefillsDispatchless` turns every one of them into
     * `items_sold_since_last_refill` and `sales_revenue` on a ledger row that is
     * never edited afterwards. So a prefilled figure gets exactly one gate: a
     * review sheet listing every line before it becomes revenue. Quick mode
     * reaches this with nothing unconfirmed — each number there was already an
     * explicit tap — and submits straight through.
     */
    const handleBatchSubmit = () => {
        if (stagedSummary.unconfirmed > 0) {
            setIsReviewOpen(true);
            return;
        }
        void submitStaged();
    };

    const confirmAllAndSubmit = () => {
        setMachineItems(prev =>
            Object.fromEntries(Object.entries(prev).map(([id, row]) => [id, { ...row, confirmed: true }]))
        );
        setIsReviewOpen(false);
        // Quantities are unchanged by confirming, so the payload this closure
        // builds from the pre-update state is identical to the confirmed one.
        void submitStaged();
    };

    // Handlers
    const updateItem = (id: number, field: keyof ItemFormState, val: any) => {
        setMachineItems(prev => {
            const row = prev[id];
            if (!row) return prev;
            // Touching the refill box IS the confirmation, and the number stops
            // being "prefilled" the moment the driver makes it his own.
            const owns = field === 'refilled';
            return {
                ...prev,
                [id]: { ...row, [field]: val, ...(owns ? { confirmed: true, prefilled: false } : {}) },
            };
        });
    };

    /** One-tap accept of the last-visit suggestion, capped to what's left in the bag. */
    const applyHint = (id: number, lastQty: number, maxFromBag: number) => {
        updateItem(id, 'refilled', Math.max(0, Math.min(lastQty, maxFromBag)));
    };

    const activeMachineDetails = machines.find(m => m.id.toString() === selectedMachine);

    // Totals for the submit bar. Both view tabs contribute, so a driver who
    // counted returns on the Machine tab and refills on the Bag tab still sees
    // everything that is about to be written.
    const stagedSummary = Object.values(machineItems).reduce(
        (acc, row) => {
            if (row.refilled > 0 || row.returned > 0 || row.bag_returned > 0) acc.items += 1;
            acc.refilled += row.refilled;
            acc.returned += row.returned;
            acc.bagReturned += row.bag_returned;
            return acc;
        },
        {
            items: 0,
            refilled: 0,
            returned: 0,
            bagReturned: 0,
            unconfirmed: countUnconfirmed(Object.values(machineItems)),
        },
    );

    return (
        /* `overflow-visible` below `sm` is load-bearing, not cosmetic: an
           `overflow-hidden` ancestor makes itself the scrollport for any
           `position: sticky` descendant, and this box never scrolls (it's sized
           by `min-h`), so the machine-selector bar below silently stopped
           sticking. Letting the phone scroll the page instead reinstates it —
           and gives back pull-to-refresh and address-bar collapse, which a
           nested scroller also eats. `dvh` over `vh` for the same reason: `vh`
           is the *expanded* chrome height, so a `90vh` box overflows the real
           viewport on mobile Safari. */
        <div className="bg-slate-50 dark:bg-[#121214] min-h-[100dvh] sm:min-h-[90vh] sm:rounded-[2.5rem] shadow-2xl shadow-black/50 overflow-visible sm:overflow-hidden relative flex flex-col border-0 sm:border border-slate-200 dark:border-white/10 pb-28">

            {/* Top Header Section */}
            {/* The inset is folded into the header's own padding rather than added
                to a wrapper, so the header's background — not the page's — is what
                paints behind the status bar in the installed PWA. */}
            <div className="bg-white/80 dark:bg-black/40 backdrop-blur-3xl pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] pb-6 px-5 sm:pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] sm:pb-10 sm:px-8 rounded-b-[2rem] relative z-20 border-b border-slate-200 dark:border-white/10 shrink-0">
                <div className="absolute top-[calc(env(safe-area-inset-top,0px)+0.75rem)] right-3 sm:right-4 z-50 flex items-center gap-2">
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

                {/* Offline/queue state lives in <OfflineIndicator/> (driver layout)
                    now — it was a pill in this header, which meant the driver lost
                    sight of a pending queue the moment they left this screen. */}

                {(userRole === 'admin' || userRole === 'super_admin') && activeDispatches.length > 1 ? (
                    <select
                        aria-label="Select driver"
                        className="max-w-full text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none mt-6 sm:mt-0 mb-1 sm:mb-4 bg-transparent border-b border-slate-300 dark:border-slate-600 focus:outline-none focus:border-accent-blue cursor-pointer"
                        value={selectedDispatchIndex}
                        onChange={(e) => setSelectedDispatchIndex(Number(e.target.value))}
                    >
                        {activeDispatches.map((d, index) => (
                            <option key={d.id === 0 ? `synthetic-${d.driver.id}` : d.id} value={index} className="text-sm font-medium text-slate-900 dark:text-white bg-slate-100 dark:bg-[#121214]">
                                {d.driver.name}
                            </option>
                        ))}
                    </select>
                ) : (
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-1 sm:mb-4 pr-28 truncate">
                        {currentDispatch.driver.name}
                    </h1>
                )}
            </div>

            {/* No `overflow-y-auto` below `sm` — see the container comment above. */}
            <div className="flex-1 sm:overflow-y-auto px-4 py-4 sm:py-6 relative z-10 custom-scrollbar">

                {/* Machine Selection Bar */}
                <div className="mb-4 sm:mb-6 relative z-40 sticky top-0 bg-slate-50/95 dark:bg-[#121214]/95 backdrop-blur-md pb-2 pt-2">
                    <div className="relative group mb-3">
                        <select
                            value={selectedMachine}
                            onChange={(e) => {
                                // Drop any counts staged against the previous machine before
                                // switching. The rebuild effect seeds from prevState keyed by
                                // itemId alone, so without this the old machine's quantities
                                // carry over and get logged against the new one.
                                setMachineItems({});
                                setSelectedMachine(e.target.value);
                            }}
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
                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${viewMode === "BAG" ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                            >
                                Bag Inventory
                            </button>
                            <button
                                onClick={() => setViewMode("MACHINE")}
                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${viewMode === "MACHINE" ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
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
                            {primaryRows.map((row) => (
                                <RefillRow
                                    key={row.itemId}
                                    row={row}
                                    viewMode={viewMode}
                                    updateItem={updateItem}
                                    applyHint={applyHint}
                                />
                            ))}

                            {/* Everything the machine still looks stocked on. Collapsed,
                                never dropped — the estimate is an estimate, and the
                                driver is the one looking at the actual shelf. */}
                            {secondaryRows.length > 0 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setShowAllItems(v => !v)}
                                        aria-expanded={showAllItems}
                                        className="w-full flex items-center justify-between gap-3 min-h-[44px] px-4 py-3 rounded-2xl bg-white dark:bg-[#1a1a1c] border border-dashed border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-accent-blue/50 transition-colors"
                                    >
                                        <span className="text-xs font-bold text-left">
                                            {showAllItems ? "Hide" : "Show"} {secondaryRows.length} item{secondaryRows.length === 1 ? "" : "s"} that should still be stocked
                                        </span>
                                        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showAllItems ? "rotate-180" : ""}`} />
                                    </button>

                                    {showAllItems && secondaryRows.map((row) => (
                                        <RefillRow
                                            key={row.itemId}
                                            row={row}
                                            viewMode={viewMode}
                                            updateItem={updateItem}
                                            applyHint={applyHint}
                                        />
                                    ))}
                                </>
                            )}

                            {primaryRows.length === 0 && secondaryRows.length === 0 && (
                                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm font-medium">
                                    {itemSearch ? `Nothing matches "${itemSearch}".` : "No items in this view."}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Action Bar.
                `fixed` below `sm`, `absolute` from `sm` up. It was `absolute` at
                every width inside a box whose height is its content, so on a
                phone the Submit button sat at the bottom of the *item list* —
                a driver with 20 items had to scroll past all of them to reach
                the only button on the screen. It's now pinned to the viewport
                and lifted clear of the home indicator. */}
            {selectedMachine && (
                <div className="fixed sm:absolute bottom-0 left-0 right-0 p-3 sm:p-4 pb-safe sm:pb-4 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-xl border-t border-slate-200 dark:border-white/10 z-50" style={{ ["--safe-extra" as string]: "0.75rem" }}>
                    <div className="max-w-md mx-auto">
                        {/* What is actually about to be submitted. Without this the
                            driver's only confirmation of a 15-item count is the
                            toast *after* it has already been written. */}
                        <div className="flex items-center justify-between gap-2 px-1 pb-2 font-mono text-[10px] font-bold uppercase tracking-widest">
                            {stagedSummary.items === 0 ? (
                                <span className="text-slate-400 dark:text-slate-500">Nothing counted yet</span>
                            ) : (
                                <>
                                    <span className={stagedSummary.unconfirmed > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}>
                                        {stagedSummary.items} item{stagedSummary.items === 1 ? "" : "s"} staged
                                        {stagedSummary.unconfirmed > 0 && ` · ${stagedSummary.unconfirmed} unchecked`}
                                    </span>
                                    <span className="flex items-center gap-2 shrink-0">
                                        {stagedSummary.refilled > 0 && (
                                            <span className="text-accent-green">+{stagedSummary.refilled} in</span>
                                        )}
                                        {stagedSummary.returned > 0 && (
                                            <span className="text-accent-orange">{stagedSummary.returned} out</span>
                                        )}
                                        {stagedSummary.bagReturned > 0 && (
                                            <span className="text-accent-orange">{stagedSummary.bagReturned} to WH</span>
                                        )}
                                    </span>
                                </>
                            )}
                        </div>

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
                            ) : stagedSummary.unconfirmed > 0 ? (
                                <>
                                    <ListChecks className="w-5 h-5" />
                                    Review {stagedSummary.unconfirmed} prefilled
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    {isOffline ? "Save Offline" : "Submit Inventory"}
                                </>
                            )}
                        </motion.button>
                    </div>
                </div>
            )}

            <PrefillReviewSheet
                isOpen={isReviewOpen}
                rows={Object.values(machineItems).filter(r => r.refilled > 0 || r.returned > 0 || r.bag_returned > 0)}
                machineName={activeMachineDetails?.location_name || ""}
                isOffline={isOffline}
                onClose={() => setIsReviewOpen(false)}
                onConfirm={confirmAllAndSubmit}
            />
        </div>
    )
}

/**
 * The gate on prefill mode.
 *
 * Prefill puts a number in every box before the driver has looked at any of
 * them, and every one of those numbers is written to `RefillLog` as units sold
 * — revenue, on a row the ledger never rewrites. So the tap that would have
 * been "type 8 numbers" becomes "read 8 numbers once". That is the whole cost
 * of the prefill approach, and it is deliberately visible: if reading the list
 * turns out to be slower than tapping the chips, the drivers will find that out
 * in a week and pick the other mode.
 */
function PrefillReviewSheet({
    isOpen,
    rows,
    machineName,
    isOffline,
    onClose,
    onConfirm,
}: {
    isOpen: boolean;
    rows: ItemFormState[];
    machineName: string;
    isOffline: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const { panelRef, dialogProps } = useModalBehavior({
        isOpen,
        onClose,
        labelledBy: "prefill-review-title",
    });

    if (!isOpen) return null;

    const totalUnits = rows.reduce((sum, r) => sum + r.refilled, 0);
    const uncheckedCount = rows.filter(r => r.refilled > 0 && !r.confirmed).length;

    return (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
            <div
                ref={panelRef}
                {...dialogProps}
                className="w-full sm:max-w-md bg-white dark:bg-[#1a1a1c] rounded-t-[2rem] sm:rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col max-h-[85dvh]"
            >
                <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-start justify-between gap-3 shrink-0">
                    <div>
                        <h2 id="prefill-review-title" className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                            Check before saving
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {uncheckedCount} of these {uncheckedCount === 1 ? "was" : "were"} filled in for you
                            {machineName ? ` at ${machineName}` : ""}. These numbers are recorded as sold.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Back to editing"
                        className="p-2 -m-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar divide-y divide-slate-100 dark:divide-white/5">
                    {rows.map(row => (
                        <div key={row.itemId} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{row.item?.name}</p>
                                <p className="text-[10px] font-mono text-slate-500">
                                    [{row.item?.sku || '0000'}]
                                    {row.prefilled && !row.confirmed && <span className="text-amber-600 dark:text-amber-400 font-bold"> · prefilled</span>}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-mono text-xs font-bold">
                                {row.refilled > 0 && <span className="text-accent-green">+{row.refilled}</span>}
                                {row.returned > 0 && <span className="text-accent-orange">−{row.returned}</span>}
                                {row.bag_returned > 0 && <span className="text-accent-orange">{row.bag_returned} WH</span>}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-5 border-t border-slate-200 dark:border-white/10 shrink-0 pb-safe sm:pb-5" style={{ ["--safe-extra" as string]: "1.25rem" }}>
                    <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">
                        <span>{rows.length} line{rows.length === 1 ? "" : "s"}</span>
                        <span className="text-accent-green">+{totalUnits} units into the machine</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 h-12 rounded-2xl font-bold text-sm border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                        >
                            Fix something
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className="flex-1 h-12 rounded-2xl font-bold text-sm bg-accent-blue text-black hover:bg-accent-blue/90 transition-colors"
                        >
                            {isOffline ? "Correct — save offline" : "Correct — save"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * One item on the refill sheet.
 *
 * Extracted from an inline `.map()` so the "needs stock" group and the collapsed
 * "still stocked" group render byte-identical rows — two copies of 140 lines of
 * markup would have drifted within a sprint.
 */
function RefillRow({
    row,
    viewMode,
    updateItem,
    applyHint,
}: {
    row: ItemFormState;
    viewMode: "BAG" | "MACHINE";
    updateItem: (id: number, field: keyof ItemFormState, val: any) => void;
    applyHint: (id: number, lastQty: number, maxFromBag: number) => void;
}) {
    const isModified = row.refilled > 0 || row.returned > 0;
    const needsCheck = row.prefilled && !row.confirmed;
    const bagBudget = row.bagQuantity - row.bag_returned;
    // A hint is only useful while there's something in the bag to act on it with.
    const showHint = viewMode === "BAG" && row.lastQty !== null && bagBudget > 0 && !needsCheck;
    const hintCapped = row.lastQty !== null && row.lastQty > bagBudget;
    const hintApplied = row.lastQty !== null && row.refilled === Math.min(row.lastQty, bagBudget);

    const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    };

    return (
        <div className={`p-4 rounded-3xl transition-colors border ${
            needsCheck
                ? 'bg-amber-50 dark:bg-amber-500/5 border-amber-400/60 shadow-sm'
                : isModified
                    ? 'bg-accent-blue/5 border-accent-blue/40 shadow-sm'
                    : 'bg-white dark:bg-[#1a1a1c] border-slate-200 dark:border-white/5'
        }`}>

            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3 flex-1 pr-2">
                    <div className="flex-shrink-0">
                        {row.item.imageUrl ? (
                            <label className="relative block w-16 h-16 cursor-pointer group">
                                <img src={row.item.imageUrl} alt={row.item.name} className="w-16 h-16 rounded-xl object-cover bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 group-hover:opacity-50 transition-opacity shadow-sm" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="w-6 h-6 text-white" />
                                </div>
                                <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
                            </label>
                        ) : (
                            <label className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm gap-1">
                                <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
                                <Camera className="w-5 h-5 text-slate-400" />
                                <span className="text-[8px] font-bold text-slate-500 uppercase">Add Photo</span>
                            </label>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight mb-1">
                            <span className="font-mono text-slate-500 dark:text-slate-400 font-medium">[{row.item.sku || '0000'}]</span> {row.item.name}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${row.inBag && row.bagQuantity > 0 ? 'bg-accent-blue/20 text-accent-blue' : row.inBag && row.bagQuantity === 0 ? 'bg-accent-pink/20 text-accent-pink' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'}`}>
                                Bag: {row.bagQuantity}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                SYS: <span className="font-bold">{Math.max(0, row.estimated_stock + row.refilled - row.returned)}</span>
                            </span>
                            {needsCheck && (
                                <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Prefilled — check
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Suggestion chip. One tap lands within ±2 of the right answer about
                70% of the time on this fleet's history — good enough to save the
                keyboard, not good enough to apply on the driver's behalf. */}
            {showHint && (
                <button
                    type="button"
                    onClick={() => applyHint(row.itemId, row.lastQty!, bagBudget)}
                    disabled={hintApplied}
                    className={`w-full min-h-[44px] mb-1 flex items-center justify-center gap-2 rounded-2xl px-3 text-xs font-bold border transition-colors ${
                        hintApplied
                            ? 'bg-accent-green/10 border-accent-green/40 text-accent-green'
                            : 'bg-slate-50 dark:bg-black/30 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-accent-blue/60 active:bg-slate-100 dark:active:bg-white/5'
                    }`}
                >
                    {hintApplied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
                    {hintApplied
                        ? `Matches last visit (${row.lastQty})`
                        : `Last visit: ${row.lastQty}${hintCapped ? ` — bag has ${bagBudget}` : ""}`}
                </button>
            )}

            <div className="flex items-start justify-between gap-2 pt-3 border-t border-slate-100 dark:border-white/5 w-full">

                {/* Returned Counter (Machine View Only) */}
                {viewMode === "MACHINE" && (
                    <QtyStepper
                        label="Returned (From Machine)"
                        labelClass="text-accent-orange"
                        value={row.returned}
                        ariaLabel="Returned quantity"
                        onChange={(n) => updateItem(row.itemId, 'returned', n)}
                    />
                )}

                {/* Refilled & Bag Returned Counters (Bag View Only) */}
                {viewMode === "BAG" && (
                    <>
                        <QtyStepper
                            label="Refilled (Machine)"
                            labelClass="text-accent-green"
                            value={row.refilled}
                            ariaLabel="Refilled quantity"
                            max={row.bagQuantity - row.bag_returned}
                            overBudget={row.refilled + row.bag_returned > row.bagQuantity}
                            onChange={(n) => updateItem(row.itemId, 'refilled', n)}
                            onBlur={() => {
                                if (row.refilled + row.bag_returned > row.bagQuantity) {
                                    updateItem(row.itemId, 'refilled', Math.max(0, row.bagQuantity - row.bag_returned));
                                    toast.warning(`Capped to bag size (${row.bagQuantity}).`);
                                }
                            }}
                        />

                        <QtyStepper
                            label="Return (Warehouse)"
                            labelClass="text-accent-orange"
                            value={row.bag_returned}
                            ariaLabel="Bag returned quantity"
                            max={row.bagQuantity - row.refilled}
                            overBudget={row.refilled + row.bag_returned > row.bagQuantity}
                            onChange={(n) => updateItem(row.itemId, 'bag_returned', n)}
                            onBlur={() => {
                                if (row.refilled + row.bag_returned > row.bagQuantity) {
                                    updateItem(row.itemId, 'bag_returned', Math.max(0, row.bagQuantity - row.refilled));
                                    toast.warning(`Capped to bag size (${row.bagQuantity}).`);
                                }
                            }}
                        />
                    </>
                )}

            </div>

        </div>
    );
}

/**
 * One quantity control. All three counters on the refill sheet were separate
 * 20-line copies of the same markup with 40px hit targets; this is the single
 * version, at 44px — the minimum comfortable target — with the label wired to
 * the input so a tap on the caption focuses the box.
 *
 * `max` bounds the "+" button only. Typing is deliberately left unbounded so the
 * caller's `onBlur` can explain the cap with a toast instead of silently
 * rewriting digits under the driver's finger.
 */
function QtyStepper({
    label,
    labelClass,
    value,
    onChange,
    onBlur,
    ariaLabel,
    max,
    overBudget = false,
}: {
    label: string;
    labelClass: string;
    value: number;
    onChange: (n: number) => void;
    onBlur?: () => void;
    ariaLabel: string;
    max?: number;
    overBudget?: boolean;
}) {
    return (
        <div className="flex flex-col flex-1 min-w-0">
            <span className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 text-center block truncate ${labelClass}`}>
                {label}
            </span>
            <div className="mx-auto flex items-center h-11 w-full max-w-[150px] bg-slate-50 dark:bg-black/30 rounded-full border border-slate-200 dark:border-white/5 shrink-0 overflow-hidden">
                <button
                    type="button"
                    aria-label={`Decrease ${ariaLabel}`}
                    onClick={() => onChange(Math.max(0, value - 1))}
                    className="w-11 h-full flex items-center justify-center text-xl leading-none text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300 dark:active:bg-white/10 disabled:opacity-30"
                    disabled={value <= 0}
                >
                    −
                </button>
                <NumericInput
                    autoComplete="off"
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    aria-label={ariaLabel}
                    className={`flex-1 min-w-0 w-full text-center font-bold bg-transparent border-none outline-none ${overBudget ? 'text-accent-pink' : 'text-slate-900 dark:text-white'}`}
                />
                <button
                    type="button"
                    aria-label={`Increase ${ariaLabel}`}
                    onClick={() => onChange(max === undefined ? value + 1 : Math.max(0, Math.min(max, value + 1)))}
                    className="w-11 h-full flex items-center justify-center text-xl leading-none text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 active:bg-slate-300 dark:active:bg-white/10"
                >
                    +
                </button>
            </div>
        </div>
    );
}
