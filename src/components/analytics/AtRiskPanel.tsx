import Link from "next/link";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import Panel from "./Panel";
import type { StockoutForecast } from "@/types";

/**
 * ============================================================================
 * AT-RISK QUEUE
 *
 * The same computation the 06:00 stock-alert push runs — `computeStockoutForecast()`
 * in src/lib/stockout.ts — surfaced on the page where an admin is already
 * looking. Deliberately the same function and not a second opinion: a
 * dashboard that disagrees with the notification an admin got at breakfast is
 * worse than no dashboard.
 *
 * "At risk" is measured against each machine-item's OWN visit cadence, not a
 * fixed unit threshold. A slot that sells two a day and is visited weekly is
 * in trouble at ten units; one that sells a fifth of that is fine. Critical
 * means it is projected to run dry BEFORE the next visit is due.
 *
 * The meter's track is a light step of the fill's own hue rather than grey, so
 * the severity reads across the whole bar and not just the filled part.
 * ============================================================================
 */
export default function AtRiskPanel({ rows }: { rows: StockoutForecast[] }) {
    return (
        <Panel
            title="Running dry before the next visit"
            subtitle="Projected against each machine's own measured service cadence, not a fixed threshold."
            icon={<ShieldAlert className="w-5 h-5" />}
            accent="text-accent-orange"
            caveat="On-hand figures are estimates carried forward from the last refill, not meter readings, and demand is reconstructed from refilled-minus-returned. Treat this as a queue to check, not a count."
            action={
                <Link
                    href="/admin/machine-stock"
                    // The padding is the tap target: as bare text this link was a
                    // 14px-tall strip, and it is the one place this card hands the
                    // reader off to somewhere they can act.
                    className="inline-flex items-center min-h-11 sm:min-h-0 -my-2 sm:my-0 px-2 -mx-2 sm:mx-0 sm:px-0 rounded-lg text-[11px] font-semibold text-accent-blue hover:underline whitespace-nowrap"
                >
                    Machine stock →
                </Link>
            }
        >
            {rows.length === 0 ? (
                <div className="flex items-center gap-2.5 py-8 justify-center text-sm font-medium text-accent-green">
                    <CheckCircle2 className="w-5 h-5" />
                    Nothing is projected to run dry before its next scheduled visit.
                </div>
            ) : (
                <ul className="divide-y divide-slate-200 dark:divide-white/5">
                    {rows.map((row) => {
                        const critical = row.riskLevel === "critical";
                        const days = row.daysUntilEmpty;
                        // Fraction of the way to the next expected visit that the
                        // current stock actually covers. Full bar = it makes it.
                        const covered = days === null ? 1 : Math.min(1, days / Math.max(1, row.visitCadenceDays));

                        return (
                            <li key={`${row.machineId}-${row.itemId}`} className="py-3.5 first:pt-0 last:pb-0">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                            {row.itemName}
                                        </p>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                                            {row.machineName}
                                            <span className="text-slate-400 dark:text-slate-500"> · {row.district}</span>
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p
                                            className={`text-sm font-bold tabular-nums ${
                                                critical ? "text-accent-pink" : "text-accent-orange"
                                            }`}
                                        >
                                            {days === null ? "—" : `${days} day${days === 1 ? "" : "s"}`}
                                        </p>
                                        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-0.5">
                                            of stock left
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-2.5 flex items-center gap-3">
                                    {/* Track is a light step of the fill's own hue — severity
                                        reads across the whole meter, not just the filled part. */}
                                    <div
                                        className={`h-1.5 flex-1 rounded-full overflow-hidden ${
                                            critical ? "bg-accent-pink/20" : "bg-accent-orange/20"
                                        }`}
                                    >
                                        <div
                                            className={`h-full rounded-full ${
                                                critical ? "bg-accent-pink" : "bg-accent-orange"
                                            }`}
                                            style={{ width: `${Math.max(3, covered * 100)}%` }}
                                        />
                                    </div>
                                    <span
                                        className={`flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${
                                            critical ? "text-accent-pink" : "text-accent-orange"
                                        }`}
                                    >
                                        {/* Status never rides on colour alone. */}
                                        <AlertTriangle className="w-3 h-3" />
                                        {critical ? "Critical" : "Warning"}
                                    </span>
                                </div>

                                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                    {row.currentStock} on hand · sells ~{row.estDailyDemand}/day · visited every{" "}
                                    {row.visitCadenceDays} days · suggest sending{" "}
                                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                                        {row.recommendedAssignQty}
                                    </span>{" "}
                                    <span className="opacity-70">({row.confidence} confidence)</span>
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}
