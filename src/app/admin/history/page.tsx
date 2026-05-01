export const revalidate = 30;
import { getRefillLogsPaginated, getDriversForFilter } from "@/actions/history";
import UnifiedHistoryManager from "@/components/UnifiedHistoryManager";

export default async function HistoryPage() {
    const [initialEvents, drivers] = await Promise.all([
        getRefillLogsPaginated({ page: 1 }),
        getDriversForFilter(),
    ]);

    return (
        <div className="pb-20">
            <UnifiedHistoryManager
                initialEvents={initialEvents}
                drivers={drivers}
            />
        </div>
    );
}
