import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { RANGE_DAYS, type AnalyticsRange } from "@/lib/analytics";

const OPTIONS: { value: AnalyticsRange; label: string }[] = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
];

/**
 * The page's ONE filter, in one row above everything it scopes.
 *
 * Deliberately not a control inside any chart card: every figure on this page
 * — tiles, charts, tables, the movers comparison — is computed from the same
 * slice, so two cards can never be showing different periods while looking
 * identical. It's a set of links rather than a client control so the whole
 * page re-renders on the server against the new window; there is no client
 * state to fall out of sync with the data.
 */
export default function RangeFilter({ active }: { active: AnalyticsRange }) {
    return (
        <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <CalendarRange className="w-3.5 h-3.5" />
                Period
            </span>
            <div
                role="group"
                aria-label="Reporting period"
                className="flex p-1 rounded-2xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10"
            >
                {OPTIONS.map((option) => {
                    const isActive = option.value === active;
                    return (
                        <Link
                            key={option.value}
                            href={`/admin/analytics?range=${option.value}`}
                            aria-current={isActive ? "true" : undefined}
                            // 44px tall on a phone. This is the control that
                            // scopes every figure on the page — a 30px link is a
                            // mis-tap away from re-reading the wrong period.
                            className={`flex items-center justify-center min-h-11 sm:min-h-0 px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                                isActive
                                    ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            }`}
                        >
                            {option.label}
                        </Link>
                    );
                })}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                compared against the previous {RANGE_DAYS[active]} days
            </span>
        </div>
    );
}
