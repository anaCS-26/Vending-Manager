export const revalidate = 30;
import { getRefillLogsPaginated, getDriversForFilter, getMachinesForFilter } from "@/actions/history";
import UnifiedHistoryManager from "@/components/UnifiedHistoryManager";

export default async function HistoryPage() {
    const [initialEvents, drivers, machines] = await Promise.all([
        getRefillLogsPaginated({ page: 1 }),
        getDriversForFilter(),
        getMachinesForFilter(),
    ]);

    return (
        <div className="pb-20">
            <UnifiedHistoryManager
                initialEvents={initialEvents}
                drivers={drivers}
                machines={machines}
            />
        </div>
    );
}
