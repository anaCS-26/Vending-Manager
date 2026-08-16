"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import ChartCard, { ChartEmpty, ChartSkeleton } from "./ChartCard";
import { sequentialStep, useVizPalette } from "./palette";
import { WEEKDAY_LABELS, type RhythmCell } from "@/lib/analytics";

const CELL = 24;
const GAP = 3;
const PITCH = CELL + GAP;
const HEIGHT = 7 * PITCH + 28;

/**
 * ============================================================================
 * SERVICE RHYTHM — weekday × hour of day, Riyadh time
 *
 * Read this as "when does the fleet actually work", and read it ONLY as that.
 * It is deliberately not called a sales heatmap: there is no point-of-sale
 * feed in this system, so the only timestamp that exists is the moment a
 * driver pressed submit. A chart of "sales by hour" built from these rows
 * would be a chart of the route, dressed up as customer behaviour.
 *
 * What it is good for: seeing that Thursday afternoons are unserviced, that
 * one driver starts three hours after the rest, or that Friday coverage
 * collapsed when a route changed.
 *
 * Magnitude, so: sequential encoding — ONE hue, light→dark on the light
 * surface and dark→light on the dark one, so "few visits" recedes into the
 * panel in both modes. Never a rainbow ramp; hue here carries no identity.
 * Empty cells get the surface rather than the ramp's first step, so the ramp
 * spends its whole length on hours that actually happened.
 * ============================================================================
 */
export default function ServiceRhythmHeatmap({ cells, rangeLabel }: { cells: RhythmCell[]; rangeLabel: string }) {
    const palette = useVizPalette();
    const [hover, setHover] = useState<{ weekday: number; hour: number } | null>(null);

    const { hours, max, total, grid, peak } = useMemo(() => {
        const grid = new Map<string, number>();
        let max = 0;
        let total = 0;
        let peak: RhythmCell | null = null;
        let minHour = 24;
        let maxHour = -1;

        for (const c of cells) {
            grid.set(`${c.weekday}:${c.hour}`, c.visits);
            total += c.visits;
            if (c.visits > 0) {
                minHour = Math.min(minHour, c.hour);
                maxHour = Math.max(maxHour, c.hour);
            }
            if (c.visits > max) {
                max = c.visits;
                peak = c;
            }
        }

        // Crop to the hours the fleet actually works (padded by one), rather
        // than rendering eight columns of guaranteed-empty night shift.
        const from = maxHour < 0 ? 6 : Math.max(0, minHour - 1);
        const to = maxHour < 0 ? 20 : Math.min(23, maxHour + 1);
        const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);

        return { hours, max, total, grid, peak };
    }, [cells]);

    const tableRows = cells
        .filter((c) => c.visits > 0)
        .sort((a, b) => b.visits - a.visits || a.weekday - b.weekday || a.hour - b.hour)
        .map((c) => [WEEKDAY_LABELS[c.weekday], hourLabel(c.hour), c.visits]);

    return (
        <ChartCard
            title="Service rhythm"
            subtitle={`When the fleet is out. Every square is one weekday-hour in Riyadh time. ${rangeLabel}.`}
            icon={<CalendarClock className="w-5 h-5" />}
            accent="text-accent-purple"
            caveat="Counts service visits, not sales. Refills at the same machine by the same driver within 30 minutes are one visit."
            headline={
                peak && peak.visits > 0 ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                        Busiest slot:{" "}
                        <span className="font-semibold text-slate-900 dark:text-white">
                            {WEEKDAY_LABELS[peak.weekday]} {hourLabel(peak.hour)}
                        </span>{" "}
                        · {total} visits in total
                    </p>
                ) : undefined
            }
            table={{ columns: ["Weekday", "Hour", "Visits"], rows: tableRows, numericFrom: 2 }}
        >
            {!palette.mounted ? (
                <ChartSkeleton height={HEIGHT} />
            ) : total === 0 ? (
                <ChartEmpty height={HEIGHT} message="No service visits were recorded in this period." />
            ) : (
                // Scrollbar deliberately NOT hidden here: the grid is wider than a
                // phone and the cut-off column plus a visible bar are the only two
                // cues that there is more week to the right.
                <div className="overflow-x-auto -mx-1 px-1">
                    <div className="inline-block min-w-full">
                        <div className="flex gap-2">
                            {/* Weekday rail */}
                            <div className="shrink-0 pt-0" style={{ paddingTop: 0 }}>
                                {WEEKDAY_LABELS.map((day, i) => (
                                    <div
                                        key={day}
                                        className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-end pr-1"
                                        style={{ height: CELL, marginBottom: i === 6 ? 0 : GAP, width: 30 }}
                                    >
                                        {day}
                                    </div>
                                ))}
                            </div>

                            <div className="relative">
                                <div
                                    className="grid"
                                    style={{
                                        gridTemplateColumns: `repeat(${hours.length}, ${CELL}px)`,
                                        gap: GAP,
                                    }}
                                    onMouseLeave={() => setHover(null)}
                                >
                                    {WEEKDAY_LABELS.map((day, weekday) =>
                                        hours.map((hour) => {
                                            const visits = grid.get(`${weekday}:${hour}`) ?? 0;
                                            const isHovered = hover?.weekday === weekday && hover?.hour === hour;
                                            return (
                                                <button
                                                    key={`${weekday}-${hour}`}
                                                    type="button"
                                                    tabIndex={visits > 0 ? 0 : -1}
                                                    aria-label={`${day} ${hourLabel(hour)}: ${visits} visit${visits === 1 ? "" : "s"}`}
                                                    onMouseEnter={() => setHover({ weekday, hour })}
                                                    onFocus={() => setHover({ weekday, hour })}
                                                    onBlur={() => setHover(null)}
                                                    className="rounded-[5px] transition-[outline-color] outline outline-2 outline-offset-0"
                                                    style={{
                                                        width: CELL,
                                                        height: CELL,
                                                        backgroundColor:
                                                            visits === 0
                                                                ? "transparent"
                                                                : sequentialStep(palette, max > 1 ? (visits - 1) / (max - 1) : 1),
                                                        boxShadow:
                                                            visits === 0
                                                                ? `inset 0 0 0 1px ${palette.grid}`
                                                                : undefined,
                                                        outlineColor: isHovered ? palette.ink : "transparent",
                                                    }}
                                                />
                                            );
                                        }),
                                    )}
                                </div>

                                {/* Hour rail */}
                                <div
                                    className="grid mt-1.5"
                                    style={{ gridTemplateColumns: `repeat(${hours.length}, ${CELL}px)`, gap: GAP }}
                                >
                                    {hours.map((hour) => (
                                        <div
                                            key={hour}
                                            className="font-mono text-[9px] text-slate-500 dark:text-slate-400 text-center tabular-nums"
                                        >
                                            {/* Every other hour, so the labels never collide. */}
                                            {hour % 2 === 0 ? String(hour).padStart(2, "0") : ""}
                                        </div>
                                    ))}
                                </div>

                                {hover && (
                                    // `overflow-x: auto` on the scroll parent forces
                                    // overflow-y to `auto` too, so a tooltip drawn
                                    // above the top rows is clipped rather than
                                    // overhanging. Sunday and Monday get theirs
                                    // below the cell instead; nothing else can reach
                                    // an edge.
                                    <div
                                        className="pointer-events-none absolute z-20"
                                        style={{
                                            left: hours.indexOf(hover.hour) * PITCH + CELL / 2,
                                            top:
                                                hover.weekday < 2
                                                    ? hover.weekday * PITCH + CELL + 6
                                                    : hover.weekday * PITCH - 6,
                                            transform:
                                                hover.weekday < 2
                                                    ? "translate(-50%, 0)"
                                                    : "translate(-50%, -100%)",
                                        }}
                                    >
                                        <div
                                            className="rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-xl"
                                            style={{
                                                backgroundColor: palette.tooltipBg,
                                                border: `1px solid ${palette.tooltipBorder}`,
                                                color: palette.ink,
                                            }}
                                        >
                                            <span className="font-semibold tabular-nums">
                                                {grid.get(`${hover.weekday}:${hover.hour}`) ?? 0} visits
                                            </span>
                                            <span className="opacity-60">
                                                {" "}
                                                · {WEEKDAY_LABELS[hover.weekday]} {hourLabel(hover.hour)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <ScaleLegend max={max} />
                    </div>
                </div>
            )}
        </ChartCard>
    );
}

/** A continuous colour scale needs its key printed — the ramp means nothing
 *  without the two ends named. */
function ScaleLegend({ max }: { max: number }) {
    const palette = useVizPalette();
    const steps = palette.sequential;
    return (
        <div className="flex items-center gap-2 mt-5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                1 visit
            </span>
            <div className="flex gap-[2px]">
                {steps.map((color) => (
                    <span key={color} className="block w-4 h-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
                ))}
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 tabular-nums">
                {max}
            </span>
        </div>
    );
}

function hourLabel(hour: number): string {
    return `${String(hour).padStart(2, "0")}:00`;
}
