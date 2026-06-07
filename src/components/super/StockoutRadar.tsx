import { cn } from "@/lib/utils";
import type { StockoutForecast } from "@/types";

/**
 * Stockout Radar table (experimental AI Lab). Presentational + server-rendered —
 * one row per at-risk machine-item, ordered most-urgent first by the action.
 */

const RISK: Record<StockoutForecast["riskLevel"], { token: string; dot: string; label: string }> = {
    critical: { token: "text-accent-pink", dot: "bg-accent-pink", label: "Runs dry before next visit" },
    warning: { token: "text-accent-orange", dot: "bg-accent-orange", label: "Getting low" },
    ok: { token: "text-slate-400", dot: "bg-slate-300 dark:bg-slate-600", label: "Healthy" },
};

const CONFIDENCE: Record<StockoutForecast["confidence"], string> = {
    high: "text-accent-green border-accent-green/30 bg-accent-green/5",
    medium: "text-accent-blue border-accent-blue/30 bg-accent-blue/5",
    low: "text-slate-400 border-slate-300/40 dark:border-white/10 bg-slate-400/5",
};

export default function StockoutRadar({ forecasts }: { forecasts: StockoutForecast[] }) {
    if (forecasts.length === 0) {
        return (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                No demand history yet — refill a few machines, then check back.
            </p>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <th className="py-2 pr-4 font-bold text-left">Machine · Item</th>
                        <th className="py-2 px-3 font-bold text-right">Est. demand</th>
                        <th className="py-2 px-3 font-bold text-right">Days left</th>
                        <th className="py-2 px-3 font-bold text-right">Assign qty</th>
                        <th className="py-2 pl-3 font-bold text-right">Confidence</th>
                    </tr>
                </thead>
                <tbody>
                    {forecasts.map((f) => {
                        const risk = RISK[f.riskLevel];
                        const bump = f.recommendedAssignQty !== f.currentAssignQty;
                        return (
                            <tr key={`${f.machineId}-${f.itemId}`} className="border-t border-slate-100 dark:border-white/5">
                                <td className="py-3 pr-4">
                                    <div className="flex items-center gap-2.5">
                                        <span className={cn("w-2 h-2 rounded-full shrink-0", risk.dot)} title={risk.label} />
                                        <div className="min-w-0">
                                            <p className="font-semibold text-slate-900 dark:text-white truncate">{f.itemName}</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                {f.machineName} · {f.district}
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {f.estDailyDemand}/day
                                </td>
                                <td className={cn("py-3 px-3 text-right tabular-nums font-bold", risk.token)}>
                                    {f.daysUntilEmpty == null ? "—" : `${f.daysUntilEmpty}d`}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums whitespace-nowrap">
                                    <span className="text-slate-400 dark:text-slate-500">{f.currentAssignQty}</span>
                                    <span className="mx-1 text-slate-300 dark:text-slate-600">→</span>
                                    <span className={cn("font-bold", bump ? "text-accent-blue" : "text-slate-700 dark:text-slate-300")}>
                                        {f.recommendedAssignQty}
                                    </span>
                                </td>
                                <td className="py-3 pl-3 text-right">
                                    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border", CONFIDENCE[f.confidence])}>
                                        {f.confidence}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
