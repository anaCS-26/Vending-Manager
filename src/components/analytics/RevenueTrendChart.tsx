"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import ChartCard, { ChartEmpty, ChartFrame, ChartSkeleton, TooltipRow, TooltipShell } from "./ChartCard";
import { useVizPalette } from "./palette";
import { formatCompact, formatMoney } from "@/lib/analytics";

export type RevenuePoint = {
    date: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    units: number;
    visits: number;
    /** Trailing 7-day mean revenue; null until the window fills. */
    ma: number | null;
};

const HEIGHT = 320;

/**
 * ============================================================================
 * REVENUE COMPOSITION OVER TIME
 *
 * Stacked columns (cost of goods + gross profit = revenue) with a 7-day
 * trailing mean line. Everything plotted is riyals, so it all shares ONE axis.
 *
 * The obvious version of this chart — revenue on the left axis, margin % on
 * the right — is the single most common charting mistake there is: the two
 * scales are aligned arbitrarily, so the picture invents a correlation the
 * data never claimed. Margin lives in its own stat tile instead, and the stack
 * shows the same story honestly: the orange block is what the goods cost, the
 * blue block is what was left.
 *
 * The mean line exists because daily revenue here is inherently lumpy — a
 * refill log books a whole interval's sales at the instant the driver arrives,
 * so a machine serviced every Tuesday puts all of its week on Tuesday. The
 * columns are the truth; the line is the trend through it.
 * ============================================================================
 */
export default function RevenueTrendChart({ data, rangeLabel }: { data: RevenuePoint[]; rangeLabel: string }) {
    const palette = useVizPalette();
    const hasData = data.some((d) => d.revenue !== 0 || d.cogs !== 0);

    // 90 columns can't each carry a date label; show roughly a dozen.
    const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

    return (
        <ChartCard
            title="Revenue composition"
            subtitle={`What was sold, what it cost, and what was left — by day. ${rangeLabel}.`}
            icon={<TrendingUp className="w-5 h-5" />}
            accent="text-accent-blue"
            legend={[
                { label: "Gross profit", color: palette.series[0], shape: "rect" },
                { label: "Cost of goods", color: palette.series[1], shape: "rect" },
                { label: "Revenue, 7-day average", color: palette.series[2], shape: "line" },
            ]}
            caveat="Sales are booked to the day a driver recorded the refill, not the days the units were actually vended — so daily columns are lumpy by design. Read the 7-day line for direction."
            table={{
                columns: ["Day", "Revenue", "Cost of goods", "Gross profit", "Units", "Visits"],
                rows: data.map((d) => [
                    d.date,
                    formatMoney(d.revenue),
                    formatMoney(d.cogs),
                    formatMoney(d.grossProfit),
                    d.units,
                    d.visits,
                ]),
            }}
        >
            {!palette.mounted ? (
                <ChartSkeleton height={HEIGHT} />
            ) : !hasData ? (
                <ChartEmpty height={HEIGHT} message="No refills were recorded in this period." />
            ) : (
                <ChartFrame height={HEIGHT} minWidth={560}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="18%">
                            <CartesianGrid stroke={palette.grid} strokeWidth={1} vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke={palette.axis}
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                interval={tickInterval}
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
                                    const p = payload[0].payload as RevenuePoint;
                                    return (
                                        <TooltipShell palette={palette} title={longDay(String(label))}>
                                            <TooltipRow label="Revenue" value={formatMoney(p.revenue)} />
                                            <TooltipRow
                                                color={palette.series[0]}
                                                shape="rect"
                                                label="Gross profit"
                                                value={formatMoney(p.grossProfit)}
                                            />
                                            <TooltipRow
                                                color={palette.series[1]}
                                                shape="rect"
                                                label="Cost of goods"
                                                value={formatMoney(p.cogs)}
                                            />
                                            <TooltipRow label="Units sold" value={String(p.units)} />
                                            <TooltipRow label="Service visits" value={String(p.visits)} />
                                        </TooltipShell>
                                    );
                                }}
                            />
                            {/* The 2px stroke is painted in the SURFACE colour: it is the
                                gap that separates the two stacked segments, not a border
                                drawn around them. */}
                            <Bar
                                dataKey="cogs"
                                stackId="money"
                                fill={palette.series[1]}
                                stroke={palette.surface}
                                strokeWidth={2}
                                maxBarSize={24}
                                isAnimationActive={false}
                            />
                            <Bar
                                dataKey="grossProfit"
                                stackId="money"
                                fill={palette.series[0]}
                                stroke={palette.surface}
                                strokeWidth={2}
                                maxBarSize={24}
                                radius={[4, 4, 0, 0]}
                                isAnimationActive={false}
                            />
                            <Line
                                dataKey="ma"
                                type="monotone"
                                stroke={palette.series[2]}
                                strokeWidth={2}
                                strokeLinecap="round"
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface }}
                                connectNulls={false}
                                isAnimationActive={false}
                            />
                        </ComposedChart>
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

function longDay(value: string): string {
    const d = new Date(`${value}T00:00:00+03:00`);
    return isNaN(d.getTime())
        ? value
        : d.toLocaleDateString("en-US", { timeZone: "Asia/Riyadh", weekday: "short", month: "long", day: "numeric" });
}
