"use client";

import React, { useId, useState } from "react";
import { BarChart3, Info, Table2 } from "lucide-react";
import type { VizPalette } from "./palette";

/**
 * ============================================================================
 * CHART CHROME
 *
 * One card, one chart, one table view. Every visual on the Analytics page is
 * wrapped in `ChartCard`, and the table toggle is not optional decoration:
 *
 *  - Two of the categorical slots sit below 3:1 contrast on the light surface.
 *    That is only permissible when the values are reachable without relying on
 *    the colour — the table view is what discharges it.
 *  - A tooltip must never be the ONLY way to read a value. Hover doesn't exist
 *    on the phone half of this audience.
 *  - Screen readers get a real `<table>` instead of a pile of SVG paths.
 *
 * So: if you add a chart here, you pass it a `table`. There is no path that
 * ships a chart without one.
 * ============================================================================
 */

export type ChartTable = {
    columns: string[];
    /** Pre-formatted cells — the card renders strings, it does no maths. */
    rows: (string | number)[][];
    /** Column indexes to right-align (numeric columns). */
    numericFrom?: number;
};

export type LegendItem = {
    label: string;
    color: string;
    /** `rect` for bars/areas, `line` for lines — the key should mirror the mark. */
    shape?: "rect" | "line" | "dot";
    /** Mandatory whenever the swatch wears a STATUS colour: red↔green is the
     *  classic colour-blind collision, so state never rides on hue alone. */
    icon?: React.ReactNode;
};

export function VizLegend({ items }: { items: LegendItem[] }) {
    return (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {items.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                    <span
                        aria-hidden
                        className={
                            item.shape === "line"
                                ? "block w-4 h-[3px] rounded-full shrink-0"
                                : item.shape === "dot"
                                  ? "block w-2.5 h-2.5 rounded-full shrink-0"
                                  : "block w-2.5 h-2.5 rounded-[3px] shrink-0"
                        }
                        style={{ backgroundColor: item.color }}
                    />
                    {item.icon && (
                        <span aria-hidden style={{ color: item.color }} className="shrink-0 flex">
                            {item.icon}
                        </span>
                    )}
                    {/* Text wears a text token, never the series colour — the swatch
                        beside it carries identity. A light hue is illegible as type. */}
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{item.label}</span>
                </li>
            ))}
        </ul>
    );
}

/** Shared tooltip shell: value leads, series name follows, keyed by a line of
 *  the series colour rather than a filled box (at tooltip density a box is
 *  data-weight ink doing a label's job). */
export function TooltipShell({
    palette,
    title,
    children,
}: {
    palette: VizPalette;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className="rounded-xl px-3 py-2.5 shadow-xl backdrop-blur-md min-w-[9rem]"
            style={{
                backgroundColor: palette.tooltipBg,
                border: `1px solid ${palette.tooltipBorder}`,
                color: palette.ink,
            }}
        >
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-60 mb-1.5">{title}</p>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

export function TooltipRow({
    color,
    label,
    value,
    shape = "line",
}: {
    color?: string;
    label: string;
    value: string;
    shape?: "line" | "rect";
}) {
    return (
        <div className="flex items-baseline justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 opacity-70">
                {color && (
                    <span
                        aria-hidden
                        className={shape === "line" ? "block w-3 h-[3px] rounded-full" : "block w-2 h-2 rounded-[2px]"}
                        style={{ backgroundColor: color }}
                    />
                )}
                {label}
            </span>
            <span className="font-semibold tabular-nums">{value}</span>
        </div>
    );
}

/**
 * Horizontal scroll frame for a plot that needs room to stay readable.
 *
 * A 30-day stacked column chart, a 13-bar Pareto with angled labels, or a
 * scatter of the whole fleet does not become clearer when squeezed to 350px —
 * it becomes a smear with overlapping ticks. Below `sm` the plot keeps a
 * minimum width and the card scrolls sideways; the chart being visibly cut at
 * the card's edge is the affordance that says so. From `sm` up `min-w-0`
 * releases it and no scrollbar ever appears.
 *
 * Horizontal only. Never wrap a chart in a *vertical* scroll box — that is the
 * nested-scroll trap that cost the driver refill sheet its sticky header and
 * its pull-to-refresh.
 */
export function ChartFrame({
    height,
    minWidth = 560,
    children,
}: {
    height: number;
    minWidth?: number;
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-x-auto overflow-y-hidden">
            <div className="sm:!min-w-0" style={{ height, minWidth }}>
                {children}
            </div>
        </div>
    );
}

export function ChartSkeleton({ height }: { height: number }) {
    return (
        <div
            className="w-full rounded-2xl bg-slate-100 dark:bg-white/[0.04] animate-pulse"
            style={{ height }}
            aria-hidden
        />
    );
}

export function ChartEmpty({ height, message }: { height: number; message: string }) {
    return (
        <div
            className="w-full flex items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400 px-6"
            style={{ height }}
        >
            {message}
        </div>
    );
}

export default function ChartCard({
    title,
    subtitle,
    icon,
    accent = "text-accent-blue",
    legend,
    caveat,
    table,
    headline,
    children,
    className = "",
}: {
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    /** Text token for the header icon — identity for the card, not the data. */
    accent?: string;
    legend?: LegendItem[];
    /** One line naming what the numbers can and can't tell you. */
    caveat?: string;
    table: ChartTable;
    /** Optional figure pinned to the header — the chart's one-line takeaway. */
    headline?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    const [view, setView] = useState<"chart" | "table">("chart");
    const titleId = useId();

    return (
        <section
            aria-labelledby={titleId}
            className={`glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden ${className}`}
        >
            <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className={`mt-0.5 shrink-0 ${accent}`}>{icon}</div>
                        <div className="min-w-0">
                            <h3 id={titleId} className="font-display font-bold text-slate-900 dark:text-white text-base leading-tight">
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{subtitle}</p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 shrink-0">
                        <ViewToggle active={view === "chart"} onClick={() => setView("chart")} label="Chart">
                            <BarChart3 className="w-3.5 h-3.5" />
                        </ViewToggle>
                        <ViewToggle active={view === "table"} onClick={() => setView("table")} label="Table">
                            <Table2 className="w-3.5 h-3.5" />
                        </ViewToggle>
                    </div>
                </div>

                {headline && <div className="mt-4">{headline}</div>}
            </header>

            <div className="p-5 sm:p-6">
                {view === "chart" ? (
                    <>
                        {children}
                        {legend && legend.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/5">
                                <VizLegend items={legend} />
                            </div>
                        )}
                    </>
                ) : (
                    <DataTable table={table} />
                )}

                {caveat && (
                    <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>{caveat}</span>
                    </p>
                )}
            </div>
        </section>
    );
}

function ViewToggle({
    active,
    onClick,
    label,
    children,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            title={`${label} view`}
            // 44px square on a phone, where the label is hidden and this is a
            // bare icon; it shrinks to a labelled pill from `sm` up.
            className={`flex items-center justify-center gap-1.5 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                active
                    ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
        >
            {children}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

function DataTable({ table }: { table: ChartTable }) {
    const numericFrom = table.numericFrom ?? 1;
    return (
        // Capped and independently scrollable on desktop, where it sits beside
        // other content. On a phone the cap is released and the table grows with
        // the page: a 360px-tall inner scroller inside a scrolling page is two
        // scroll surfaces competing for one thumb. Horizontal scroll stays —
        // that one has no page-level competitor.
        <div className="overflow-x-auto sm:max-h-[360px] sm:overflow-y-auto rounded-2xl border border-slate-200 dark:border-white/5">
            <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900">
                    <tr>
                        {table.columns.map((col, i) => (
                            <th
                                key={col}
                                scope="col"
                                className={`px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap ${
                                    i >= numericFrom ? "text-right" : "text-left"
                                }`}
                            >
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                    {table.rows.length === 0 ? (
                        <tr>
                            <td
                                colSpan={table.columns.length}
                                className="px-3 py-8 text-center text-slate-500 dark:text-slate-400"
                            >
                                No data in this period.
                            </td>
                        </tr>
                    ) : (
                        table.rows.map((row, r) => (
                            <tr key={r} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                                {row.map((cell, c) => (
                                    <td
                                        key={c}
                                        className={`px-3 py-2 whitespace-nowrap ${
                                            c >= numericFrom
                                                ? "text-right tabular-nums font-medium text-slate-900 dark:text-white"
                                                : "text-left text-slate-600 dark:text-slate-300"
                                        }`}
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
