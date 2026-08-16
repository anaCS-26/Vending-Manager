"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PackageX } from "lucide-react";
import ChartCard, { ChartEmpty, ChartFrame, ChartSkeleton, TooltipRow, TooltipShell } from "./ChartCard";
import { useVizPalette } from "./palette";
import { formatCompact, formatMoney, type LossBucket } from "@/lib/analytics";

const HEIGHT = 260;

/**
 * ============================================================================
 * SHRINKAGE — damaged vs expired, by week
 *
 * Weekly bins, not daily: returns are verified in batches, so a daily series
 * is ~90% zeros with occasional spikes and reads as noise rather than a trend.
 *
 * Damaged and expired are two IDENTITIES, not two severities, so this is a
 * categorical pair (slots 1 and 2) rather than the status palette. They are
 * also two different management problems and the split is the whole reason
 * this isn't one bar: expired is a stocking/rotation decision — too much of
 * the wrong line, sitting too long — while damaged is a handling one.
 *
 * Slot 1 + slot 2 specifically: the intuitive "orange and rose" pairing FAILS
 * the normal-vision separation floor (ΔE 12.7, floor 15) — a fully
 * sighted reader can't reliably tell those two apart in adjacent stack
 * segments, never mind a colour-blind one. Don't "fix" the semantics of the
 * colours by reaching for two warm hues.
 * ============================================================================
 */
export default function LossTrendChart({
    buckets,
    bucketDays,
    totalValue,
    rangeLabel,
}: {
    buckets: LossBucket[];
    bucketDays: number;
    totalValue: number;
    rangeLabel: string;
}) {
    const palette = useVizPalette();
    const hasData = buckets.some((b) => b.damaged > 0 || b.expired > 0);
    const unit = bucketDays === 1 ? "day" : `${bucketDays}-day period`;

    return (
        <ChartCard
            title="Stock written off"
            subtitle={`Cost of damaged and expired units, per ${unit}. ${rangeLabel}.`}
            icon={<PackageX className="w-5 h-5" />}
            accent="text-accent-pink"
            legend={[
                { label: "Damaged", color: palette.series[0], shape: "rect" },
                { label: "Expired", color: palette.series[1], shape: "rect" },
            ]}
            caveat="Valued at each item's current weighted average cost, not the cost at the time it was written off — so a large recent cost correction shifts these figures."
            headline={
                <p className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(totalValue)}</span>{" "}
                    written off in this period
                </p>
            }
            table={{
                columns: [`${unit.charAt(0).toUpperCase()}${unit.slice(1)} ending`, "Damaged", "Expired", "Total"],
                rows: buckets.map((b) => [
                    b.date,
                    formatMoney(b.damaged),
                    formatMoney(b.expired),
                    formatMoney(b.damaged + b.expired),
                ]),
            }}
        >
            {!palette.mounted ? (
                <ChartSkeleton height={HEIGHT} />
            ) : !hasData ? (
                <ChartEmpty height={HEIGHT} message="Nothing was written off in this period." />
            ) : (
                // 13 weekly bins at the 90-day range; their date labels collide
                // well before the bars do.
                <ChartFrame height={HEIGHT} minWidth={480}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <BarChart data={buckets} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
                            <CartesianGrid stroke={palette.grid} strokeWidth={1} vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke={palette.axis}
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickMargin={8}
                                tickFormatter={shortDay}
                            />
                            <YAxis
                                stroke={palette.axis}
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                width={52}
                                tickFormatter={formatCompact}
                            />
                            <Tooltip
                                cursor={{ fill: palette.grid }}
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const b = payload[0].payload as LossBucket;
                                    return (
                                        <TooltipShell palette={palette} title={`Week to ${shortDay(String(label))}`}>
                                            <TooltipRow label="Total" value={formatMoney(b.damaged + b.expired)} />
                                            <TooltipRow
                                                color={palette.series[0]}
                                                shape="rect"
                                                label="Damaged"
                                                value={formatMoney(b.damaged)}
                                            />
                                            <TooltipRow
                                                color={palette.series[1]}
                                                shape="rect"
                                                label="Expired"
                                                value={formatMoney(b.expired)}
                                            />
                                        </TooltipShell>
                                    );
                                }}
                            />
                            {/* Surface-coloured 2px stroke = the gap between the two
                                stacked segments. Not a border. */}
                            <Bar
                                dataKey="damaged"
                                stackId="loss"
                                fill={palette.series[0]}
                                stroke={palette.surface}
                                strokeWidth={2}
                                maxBarSize={24}
                                isAnimationActive={false}
                            />
                            <Bar
                                dataKey="expired"
                                stackId="loss"
                                fill={palette.series[1]}
                                stroke={palette.surface}
                                strokeWidth={2}
                                maxBarSize={24}
                                radius={[4, 4, 0, 0]}
                                isAnimationActive={false}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartFrame>
            )}
        </ChartCard>
    );
}

function shortDay(value: string): string {
    const d = new Date(`${value}T00:00:00+03:00`);
    return isNaN(d.getTime())
        ? value
        : d.toLocaleDateString("en-US", { timeZone: "Asia/Riyadh", month: "short", day: "numeric" });
}
