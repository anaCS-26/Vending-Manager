export const revalidate = 30;
import { getClosedDispatches } from "@/actions/inventory";
import { getRefillLogsPaginated, getDriversForFilter } from "@/actions/history";
import UnifiedHistoryManager from "@/components/UnifiedHistoryManager";

export default async function HistoryPage() {
    const [dispatches, initialEvents, drivers] = await Promise.all([
        getClosedDispatches(),
        getRefillLogsPaginated({ page: 1 }),
        getDriversForFilter(),
    ]);

    return (
        <div className="pb-20">
            <UnifiedHistoryManager
                dispatches={dispatches}
                initialEvents={initialEvents}
                drivers={drivers}
            />
        </div>
    );
}
