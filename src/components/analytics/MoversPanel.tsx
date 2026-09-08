import { ArrowDownRight, ArrowUpRight, Repeat } from "lucide-react";
import ChartCard from "./ChartCard";
import { formatMoney, formatSignedPct, type Mover } from "@/lib/analytics";

/**
 * ============================================================================
 * MOVERS — what changed against the previous, equal-length period
 *
 * A diverging bar list: gains right of the axis, losses left. Sorted by
 * ABSOLUTE riyals, not by percent — an item that went from 4 to 12 riyals is a
 * 200% riser and nobody cares, while the line that quietly shed 900 is the one
 * worth a conversation. The percentage is printed beside the bar as context
 * for the figure that did the sorting, never as the sort key.
 *
 * Direction is carried three ways over: which side of the axis the bar sits
 * on, an arrow, and a signed number. The green/rose tint is the fourth and
 * least important — that pair fails colour-blind separation on its own
 * (ΔE 5.6, deutan), so it is never allowed to be the only channel.
 *
 * A null percentage means the product recorded nothing at all last period.
 * That prints as "new" rather than as a fabricated +100%.
 * ============================================================================
 */
export default function MoversPanel({
    risers,
    fallers,
    rangeLabel,
    previousLabel,
}: {
    risers: Mover[];
    fallers: Mover[];
    rangeLabel: string;
    previousLabel: string;
}) {
    // One diverging list, biggest gain at the top down to biggest loss.
    const rows = [...risers, ...fallers].sort((a, b) => b.delta - a.delta);
    const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.delta)), 0) || 1;

    return (
        <ChartCard
            title="Biggest movers"
            subtitle={`Change in product revenue, ${rangeLabel.toLowerCase()} against the ${previousLabel.toLowerCase()}.`}
            icon={<Repeat className="w-5 h-5" />}
            accent="text-accent-orange"
            caveat="Ranked by riyals gained or lost, not by percentage. A product missing from one of the two periods can shift for reasons that have nothing to do with demand — a machine out of service, a supplier gap, a route change."
            table={{
                columns: ["Product", "This period", "Previous", "Change", "Change %"],
                rows: rows.map((r) => [
                    r.name,
                    formatMoney(r.current),
                    formatMoney(r.previous),
                    `${r.delta > 0 ? "+" : "−"}${formatMoney(Math.abs(r.delta))}`,
                    r.deltaPct === null ? "new" : formatSignedPct(r.deltaPct),
                ]),
            }}
        >
            {rows.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nothing moved between the two periods.
                </p>
            ) : (
                <ul className="space-y-1">
                    {rows.map((row) => {
                        const up = row.delta > 0;
                        // Half the track is the longest bar, so the widest mover
                        // reaches the edge of its own side and nothing overflows.
                        const width = `${(Math.abs(row.delta) / maxAbs) * 50}%`;
                        return (
                            <li
                                key={row.id}
                                className="grid grid-cols-[minmax(0,6rem)_1fr_auto] sm:grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 sm:gap-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                            >
                                <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 truncate">
                                    {row.name}
                                </span>

                                <div className="relative h-6">
                                    {/* The zero axis. Everything reads against this line. */}
                                    <span
                                        aria-hidden
                                        className="absolute inset-y-0 left-1/2 w-px bg-slate-200 dark:bg-white/10"
                                    />
                                    <span
                                        aria-hidden
                                        className={`absolute top-1/2 -translate-y-1/2 h-4 ${
                                            up
                                                ? "left-1/2 bg-accent-green rounded-r-[4px]"
                                                : "right-1/2 bg-accent-pink rounded-l-[4px]"
                                        }`}
                                        style={{ width }}
                                    />
                                </div>

                                {/* The value lives in its own column rather than
                                    riding the end of the bar: a label anchored to a
                                    percentage-width mark runs off the card as soon
                                    as one product dominates the period. */}
                                <span
                                    className={`flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap justify-end ${
                                        up ? "text-accent-green" : "text-accent-pink"
                                    }`}
                                >
                                    {up ? (
                                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                    ) : (
                                        <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                    <span className="tabular-nums">
                                        {up ? "+" : "−"}
                                        {formatMoney(Math.abs(row.delta))}
                                    </span>
                                    <span className="opacity-60 tabular-nums hidden sm:inline w-14 text-right">
                                        {row.deltaPct === null ? "new" : formatSignedPct(row.deltaPct)}
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </ChartCard>
    );
}
