"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Layers } from "lucide-react";
import ChartCard, { ChartEmpty, ChartFrame, ChartSkeleton, TooltipRow, TooltipShell } from "./ChartCard";
import { useVizPalette } from "./palette";
import { formatMoney, type ParetoSlice } from "@/lib/analytics";

const HEIGHT = 340;

/**
 * ============================================================================
 * REVENUE CONCENTRATION
 *
 * Columns = each product's share of revenue; line = the running total. Both
 * are percentages, which is the entire design decision here: the textbook
 * Pareto puts riyals on the left axis and cumulative percent on the right, and
 * a two-scale chart aligns those scales arbitrarily — it draws a relationship
 * that isn't in the data. Plotting the bars in share-space puts both series on
 * ONE axis, and the 80% rule reads straight off it.
 *
 * What an operator does with it: everything left of where the line crosses 80%
 * is the range that has to be in stock. Everything in the folded "Other" bar
 * is the tail that is costing shelf slots, warehouse space and pick time for
 * very little — which is a delisting conversation, and the exact number of
 * lines in it is on the bar.
 *
 * The tail is folded, never dropped: the point of the chart is that it sums to
 * something.
 * ============================================================================
 */
export default function ProductPareto({
    slices,
    itemsTo80,
    totalItems,
    rangeLabel,
}: {
    slices: ParetoSlice[];
    itemsTo80: number;
    totalItems: number;
    rangeLabel: string;
}) {
    const palette = useVizPalette();

    return (
        <ChartCard
            title="Where the revenue actually comes from"
            subtitle={`Each product's share of revenue, and the running total. ${rangeLabel}.`}
            icon={<Layers className="w-5 h-5" />}
            accent="text-accent-blue"
            legend={[
                { label: "Share of revenue", color: palette.series[0], shape: "rect" },
                { label: "Everything else, folded", color: palette.deemphasis, shape: "rect" },
                { label: "Running total", color: palette.series[2], shape: "line" },
            ]}
            caveat="Revenue only. A high-share product on thin margin is not the same asset as a mid-share one on a wide margin — check the margin column in the table view before acting."
            headline={
                slices.length > 0 ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-900 dark:text-white">{itemsTo80}</span> of{" "}
                        <span className="font-semibold text-slate-900 dark:text-white">{totalItems}</span> products make
                        up 80% of revenue
                    </p>
                ) : undefined
            }
            table={{
                columns: ["Product", "Revenue", "Share", "Running total"],
                rows: slices.map((s) => [
                    s.name,
                    formatMoney(s.revenue),
                    `${s.share.toFixed(1)}%`,
                    `${s.cumulative.toFixed(1)}%`,
                ]),
            }}
        >
            {!palette.mounted ? (
                <ChartSkeleton height={HEIGHT} />
            ) : slices.length === 0 ? (
                <ChartEmpty height={HEIGHT} message="No product recorded revenue in this period." />
            ) : (
                // Widest minimum on the page: thirteen angled product names need
                // real room before they start overprinting each other.
                <ChartFrame height={HEIGHT} minWidth={680}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <ComposedChart data={slices} margin={{ top: 12, right: 8, left: -12, bottom: 64 }}>
                            <CartesianGrid stroke={palette.grid} strokeWidth={1} vertical={false} />
                            <XAxis
                                dataKey="name"
                                stroke={palette.axis}
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                interval={0}
                                angle={-38}
                                textAnchor="end"
                                height={64}
                                tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                            />
                            <YAxis
                                stroke={palette.axis}
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                width={48}
                                domain={[0, 100]}
                                ticks={[0, 20, 40, 60, 80, 100]}
                                tickFormatter={(v: number) => `${v}%`}
                            />
                            <ReferenceLine
                                y={80}
                                stroke={palette.deemphasis}
                                strokeWidth={1}
                                label={{ value: "80%", position: "left", fill: palette.axis, fontSize: 10 }}
                            />
                            <Tooltip
                                cursor={{ fill: palette.grid }}
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const s = payload[0].payload as ParetoSlice;
                                    return (
                                        <TooltipShell palette={palette} title={s.name}>
                                            <TooltipRow label="Revenue" value={formatMoney(s.revenue)} />
                                            <TooltipRow
                                                color={palette.series[0]}
                                                shape="rect"
                                                label="Share"
                                                value={`${s.share.toFixed(1)}%`}
                                            />
                                            <TooltipRow
                                                color={palette.series[2]}
                                                label="Running total"
                                                value={`${s.cumulative.toFixed(1)}%`}
                                            />
                                        </TooltipShell>
                                    );
                                }}
                            />
                            <Bar dataKey="share" maxBarSize={34} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                                {slices.map((s) => (
                                    // The folded tail is context, not a series — it wears the
                                    // de-emphasis grey rather than a categorical slot.
                                    <Cell key={s.name} fill={s.isTail ? palette.deemphasis : palette.series[0]} />
                                ))}
                            </Bar>
                            <Line
                                dataKey="cumulative"
                                type="monotone"
                                stroke={palette.series[2]}
                                strokeWidth={2}
                                strokeLinecap="round"
                                dot={{ r: 3, fill: palette.series[2], strokeWidth: 2, stroke: palette.surface }}
                                activeDot={{ r: 5, strokeWidth: 2, stroke: palette.surface }}
                                isAnimationActive={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </ChartFrame>
            )}
        </ChartCard>
    );
}
