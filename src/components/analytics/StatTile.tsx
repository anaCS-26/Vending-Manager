"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useVizPalette } from "./palette";
import { formatSignedPct } from "@/lib/analytics";

/**
 * ============================================================================
 * STAT TILE
 *
 * The right form for "a single current value plus how it moved" — not a
 * one-bar bar chart. Contract: label · value · delta (signed, against a named
 * period) · trend (sparkline).
 *
 * Two details that look like nits and aren't:
 *
 *  - **Proportional figures on the value.** `body` sets
 *    `font-variant-numeric: tabular-nums` globally so financial COLUMNS align
 *    digit-for-digit, which is right for tables and wrong here: at display
 *    size every digit padded to the width of a `0` makes `121` look gappy.
 *    The tile opts back out; the sparkline's axis-free figures don't align
 *    with anything anyway.
 *  - **`lowerIsBetter` flips the delta colour, and the arrow tracks the
 *    NUMBER, not the judgement.** Shrinkage falling is good news drawn with a
 *    down arrow in green. Colour is never the only signal — the arrow and the
 *    "vs previous 30 days" caption both survive a colour-blind reader, which
 *    is the rule for anything wearing a status colour.
 * ============================================================================
 */

export type StatTileProps = {
    label: string;
    value: React.ReactNode;
    /** e.g. "vs previous 30 days". Named period, never a bare "vs last". */
    deltaCaption: string;
    /** Percentage change, or null when the previous period had no basis. */
    delta: number | null;
    lowerIsBetter?: boolean;
    /** Daily series for the sparkline. Fewer than 2 points renders nothing. */
    trend?: number[];
    /** Secondary line under the value — the absolute figure behind the headline. */
    footnote?: React.ReactNode;
    hero?: boolean;
};

export default function StatTile({
    label,
    value,
    delta,
    deltaCaption,
    lowerIsBetter = false,
    trend,
    footnote,
    hero = false,
}: StatTileProps) {
    const palette = useVizPalette();

    return (
        <div
            className={`glass-panel border border-slate-200 dark:border-white/5 rounded-3xl relative overflow-hidden flex flex-col ${
                hero ? "p-6 sm:p-7" : "p-5"
            }`}
        >
            {hero && (
                <div
                    aria-hidden
                    className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-[0.14] bg-accent-blue"
                />
            )}

            <p className="relative font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {label}
            </p>

            <p
                className={`relative mt-3 font-semibold text-slate-900 dark:text-white tracking-tight [font-variant-numeric:proportional-nums] ${
                    hero ? "text-4xl sm:text-5xl" : "text-2xl sm:text-[1.75rem]"
                }`}
            >
                {value}
            </p>

            {footnote && (
                <div className="relative mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">{footnote}</div>
            )}

            {/* The hero is twice the height of the tiles beside it, so its trend
                gets the room rather than leaving a hole: a full-width area under
                the same figure the tile is about. The small tiles keep the
                inline 12-point spark. */}
            {hero ? (
                <>
                    <div className="relative mt-4">
                        <DeltaChip delta={delta} caption={deltaCaption} lowerIsBetter={lowerIsBetter} />
                    </div>
                    <div className="relative mt-4 flex-1 min-h-[60px] sm:min-h-[88px]">
                        {trend && trend.length > 1 && palette.mounted && (
                            <HeroSparkline values={trend} color={palette.series[0]} />
                        )}
                    </div>
                </>
            ) : (
                <div className="relative mt-4 flex items-end justify-between gap-2 sm:gap-3 flex-1">
                    <DeltaChip delta={delta} caption={deltaCaption} lowerIsBetter={lowerIsBetter} />
                    {/* Two of these sit side by side in ~170px on a phone, so the
                        spark gives up 20px there rather than squeezing the delta —
                        the delta is the number the tile exists for. */}
                    {trend && trend.length > 1 && palette.mounted && (
                        <>
                            <span className="sm:hidden">
                                <Sparkline values={trend} line={palette.deemphasis} marker={palette.series[0]} width={56} height={26} />
                            </span>
                            <span className="hidden sm:block">
                                <Sparkline values={trend} line={palette.deemphasis} marker={palette.series[0]} width={76} height={28} />
                            </span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Full-bleed area trend for the hero tile. Stretched with
 * `preserveAspectRatio="none"` so it fills whatever box the grid gives it —
 * which would ordinarily smear the stroke, hence `vector-effect:
 * non-scaling-stroke` to keep the 2px line 2px at any aspect ratio.
 *
 * Still no axes and no hover: the figure above it is the readout, and the
 * dated, tooltipped version of this exact series is the first chart on the
 * page. This is shape, not measurement.
 */
function HeroSparkline({ values, color }: { values: number[]; color: string }) {
    const W = 300;
    const H = 100;
    const max = Math.max(...values);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const stepX = W / (values.length - 1);

    const points = values.map((v, i) => [i * stepX, H - ((v - min) / span) * (H - 6) - 3] as const);
    const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    const gradientId = `hero-spark-${color.replace("#", "")}`;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full h-full absolute inset-0"
            aria-hidden
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path
                d={line}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

function DeltaChip({
    delta,
    caption,
    lowerIsBetter,
}: {
    delta: number | null;
    caption: string;
    lowerIsBetter: boolean;
}) {
    if (delta === null) {
        return (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <Minus className="w-3.5 h-3.5 shrink-0" />
                <span>No basis to compare</span>
            </div>
        );
    }

    const flat = Math.abs(delta) < 0.05;
    const up = delta > 0;
    const good = flat ? null : lowerIsBetter ? !up : up;
    const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

    const tone = flat
        ? "text-slate-500 dark:text-slate-400"
        : good
          ? "text-accent-green"
          : "text-accent-pink";

    return (
        <div className="min-w-0">
            <div className={`flex items-center gap-1 text-sm font-semibold ${tone}`}>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="tabular-nums">{formatSignedPct(delta)}</span>
            </div>
            {/* Wraps rather than truncates: "vs previous 30 days" clipped to
                "vs previous 3…" reads as a different period. */}
            <p className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5">{caption}</p>
        </div>
    );
}

/**
 * Hand-rolled SVG rather than a charting library: a tile renders five of these
 * and Recharts' ResponsiveContainer costs a resize observer and a measure pass
 * each. There are no axes, no labels and no hover here by design — the tile's
 * value and delta ARE the readout, and the full series is one card below.
 */
function Sparkline({
    values,
    line,
    marker,
    width,
    height,
}: {
    values: number[];
    line: string;
    marker: string;
    width: number;
    height: number;
}) {
    const pad = 3;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const stepX = (width - pad * 2) / (values.length - 1);

    const points = values.map((v, i) => {
        const x = pad + i * stepX;
        const y = height - pad - ((v - min) / span) * (height - pad * 2);
        return [x, y] as const;
    });

    const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const [lastX, lastY] = points[points.length - 1];

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden>
            <path d={d} fill="none" stroke={line} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={lastX} cy={lastY} r={3} fill={marker} />
        </svg>
    );
}
