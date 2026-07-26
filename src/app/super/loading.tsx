import { KpiRowSkeleton, TableSkeleton, Skeleton, LoadingRegion } from "@/components/Skeleton";

/**
 * Shown while any /super/* route awaits its insight queries. Every page in this
 * zone is force-dynamic and several fan out to four independent read actions,
 * so this is the slowest zone in the app to first paint.
 */
export default function SuperLoading() {
    return (
        <LoadingRegion label="Loading console">
            <div className="space-y-6">
                <div>
                    <Skeleton className="h-7 w-64" />
                    <Skeleton className="mt-2 h-3 w-96" />
                </div>

                <KpiRowSkeleton />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <TableSkeleton rows={6} />
                    <TableSkeleton rows={6} />
                </div>
            </div>
        </LoadingRegion>
    );
}
