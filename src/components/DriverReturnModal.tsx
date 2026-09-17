"use client";

import { useId, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { X, Search, Undo2, Info, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { returnDriverStockToWarehouse } from "@/actions/driver-stock";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NumericInput } from "@/components/NumericInput";
import { entryKeyNav } from "@/lib/entry-keys";
import type { WarehouseType } from "@/types";

type BagRow = {
    itemId: number;
    quantity_on_hand: number;
    item: { id: number; name: string; sku: string };
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    driver: { id: number; name: string };
    bag: BagRow[];
    warehouses: WarehouseType[];
    /** Pre-selects the warehouse the admin is already working from. */
    defaultWarehouseId?: number | null;
};

/**
 * End-of-day hand-back: the admin counts what the driver brought back and moves
 * it from the bag to the warehouse. Every quantity starts EMPTY on purpose —
 * some stock (water, soft drinks) rides in the van overnight, so "return the
 * whole bag" is a shortcut the admin opts into, never the default. Whatever is
 * left empty stays in the bag.
 *
 * Rows keep the order they arrive in (alphabetical) and never re-sort on a typed
 * value — the focused row must not move under the cursor.
 */
export default function DriverReturnModal({ isOpen, onClose, driver, bag, warehouses, defaultWarehouseId }: Props) {
    const titleId = useId();
    // Holds a typed count of up to ~60 lines — a stray Escape must not bin it.
    const { panelRef, dialogProps } = useModalBehavior({ isOpen, onClose, closeOnEscape: false, labelledBy: titleId });
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [searchQuery, setSearchQuery] = useState("");
    const [showConfirm, setShowConfirm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const activeWarehouses = useMemo(() => warehouses.filter((w) => w.isActive), [warehouses]);
    const [warehouseId, setWarehouseId] = useState<number | null>(null);

    useEffect(() => setMounted(true), []);

    // Fresh sheet per open: yesterday's count is never today's.
    useEffect(() => {
        if (!isOpen) return;
        setQuantities({});
        setSearchQuery("");
        setShowConfirm(false);
        const preferred = activeWarehouses.find((w) => w.id === defaultWarehouseId) ?? activeWarehouses[0];
        setWarehouseId(preferred?.id ?? null);
        // Deliberately not keyed on the warehouse list: a realtime refresh hands
        // us a new array, and re-seeding would wipe a count in progress.
    }, [isOpen, driver.id]);

    if (!isOpen || !mounted) return null;

    const q = searchQuery.trim().toLowerCase();
    const visibleRows = q
        ? bag.filter((r) => r.item.name.toLowerCase().includes(q) || r.item.sku.toLowerCase().includes(q))
        : bag;

    // Clamp against the live bag: a realtime refresh can shrink it while the sheet is open.
    const staged = bag
        .map((r) => ({ row: r, qty: Math.min(quantities[r.itemId] || 0, r.quantity_on_hand) }))
        .filter((s) => s.qty > 0);
    const stagedUnits = staged.reduce((sum, s) => sum + s.qty, 0);
    const warehouseName = activeWarehouses.find((w) => w.id === warehouseId)?.name ?? "the warehouse";

    const setQty = (itemId: number, qty: number) =>
        setQuantities((prev) => {
            const next = { ...prev };
            if (qty > 0) next[itemId] = qty;
            else delete next[itemId];
            return next;
        });

    const fillAll = () => setQuantities(Object.fromEntries(bag.map((r) => [r.itemId, r.quantity_on_hand])));

    const executeSubmit = async () => {
        if (!warehouseId || staged.length === 0) return;
        setIsSubmitting(true);
        try {
            const result = await returnDriverStockToWarehouse(
                driver.id,
                warehouseId,
                staged.map((s) => ({ itemId: s.row.itemId, quantity: s.qty }))
            );
            if (result.success) {
                toast.success("Returned to warehouse", {
                    description: `${result.data.units} unit${result.data.units === 1 ? "" : "s"} from ${driver.name} are back in ${warehouseName}.`,
                });
                onClose();
            } else {
                toast.error("Return failed", { description: result.error });
            }
        } catch {
            toast.error("Server error while returning stock");
        } finally {
            setIsSubmitting(false);
            setShowConfirm(false);
        }
    };

    const modalContent = (
        <>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 text-left">
                <div className="absolute inset-0 bg-slate-900/40 dark:bg-zinc-950/80 backdrop-blur-md" onClick={onClose} />
                <div ref={panelRef} {...dialogProps} className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl flex flex-col max-h-[85dvh] overflow-hidden shadow-2xl">

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 shrink-0 rounded-xl bg-accent-green/10 flex items-center justify-center border border-accent-green/20">
                                <Undo2 className="w-5 h-5 text-accent-green" />
                            </div>
                            <div className="min-w-0">
                                <h2 id={titleId} className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">Return to Warehouse</h2>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">From {driver.name}&apos;s bag</p>
                            </div>
                        </div>
                        <button onClick={onClose} aria-label="Close return to warehouse" className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-full transition-colors hidden sm:block">
                            <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                        </button>
                    </div>

                    {/* Controls */}
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 space-y-3">
                        <div className="flex gap-3 items-start bg-accent-blue/5 border border-accent-blue/20 rounded-xl px-4 py-3">
                            <Info className="w-4 h-4 text-accent-blue shrink-0 mt-0.5" />
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                <span className="font-bold text-slate-800 dark:text-slate-100">Type what {driver.name} handed back.</span> Those items leave the bag and go back into warehouse stock. Anything you leave empty stays in the bag, like drinks kept in the van.
                            </p>
                        </div>

                        {activeWarehouses.length > 1 && (
                            <label className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                                <span className="shrink-0 uppercase tracking-widest text-[10px] text-slate-500 dark:text-slate-400">Return to</span>
                                <select
                                    value={warehouseId ?? ""}
                                    onChange={(e) => setWarehouseId(parseInt(e.target.value, 10))}
                                    className="flex-1 min-h-11 bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl px-3 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-accent-blue/50"
                                >
                                    {activeWarehouses.map((w) => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search the bag..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full min-h-11 bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-accent-blue/50 transition-colors"
                                />
                            </div>
                            <button
                                onClick={fillAll}
                                className="min-h-11 px-4 shrink-0 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
                            >
                                Fill everything
                            </button>
                            {staged.length > 0 && (
                                <button
                                    onClick={() => setQuantities({})}
                                    className="min-h-11 px-4 shrink-0 bg-slate-100 dark:bg-white/5 hover:bg-accent-pink/10 hover:text-accent-pink border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bag rows */}
                    <div data-entry-group className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-zinc-950 custom-scrollbar space-y-2">
                        {visibleRows.length === 0 ? (
                            <p className="py-10 text-center text-sm font-medium text-slate-500">No items in the bag match your search</p>
                        ) : visibleRows.map((r) => {
                            const qty = Math.min(quantities[r.itemId] || 0, r.quantity_on_hand);
                            const isStaged = qty > 0;
                            return (
                                <div key={r.itemId} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isStaged ? "border-accent-green/50 bg-accent-green/5" : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-slate-900 dark:text-zinc-100 leading-tight">{r.item.name}</div>
                                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                                            {isStaged
                                                ? qty === r.quantity_on_hand ? `All ${r.quantity_on_hand} going back` : `${r.quantity_on_hand - qty} of ${r.quantity_on_hand} stay in the bag`
                                                : `${r.quantity_on_hand} in the bag`}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setQty(r.itemId, r.quantity_on_hand)}
                                        disabled={qty === r.quantity_on_hand}
                                        aria-label={`Return all ${r.quantity_on_hand} ${r.item.name}`}
                                        className="min-h-11 px-3 shrink-0 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
                                    >
                                        All {r.quantity_on_hand}
                                    </button>
                                    <NumericInput
                                        data-entry
                                        onKeyDown={entryKeyNav}
                                        aria-label={`Quantity of ${r.item.name} returned`}
                                        placeholder="0"
                                        max={r.quantity_on_hand}
                                        value={qty}
                                        onChange={(n) => setQty(r.itemId, n)}
                                        className={`w-20 min-h-11 shrink-0 text-center text-base font-bold rounded-lg border px-2 focus:outline-none focus:ring-2 focus:ring-accent-green/40 ${isStaged ? "border-accent-green/60 bg-white dark:bg-zinc-950 text-accent-green" : "border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100"}`}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex flex-col sm:flex-row items-center gap-3 justify-between">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300 text-center sm:text-left">
                            {staged.length === 0
                                ? "Nothing selected yet"
                                : <><span className="font-bold text-slate-900 dark:text-white">{stagedUnits} unit{stagedUnits === 1 ? "" : "s"}</span> across {staged.length} item{staged.length === 1 ? "" : "s"} going back</>}
                        </p>
                        <div className="flex gap-3 w-full sm:w-auto">
                            <button onClick={onClose} className="px-6 py-3 sm:hidden w-full bg-slate-200 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 rounded-xl text-sm font-bold">
                                Cancel
                            </button>
                            <button
                                onClick={() => setShowConfirm(true)}
                                disabled={staged.length === 0 || !warehouseId || isSubmitting}
                                className="w-full sm:w-auto px-6 py-3 bg-accent-green hover:bg-accent-green/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                            >
                                <PackageCheck className="w-4 h-4" />
                                Return to Warehouse
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {/* Sibling under the portal wrapper, above the z-[9999] panel — see "Modal stacking" in CLAUDE.md. */}
            <ConfirmModal
                isOpen={showConfirm}
                isDestructive={false}
                title="Return to Warehouse"
                message={`Move ${stagedUnits} unit${stagedUnits === 1 ? "" : "s"} across ${staged.length} item${staged.length === 1 ? "" : "s"} from ${driver.name}'s bag into ${warehouseName}? Everything else stays in the bag.`}
                confirmText="Yes, Return Them"
                isPending={isSubmitting}
                onConfirm={executeSubmit}
                onCancel={() => setShowConfirm(false)}
            />
        </>
    );

    return createPortal(
        <div className={resolvedTheme === "dark" ? "dark" : ""}>{modalContent}</div>,
        document.body
    );
}
