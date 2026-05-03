"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type PaginationProps = {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    /** Maximum count of page-number buttons rendered. Defaults to 3. */
    windowSize?: number;
    className?: string;
};

/**
 * Predictable pagination control: ⏮ ◀ [sliding window of up to N consecutive
 * pages] ▶ ⏭. The window slides as the user moves; it never injects ellipses
 * or non-adjacent page numbers, so clicking a number always moves the user
 * to a page right next to where they were.
 */
export default function Pagination({
    currentPage,
    totalPages,
    onPageChange,
    windowSize = 3,
    className = "",
}: PaginationProps) {
    if (totalPages <= 1) return null;

    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const size = Math.min(windowSize, totalPages);

    // Center the window on the current page, then clamp into [1..totalPages].
    let start = safePage - Math.floor(size / 2);
    if (start < 1) start = 1;
    if (start + size - 1 > totalPages) start = totalPages - size + 1;
    const pages = Array.from({ length: size }, (_, i) => start + i);

    const atFirst = safePage === 1;
    const atLast = safePage === totalPages;

    const arrowBase =
        "p-2 rounded-lg bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 " +
        "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white " +
        "hover:border-slate-400 dark:hover:border-white/20 disabled:opacity-30 " +
        "disabled:cursor-not-allowed disabled:hover:text-slate-600 dark:disabled:hover:text-slate-400 " +
        "disabled:hover:border-slate-300 dark:disabled:hover:border-white/10 transition-colors shadow-sm";

    const numberBase =
        "w-9 h-9 rounded-lg text-sm font-bold transition-colors shadow-sm";
    const numberInactive =
        "bg-white dark:bg-black/20 border border-slate-300 dark:border-white/10 " +
        "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white " +
        "hover:border-slate-400 dark:hover:border-white/20";
    const numberActive =
        "bg-brand-500 text-white border border-brand-500 shadow-[0_0_12px_rgba(59,130,246,0.35)]";

    return (
        <nav
            aria-label="Pagination"
            className={`flex items-center justify-center gap-1.5 ${className}`}
        >
            <button
                type="button"
                onClick={() => onPageChange(1)}
                disabled={atFirst}
                aria-label="First page"
                title="First page"
                className={arrowBase}
            >
                <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => onPageChange(safePage - 1)}
                disabled={atFirst}
                aria-label="Previous page"
                title="Previous page"
                className={arrowBase}
            >
                <ChevronLeft className="w-4 h-4" />
            </button>

            {pages.map((p) => {
                const isActive = p === safePage;
                return (
                    <button
                        key={p}
                        type="button"
                        onClick={() => onPageChange(p)}
                        aria-label={`Page ${p}`}
                        aria-current={isActive ? "page" : undefined}
                        className={`${numberBase} ${isActive ? numberActive : numberInactive}`}
                    >
                        {p}
                    </button>
                );
            })}

            <button
                type="button"
                onClick={() => onPageChange(safePage + 1)}
                disabled={atLast}
                aria-label="Next page"
                title="Next page"
                className={arrowBase}
            >
                <ChevronRight className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={() => onPageChange(totalPages)}
                disabled={atLast}
                aria-label="Last page"
                title="Last page"
                className={arrowBase}
            >
                <ChevronsRight className="w-4 h-4" />
            </button>
        </nav>
    );
}
