"use client";

import { SortIcon } from "@/components/SortIcon";
import { cn } from "@/lib/utils";
import { describePackaging } from "@/lib/packaging";
import type { Item } from "@prisma/client";

/**
 * The pieces the two stock tables (warehouse and machine) share.
 *
 * Both tables used to be `min-w-[900px]` slabs with `px-6 py-4` cells: the
 * item column was squeezed until names and the packaging badge wrapped onto
 * three or four lines, every row carried an "UNCATEGORIZED" line, and Total
 * value and Location sat off-screen at 1366px behind a horizontal scrollbar.
 *
 * The layout rule now: the table is `w-full` with no minimum width. Every
 * column except Item is `w-px whitespace-nowrap`, so it shrinks to its
 * content, and Item takes whatever is left. Secondary columns hide by the
 * *panel's* width (Tailwind container queries, `@2xl:` etc. on a `@container`
 * wrapper), not the viewport's, so the same rules hold with the sidebar open,
 * collapsed, or absent. `overflow-x-auto` stays on the wrapper only as a
 * safety net for a very narrow tablet.
 */

/** "Uncategorized" is the seed default, not information; don't print it. */
export function showCategory(category: string | null | undefined): string | null {
    const c = category?.trim();
    if (!c || c.toLowerCase() === "uncategorized") return null;
    return c;
}

/** One line under the item name: packaging, then category — only what's set. */
export function itemDetailLine(item: Pick<Item, "category" | "bulk_format" | "pieces_per_box" | "piece_size" | "piece_size_unit">): string | null {
    const parts = [describePackaging(item) ?? item.bulk_format?.trim() ?? null, showCategory(item.category)].filter(
        (p): p is string => !!p,
    );
    return parts.length ? parts.join(" · ") : null;
}

/**
 * Name + SKU on one line, packaging/category on the next. Nothing wraps: the
 * name truncates (its full text is in `title`) and the detail line truncates,
 * so a row is two lines tall no matter what the catalogue says.
 */
export function ItemIdentity({
    item,
    index,
    className,
}: {
    item: Pick<Item, "name" | "sku" | "category" | "bulk_format" | "pieces_per_box" | "piece_size" | "piece_size_unit">;
    /** Row number when the cards show it inline (the table has its own column). */
    index?: number;
    className?: string;
}) {
    const detail = itemDetailLine(item);
    return (
        <div className={cn("min-w-0", className)}>
            <div className="flex items-baseline gap-2 min-w-0">
                {index !== undefined && (
                    <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{index}</span>
                )}
                <span
                    className="font-semibold text-slate-900 dark:text-white text-sm tracking-tight truncate uppercase"
                    title={item.name}
                >
                    {item.name}
                </span>
                <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 uppercase shrink-0">
                    #{item.sku}
                </span>
            </div>
            {detail && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5" title={detail}>
                    {detail}
                </div>
            )}
        </div>
    );
}

/** Cell padding shared by header and body so columns line up. */
export const CELL = "px-3 py-2.5 first:pl-4 last:pr-4";
/** A column that shrinks to its content; the Item column takes the rest. */
export const FIT = "w-px whitespace-nowrap";

export function SortableTh<K extends string>({
    columnKey,
    sortConfig,
    onSort,
    align = "left",
    className,
    children,
}: {
    columnKey: K;
    sortConfig: { key: K | null; direction: "asc" | "desc" };
    onSort: (key: K) => void;
    align?: "left" | "right";
    className?: string;
    children: React.ReactNode;
}) {
    const active = sortConfig.key === columnKey;
    return (
        <th
            scope="col"
            aria-sort={active ? (sortConfig.direction === "asc" ? "ascending" : "descending") : "none"}
            className={cn(CELL, "font-bold uppercase", align === "right" ? "text-right" : "text-left", className)}
        >
            <button
                type="button"
                onClick={() => onSort(columnKey)}
                className={cn(
                    "group inline-flex items-center gap-0.5 min-h-[28px] hover:text-slate-900 dark:hover:text-white transition-colors",
                    align === "right" && "flex-row-reverse",
                    active && "text-slate-900 dark:text-white",
                )}
            >
                <span>{children}</span>
                <SortIcon columnKey={columnKey} sortConfig={sortConfig} />
            </button>
        </th>
    );
}
