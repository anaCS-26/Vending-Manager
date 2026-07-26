import { Skeleton, LoadingRegion } from "@/components/Skeleton";

/**
 * Driver portal skeleton. This is the one that matters most: drivers open the
 * app on mid-range phones over cellular, and /driver is force-dynamic, so the
 * alternative is staring at a blank viewport.
 *
 * Mirrors DriverRefillUI's shell — header, machine picker, then item rows.
 */
export default function DriverLoading() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg sm:p-4">
            <div className="mx-auto h-full max-w-md pt-4 sm:pt-0">
                <LoadingRegion label="Loading your route">
                    <div className="px-4 py-6">
                        {/* Header: driver name + actions */}
                        <div className="mb-6 flex items-center justify-between">
                            <div>
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="mt-2 h-6 w-40" />
                            </div>
                            <Skeleton className="h-10 w-10 rounded-full" />
                        </div>

                        {/* Machine picker */}
                        <Skeleton className="mb-3 h-[60px] w-full rounded-2xl" />

                        {/* BAG / MACHINE toggle */}
                        <div className="mb-4 flex gap-2">
                            <Skeleton className="h-9 flex-1 rounded-xl" />
                            <Skeleton className="h-9 flex-1 rounded-xl" />
                        </div>

                        {/* Item rows */}
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-white/10"
                                >
                                    <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
                                    <div className="min-w-0 flex-1">
                                        <Skeleton className="h-3 w-3/4" />
                                        <Skeleton className="mt-2 h-2.5 w-1/2" />
                                    </div>
                                    <Skeleton className="h-10 w-24 shrink-0 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    </div>
                </LoadingRegion>
            </div>
        </div>
    );
}
