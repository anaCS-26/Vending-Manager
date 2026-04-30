"use client";

import { useState } from "react";
import { PackageX } from "lucide-react";
import { DriverReturnSheet } from "./DriverReturnSheet";

type BagRow = {
    id: number;
    itemId: number;
    quantity_on_hand: number;
    item: { id: number; name: string; sku: string };
};

/**
 * Floating "Return items" button for the driver portal. Opens the
 * DriverReturnSheet over the page. Hidden when the bag is empty so we don't
 * clutter the UI for drivers who haven't received anything yet.
 */
export function DriverReturnTrigger({ bag }: { bag: BagRow[] }) {
    const [open, setOpen] = useState(false);
    if (bag.length === 0) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 bg-accent-orange text-white font-bold py-3 px-4 rounded-2xl shadow-2xl shadow-accent-orange/30 hover:bg-accent-orange/90 transition-colors sm:right-[calc(50%-14rem)] md:right-[calc(50%-13rem)]"
                title="Return items to warehouse"
            >
                <PackageX className="w-4 h-4" />
                <span className="text-sm">Return</span>
            </button>
            <DriverReturnSheet bag={bag} open={open} onClose={() => setOpen(false)} />
        </>
    );
}
