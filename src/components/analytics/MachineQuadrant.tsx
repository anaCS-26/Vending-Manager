"use client";

import {
    CartesianGrid,
    Cell,
    ReferenceLine,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
    ZAxis,
} from "recharts";
import { AlertTriangle, Crosshair } from "lucide-react";
import ChartCard, { ChartEmpty, ChartFrame, ChartSkeleton, TooltipRow, TooltipShell } from "./ChartCard";
import { useVizPalette } from "./palette";
import { formatCompact, formatMoney } from "@/lib/analytics";

export type QuadrantPoint = {
    id: number;
    name: string;
    district: string;
    revenue: number;
    marginPct: number;
    units: number;
    visits: number;
    /** Revenue per service visit — the figure that says whether the stop paid
     *  for the drive. */
    revenuePerVisit: number;
    underperforming: boolean;
};

const HEIGHT = 380;

/**
 * ============================================================================
 * MACHINE PERFORMANCE QUADRANT
 *
 * Revenue (x) against gross margin (y), bubble size = units sold, split by the
 * fleet's own MEDIANS rather than by round numbers someone picked. The
 * question it answers is the one a vending operator actually has: which of
 * these boxes is worth the drive?
 *
 * Colour here is STATUS, not identity — "below the fleet median on both axes"
 * is a state, so it wears the reserved critical token and never a categorical
 * slot. And because a red/green-adjacent status pair is exactly the collision
 * colour-blind readers can't resolve, the legend carries an icon and a word,
 * the tooltip names the quadrant in text, and the table view lists it. Hue is
 * never the only channel.
 *
 * A note on the medians: they are computed across the machines PLOTTED, so
 * roughly a quarter of the fleet will always land bottom-left. That is the
 * point — this is a relative ranking tool, not an absolute pass/fail. The
 * caveat under the chart says so.
 * ============================================================================
 */
export default function MachineQuadrant({
    points,
    medianRevenue,
    medianMargin,
    rangeLabel,
}: {
    points: QuadrantPoint[];
    medianRevenue: number;
    medianMargin: number;
    rangeLabel: string;
}) {
    const palette = useVizPalette();
    const laggards = points.filter((p) => p.underperforming).length;

    return (
        <ChartCard
            title="Which machines earn their keep"
            subtitle={`Revenue against gross margin, sized by units sold. The crosshair is the fleet median. ${rangeLabel}.`}
            icon={<Crosshair className="w-5 h-5" />}
            accent="text-accent-green"
            legend={[
                { label: "Machine", color: palette.series[0], shape: "dot" },
                {
                    label: "Below fleet median on both revenue and margin",
                    color: palette.status.critical,
                    shape: "dot",
                    icon: <AlertTriangle className="w-3.5 h-3.5" />,
                },
            ]}
            caveat="Medians are taken across the machines shown, so some will always fall bottom-left — this ranks the fleet against itself, it does not pass or fail a machine. Fixed rent and operating cost are not in the margin; see Financials for full P&L."
            headline={
                points.length > 0 ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-900 dark:text-white">{points.length}</span> machines
                        sold in this period ·{" "}
                        <span className="font-semibold text-accent-pink">{laggards}</span> below median on both measures
                    </p>
                ) : undefined
            }
            table={{
                columns: ["Machine", "District", "Revenue", "Margin %", "Units", "Visits", "Rev / visit", "Flag"],
                rows: [...points]
                    .sort((a, b) => b.revenue - a.revenue)
                    .map((p) => [
                        p.name,
                        p.district,
                        formatMoney(p.revenue),
                        `${p.marginPct.toFixed(1)}%`,
                        p.units,
                        p.visits,
                        formatMoney(p.revenuePerVisit),
                        p.underperforming ? "Below median (both)" : "—",
                    ]),
                numericFrom: 2,
            }}
        >
            {!palette.mounted ? (
                <ChartSkeleton height={HEIGHT} />
            ) : points.length === 0 ? (
                <ChartEmpty height={HEIGHT} message="No machine recorded a sale in this period." />
            ) : (
                <ChartFrame height={HEIGHT} minWidth={560}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <ScatterChart margin={{ top: 16, right: 24, left: -4, bottom: 12 }}>
                            <CartesianGrid stroke={palette.grid} strokeWidth={1} />
                            <XAxis
                                type="number"
                                dataKey="revenue"
                                name="Revenue"
                                stroke={palette.axis}
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={formatCompact}
                                label={{
                                    value: "Revenue",
                                    position: "insideBottomRight",
                                    offset: -6,
                                    fill: palette.axis,
                                    fontSize: 11,
                                }}
                            />
                            <YAxis
                                type="number"
                                dataKey="marginPct"
                                name="Margin"
                                stroke={palette.axis}
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                width={52}
                                unit="%"
                                // Margins on a fleet cluster in a narrow band, so an
                                // axis anchored at 0 spends most of its height on
                                // empty space and flattens the spread that is the
                                // whole point. A scatter encodes POSITION, not
                                // length, so a non-zero baseline misstates nothing —
                                // unlike a bar, where it would.
                                domain={[
                                    (min: number) => Math.max(0, Math.floor((min - 4) / 5) * 5),
                                    (max: number) => Math.ceil((max + 4) / 5) * 5,
                                ]}
                                label={{
                                    value: "Gross margin",
                                    angle: -90,
                                    position: "insideLeft",
                                    offset: 16,
                                    fill: palette.axis,
                                    fontSize: 11,
                                    style: { textAnchor: "middle" },
                                }}
                            />
                            {/* Bubble area, not radius — doubling the radius quadruples the
                                ink and reads as four times the value. Recharts scales `range`
                                as area, so the floor/ceiling here are px². */}
                            <ZAxis type="number" dataKey="units" range={[60, 620]} name="Units" />

                            <ReferenceLine
                                x={medianRevenue}
                                stroke={palette.deemphasis}
                                strokeWidth={1}
                                label={{
                                    value: "median revenue",
                                    position: "top",
                                    fill: palette.axis,
                                    fontSize: 10,
                                }}
                            />
                            <ReferenceLine
                                y={medianMargin}
                                stroke={palette.deemphasis}
                                strokeWidth={1}
                                // Inside the plot: `position: "right"` puts the text
                                // in the chart's right margin, where the card clips it.
                                label={{
                                    value: "median margin",
                                    position: "insideTopLeft",
                                    fill: palette.axis,
                                    fontSize: 10,
                                }}
                            />

                            <Tooltip
                                cursor={{ stroke: palette.deemphasis, strokeWidth: 1 }}
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const p = payload[0].payload as QuadrantPoint;
                                    return (
                                        <TooltipShell palette={palette} title={p.name}>
                                            <TooltipRow label="Revenue" value={formatMoney(p.revenue)} />
                                            <TooltipRow label="Gross margin" value={`${p.marginPct.toFixed(1)}%`} />
                                            <TooltipRow label="Units sold" value={String(p.units)} />
                                            <TooltipRow label="Revenue / visit" value={formatMoney(p.revenuePerVisit)} />
                                            <p className="pt-1 text-[11px] opacity-60">
                                                {p.district}
                                                {p.underperforming ? " · below median on both" : ""}
                                            </p>
                                        </TooltipShell>
                                    );
                                }}
                            />

                            <Scatter data={points} isAnimationActive={false}>
                                {points.map((p) => (
                                    <Cell
                                        key={p.id}
                                        // Colour follows the machine's STATE, never its rank
                                        // or its position in this array.
                                        fill={p.underperforming ? palette.status.critical : palette.series[0]}
                                        fillOpacity={0.72}
                                        // 2px ring in the surface colour so overlapping
                                        // bubbles stay separable without a border.
                                        stroke={palette.surface}
                                        strokeWidth={2}
                                    />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </ChartFrame>
            )}
        </ChartCard>
    );
}
