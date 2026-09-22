"use client";

import type { ReactNode } from "react";
import { NumericInput } from "@/components/NumericInput";
import { describeCartonSum, levelsOf, MAX_PACKETS_PER_CARTON, MAX_PIECES_PER_BOX, packetsPerCartonFromPackCode } from "@/lib/packaging";

const labelClass = "text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-1 block px-1";

/**
 * "How the supplier packs it": packets per carton and pieces per packet, with
 * the multiplication written out underneath so a wrong number is visible
 * before it is saved. Shared by Manage → Items and the PO "New Item" modal.
 *
 * The second field's label follows the first: with packets it is "Pieces per
 * packet", without them the carton holds the pieces directly ("Pieces per
 * carton", e.g. 40 bottles of water) — both are `Item.pieces_per_box`.
 */
export function ItemPackagingFields({
    itemId,
    packCode,
    packets,
    pieces,
    onChange,
    inputClassName,
    children,
}: {
    itemId: number | string;
    /** `Item.bulk_format`, e.g. "8*20*5GM" — offered as a one-tap fill. */
    packCode?: string | null;
    packets: number;
    pieces: number;
    onChange: (patch: { packets_per_carton?: number; pieces_per_box?: number }) => void;
    inputClassName: string;
    /** Extra fields laid out in the same grid (the piece size). */
    children?: ReactNode;
}) {
    const hasPacketLevel = packets > 1;
    const sum = describeCartonSum(levelsOf({ pieces_per_box: pieces, packets_per_carton: packets }));
    const suggested = packets ? null : packetsPerCartonFromPackCode(packCode, pieces);

    return (
        <div className="grid grid-cols-2 gap-2">
            <div>
                <label htmlFor={`item-packets-${itemId}`} className={labelClass}>Packets per carton</label>
                <NumericInput
                    id={`item-packets-${itemId}`}
                    max={MAX_PACKETS_PER_CARTON}
                    value={packets}
                    onChange={packets_per_carton => onChange({ packets_per_carton })}
                    className={inputClassName}
                    placeholder="None"
                />
            </div>
            <div>
                <label htmlFor={`item-per-box-${itemId}`} className={labelClass}>{hasPacketLevel ? "Pieces per packet" : "Pieces per carton"}</label>
                <NumericInput
                    id={`item-per-box-${itemId}`}
                    max={MAX_PIECES_PER_BOX}
                    value={pieces}
                    onChange={pieces_per_box => onChange({ pieces_per_box })}
                    className={inputClassName}
                    placeholder="e.g. 24"
                />
            </div>
            {children}
            <div className="col-span-2 space-y-1 px-1">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200" data-testid={`item-carton-sum-${itemId}`}>
                    {sum ?? "Comes loose, with no carton."}
                </p>
                {suggested && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        The pack code {packCode} says {suggested} packets in a carton.{" "}
                        <button
                            type="button"
                            onClick={() => onChange({ packets_per_carton: suggested })}
                            className="min-h-8 font-bold text-accent-purple hover:underline"
                        >
                            Use {suggested}
                        </button>
                    </p>
                )}
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    How the supplier packs it. Leave packets empty when the carton holds the pieces directly, like a carton of 24 cans. Orders and deliveries are counted in cartons; stock is still counted in pieces.
                </p>
            </div>
        </div>
    );
}
