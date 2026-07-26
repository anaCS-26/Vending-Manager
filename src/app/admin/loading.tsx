import { KpiRowSkeleton, TableSkeleton, Skeleton, LoadingRegion } from "@/components/Skeleton";

/**
 * Shown while any /admin/* route's server component awaits its queries. The
 * sidebar and header live in the layout, so they stay put — only the content
 * column swaps to this.
 *
 * Every admin page calls auth(), which forces dynamic rendering, so this is
 * displayed on every navigation rather than just cold loads.
 */
export default function AdminLoading() {
    return (
        <LoadingRegion label="Loading page">
            <div className="space-y-6">
                <div>
                    <Skeleton className="h-7 w-56" />
                    <Skeleton className="mt-2 h-3 w-80" />
                </div>

                <KpiRowSkeleton />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <TableSkeleton rows={7} />
                    </div>
                    <TableSkeleton rows={4} />
                </div>
            </div>
        </LoadingRegion>
    );
}
