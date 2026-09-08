"use client";

import { useState } from "react";
import { PieChart } from "lucide-react";
import ChartCard, { ChartEmpty, ChartSkeleton } from "./ChartCard";
import { useVizPalette } from "./palette";
import { formatMoney, type CategorySlice } from "@/lib/analytics";

const HEIGHT = 240;

/**
 * ============================================================================
 * CATEGORY MIX — part-to-whole
 *
 * A horizontal stacked bar, which is what replaced the donut that used to sit
 * here. Two reasons the donut had to go, both structural rather than a matter
 * of taste:
 *
 *  1. It was fed the whole catalogue — ten-plus categories cycled through a
 *     colour list by array index. Past roughly seven classes adjacent hues
 *     stop being separable, and cycling means adding a category silently
 *     repaints the others.
 *  2. Angles are the hardest encoding to compare. Two slices a few percent
 *     apart are indistinguishable in a ring and obvious in a bar.
 *
 * So: the top four categories take fixed categorical slots, everything else
 * folds into one grey "Other", and the figures are printed beside the swatches
 * rather than left to a hover. Written as plain divs — Recharts would render
 * this as a chart with a hidden axis, at the cost of a resize observer.
 * ============================================================================
 */
export default function CategoryMixBar({ slices, rangeLabel }: { slices: CategorySlice[]; rangeLabel: string }) {
    const palette = useVizPalette();
    const [hovered, setHovered] = useState<string | null>(null);

    const colorFor = (slice: CategorySlice, index: number) =>
        slice.isTail ? palette.deemphasis : palette.series[index % palette.series.length];

    const total = slices.reduce((s, x) => s + x.revenue, 0);

    return (
        <ChartCard
            title="Category mix"
            subtitle={`Share of revenue by product category. ${rangeLabel}.`}
            icon={<PieChart className="w-5 h-5" />}
            accent="text-accent-purple"
            caveat="Categories come from the item catalogue. Anything left uncategorised is grouped as its own line, not silently dropped."
            table={{
                columns: ["Category", "Revenue", "Units", "Share"],
                rows: slices.map((s) => [s.name, formatMoney(s.revenue), s.units, `${s.share.toFixed(1)}%`]),
            }}
        >
            {!palette.mounted ? (
                <ChartSkeleton height={HEIGHT} />
            ) : total <= 0 ? (
                <ChartEmpty height={HEIGHT} message="No category recorded revenue in this period." />
            ) : (
                <div className="flex flex-col" style={{ minHeight: HEIGHT }}>
                    {/* The 2px gap between segments is the separator — no strokes. */}
                    <div className="flex gap-[2px] h-9 rounded-lg overflow-hidden" onMouseLeave={() => setHovered(null)}>
                        {slices.map((slice, i) => (
                            <div
                                key={slice.name}
                                role="img"
                                aria-label={`${slice.name}: ${slice.share.toFixed(1)} percent of revenue`}
                                onMouseEnter={() => setHovered(slice.name)}
                                className="h-full transition-opacity duration-200 first:rounded-l-lg last:rounded-r-lg"
                                style={{
                                    width: `${Math.max(slice.share, 1.2)}%`,
                                    backgroundColor: colorFor(slice, i),
                                    opacity: hovered && hovered !== slice.name ? 0.35 : 1,
                                }}
                            />
                        ))}
                    </div>

                    <ul className="mt-5 divide-y divide-slate-200 dark:divide-white/5">
                        {slices.map((slice, i) => (
                            <li
                                key={slice.name}
                                onMouseEnter={() => setHovered(slice.name)}
                                onMouseLeave={() => setHovered(null)}
                                className={`flex items-center justify-between gap-3 py-2.5 rounded-lg transition-colors ${
                                    hovered === slice.name ? "bg-slate-100 dark:bg-white/[0.04]" : ""
                                }`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span
                                        aria-hidden
                                        className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                                        style={{ backgroundColor: colorFor(slice, i) }}
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                                        {slice.name}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-3 shrink-0">
                                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                        {formatMoney(slice.revenue)}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums w-12 text-right">
                                        {slice.share.toFixed(1)}%
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </ChartCard>
    );
}
