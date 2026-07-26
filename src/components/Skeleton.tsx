/**
 * Loading placeholders for route-level `loading.tsx` files.
 *
 * These are server components on purpose — a `loading.tsx` renders before any
 * client JS is needed, so keeping them RSC means the skeleton paints on the
 * very first byte instead of waiting for hydration.
 *
 * Shapes here should roughly match the real content they stand in for. A
 * skeleton that's the wrong size is worse than none: it makes the page jump
 * when the data lands.
 */

/** One shimmering block. `className` sets the size. */
export function Skeleton({ className = "" }: { className?: string }) {
    return (
        <div
            aria-hidden="true"
            className={`animate-pulse rounded-lg bg-slate-200/70 dark:bg-white/5 ${className}`}
        />
    );
}

/** Stand-in for a row of <KpiCard>s. */
export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="glass-panel rounded-3xl p-5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-4 h-8 w-32" />
                    <Skeleton className="mt-3 h-2.5 w-20" />
                </div>
            ))}
        </div>
    );
}

/** Stand-in for a table/list panel. */
export function TableSkeleton({ rows = 6, title = true }: { rows?: number; title?: boolean }) {
    return (
        <div className="glass-panel rounded-3xl p-5">
            {title && <Skeleton className="mb-5 h-4 w-40" />}
            <div className="space-y-3">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                        <Skeleton className="h-3 flex-1" />
                        <Skeleton className="hidden h-3 w-24 sm:block" />
                        <Skeleton className="h-3 w-14 shrink-0" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Accessible live-region wrapper so screen readers announce the pending state. */
export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{label}</span>
            {children}
        </div>
    );
}
