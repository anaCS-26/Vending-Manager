"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The phone half of every wide admin table.
 *
 * The tables in this app carry 9–12 columns and set `min-w-[900px]`–`[1000px]`
 * inside an `overflow-x-auto`, which on a 390px screen is a slab you drag
 * sideways two columns at a time — and the column headers, which is where all
 * the sorting lives, scroll away with it. Below `sm` the table is hidden and the
 * same rows render as cards: identity on the left, the one number that matters
 * on the right, everything else as label/value pairs.
 *
 * Deliberately a pair of primitives rather than a generic <ResponsiveTable> that
 * takes a column config. The five call sites disagree about what the headline
 * figure is, which fields collapse, and what a row links to; a config object
 * broad enough to cover all five would be harder to read than the markup it
 * replaced. This just removes the repetition that is genuinely shared.
 */

type Tone = "default" | "muted" | "good" | "warn" | "danger";

// Static strings — Tailwind only emits classes it can see in source.
const TONES: Record<Tone, string> = {
    default: "text-slate-900 dark:text-white",
    muted: "text-slate-500 dark:text-slate-400",
    good: "text-accent-green",
    warn: "text-accent-orange",
    danger: "text-accent-pink",
};

export type CardField = {
    label: string;
    value: React.ReactNode;
    tone?: Tone;
    /** Span both grid columns — for anything long, like a note or address. */
    wide?: boolean;
};

export function DataCard({
    title,
    meta,
    highlight,
    fields,
    footer,
    accentBorder = false,
}: {
    title: React.ReactNode;
    /** Secondary identity line — SKU, category, district. */
    meta?: React.ReactNode;
    /** The single figure worth reading first, shown large on the right. */
    highlight?: { label: string; value: React.ReactNode; tone?: Tone };
    fields?: CardField[];
    footer?: React.ReactNode;
    accentBorder?: boolean;
}) {
    const visible = (fields ?? []).filter((f) => f.value !== null && f.value !== undefined);

    return (
        <div
            className={cn(
                "rounded-2xl border bg-white dark:bg-white/[0.02] p-4",
                accentBorder
                    ? "border-accent-orange/40 dark:border-accent-orange/30"
                    : "border-slate-200 dark:border-white/10",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{title}</div>
                    {meta && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">{meta}</div>}
                </div>
                {highlight && (
                    <div className="text-right shrink-0">
                        <div className={cn("text-lg font-bold font-mono leading-none", TONES[highlight.tone ?? "default"])}>
                            {highlight.value}
                        </div>
                        <div className="mt-1 font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                            {highlight.label}
                        </div>
                    </div>
                )}
            </div>

            {visible.length > 0 && (
                <dl className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 gap-x-3 gap-y-2.5">
                    {visible.map((f) => (
                        <div key={f.label} className={cn("min-w-0", f.wide && "col-span-2")}>
                            <dt className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                {f.label}
                            </dt>
                            <dd className={cn("mt-0.5 text-xs font-bold font-mono truncate", TONES[f.tone ?? "default"])}>
                                {f.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}

            {footer && <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5">{footer}</div>}
        </div>
    );
}

/**
 * Sorting for the card view. On the table, sorting lives in the `<th>`s; once
 * those are hidden the ability goes with them, so it comes back here as a plain
 * select plus a direction toggle. `<select>` on purpose — it gets the native
 * wheel picker on both platforms, which beats any custom dropdown on a phone.
 */
export function MobileSortSelect<K extends string>({
    options,
    sortKey,
    direction,
    onSort,
    className,
}: {
    options: { key: K; label: string }[];
    sortKey: K | null;
    direction: "asc" | "desc";
    /** Same handler the column headers use — it toggles direction on re-select. */
    onSort: (key: K) => void;
    className?: string;
}) {
    const active = sortKey ?? options[0]?.key;

    return (
        <div className={cn("sm:hidden flex items-stretch gap-2", className)}>
            <label className="sr-only" htmlFor="mobile-sort">
                Sort by
            </label>
            <div className="relative flex-1">
                <select
                    id="mobile-sort"
                    value={active}
                    onChange={(e) => {
                        // Re-selecting the active key would toggle direction, which is
                        // not what picking from a list means — only fire on a change.
                        const next = e.target.value as K;
                        if (next !== sortKey) onSort(next);
                    }}
                    className="w-full appearance-none bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl pl-3 pr-8 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none"
                >
                    {options.map((o) => (
                        <option key={o.key} value={o.key} className="bg-white dark:bg-slate-900">
                            Sort: {o.label}
                        </option>
                    ))}
                </select>
                <ArrowDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
            <button
                type="button"
                onClick={() => onSort(active)}
                aria-label={direction === "asc" ? "Sort descending" : "Sort ascending"}
                className="w-11 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/40 text-slate-600 dark:text-slate-300 active:bg-slate-200 dark:active:bg-white/10"
            >
                {direction === "asc" ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </button>
        </div>
    );
}
