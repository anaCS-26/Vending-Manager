"use client";
import { useState, useTransition } from "react";
import { editDriverBagStock } from "@/actions/inventory";
import { toast } from "sonner";
import { Package, Calendar, Loader2, Save, AlertTriangle, ShieldCheck, Trash2 } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NumericInput } from "@/components/NumericInput";
import type { DriverType } from "@/types";

interface DriverBagManagerProps {
    drivers: DriverType[];
}

export function DriverBagManager({ drivers }: DriverBagManagerProps) {
    const [isPending, startTransition] = useTransition();
    const [edits, setEdits] = useState<Record<number, Record<number, number>>>({}); // driverId -> itemId -> new_qty
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        driverId: number | null;
    }>({ isOpen: false, driverId: null });

    const handleQuantityChange = (driverId: number, itemId: number, newQty: number) => {
        setEdits(prev => {
            const driverEdits = prev[driverId] || {};
            return {
                ...prev,
                [driverId]: {
                    ...driverEdits,
                    [itemId]: newQty
                }
            };
        });
    };

    const handleSave = (driverId: number) => {
        setConfirmModal({ isOpen: true, driverId });
    };

    const executeConfirmAction = () => {
        if (!confirmModal.driverId) return;
        
        const driverId = confirmModal.driverId;
        const driverEdits = edits[driverId];
        if (!driverEdits || Object.keys(driverEdits).length === 0) return;

        const payload = Object.keys(driverEdits).map(itemIdStr => ({
            itemId: parseInt(itemIdStr),
            new_quantity: driverEdits[parseInt(itemIdStr)]
        }));

        startTransition(async () => {
            const result = await editDriverBagStock(driverId, payload);
            if (result.success) {
                toast.success("Driver bag updated successfully!");
                setEdits(prev => {
                    const next = { ...prev };
                    delete next[driverId];
                    return next;
                });
            } else {
                toast.error("Update failed", { description: result.error });
            }
            setConfirmModal({ isOpen: false, driverId: null });
        });
    };

    return (
        <>
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {drivers.map(driver => {
                const stock = (driver.DriverStock || []).filter((s: any) => s.quantity_on_hand > 0);
                const driverEdits = edits[driver.id] || {};
                const hasEdits = Object.keys(driverEdits).length > 0;

                // Sort stock: pending changes first, then updated recently, etc
                const sortedStock = [...stock].sort((a, b) => new Date((b as any).updatedAt).getTime() - new Date((a as any).updatedAt).getTime());

                return (
                    <div key={driver.id} className="glass-panel border-slate-200 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden transition-all">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex flex-shrink-0 items-center justify-center text-accent-blue">
                                    <Package className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight">{driver.name}</h3>
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">{stock.length} unique items in bag</p>
                                </div>
                            </div>
                            
                            <button
                                onClick={() => handleSave(driver.id)}
                                disabled={!hasEdits || isPending}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${hasEdits ? 'bg-accent-blue hover:bg-accent-blue/90 text-slate-900 dark:text-white border-accent-blue' : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 cursor-not-allowed'}`}
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : hasEdits ? <Save className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                                {isPending ? "Saving..." : hasEdits ? "Commit Changes" : "Pristine"}
                            </button>
                        </div>

                        {stock.length === 0 ? (
                            <div className="py-6 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
                                This driver's bag is completely empty.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {sortedStock.map(s => {
                                    const editedQty = driverEdits[s.itemId];
                                    const isEdited = editedQty !== undefined && editedQty !== s.quantity_on_hand;
                                    
                                    // Identify likely ghost inventory (e.g. hasn't moved in a while)
                                    // We will calculate days since update
                                    const daysSinceUpdate = Math.floor((new Date().getTime() - new Date((s as any).updatedAt).getTime()) / (1000 * 60 * 60 * 24));
                                    const isStale = daysSinceUpdate > 3;

                                    return (
                                        <div key={s.id} className={`flex items-start justify-between p-3 rounded-xl border transition-all ${isEdited ? 'border-accent-blue bg-accent-blue/5' : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/20 hover:border-slate-300 dark:hover:border-white/10'}`}>
                                            <div className="flex-1 pr-3">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 leading-tight">
                                                    {s.item.sku && <span className="text-[10px] font-mono text-slate-500 bg-white dark:bg-black px-1 rounded">{s.item.sku}</span>}
                                                    {s.item.name}
                                                </p>
                                                <p className={`text-[10px] font-bold uppercase tracking-widest mt-1.5 flex items-center gap-1 ${isStale ? 'text-accent-orange' : 'text-slate-500 dark:text-slate-400'}`}>
                                                    <Calendar className="w-3 h-3" />
                                                    {daysSinceUpdate === 0 ? 'Updated today' : `${daysSinceUpdate} days stale`}
                                                    {isStale && <AlertTriangle className="w-3 h-3" />}
                                                </p>
                                            </div>
                                            
                                            <div className="flex items-center gap-1.5 flex-col w-16">
                                                <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">QTY</p>
                                                <NumericInput
                                                    value={editedQty !== undefined ? editedQty : s.quantity_on_hand}
                                                    onChange={(q) => handleQuantityChange(driver.id, s.itemId, q)}
                                                    className={`w-full py-1 text-center bg-white dark:bg-black border rounded font-mono text-sm font-bold transition-colors focus:outline-none ${isEdited ? 'border-accent-blue text-accent-blue' : 'border-slate-200 dark:border-white/10 text-slate-900 dark:text-white hover:border-slate-300 dark:hover:border-white/20'}`}
                                                />
                                                {isEdited && editedQty === 0 && (
                                                    <span className="text-[9px] font-bold text-accent-pink uppercase flex items-start gap-1 mt-1 leading-tight text-left">
                                                        <Trash2 className="w-3 h-3 shrink-0" /> Will be removed from bag completely
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                isDestructive={false}
                title="Save Stock Override"
                message="Are you sure you want to override the driver's stock? This action cannot be undone."
                confirmText="Yes, Commit Changes"
                onConfirm={executeConfirmAction}
                onCancel={() => setConfirmModal({ isOpen: false, driverId: null })}
            />
        </>
    );
}
