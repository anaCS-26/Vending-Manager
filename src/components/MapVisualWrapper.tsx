"use client";

import dynamic from "next/dynamic";
import { Activity } from "lucide-react";

const MapVisual = dynamic(() => import("./MapVisual"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[280px] sm:h-[450px] rounded-3xl bg-black/20 animate-pulse border border-slate-200 dark:border-white/5 flex items-center justify-center shadow-2xl">
            <Activity className="w-8 h-8 text-accent-blue animate-spin" />
        </div>
    )
});

export default function MapVisualWrapper({ machines, predictions, warehouses = [] }: { machines: any[], predictions?: any[], warehouses?: any[] }) {
    return <MapVisual machines={machines} predictions={predictions} warehouses={warehouses} />;
}
