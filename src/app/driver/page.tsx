export const dynamic = 'force-dynamic';
import { getMachines, getActiveDispatches } from "@/actions/inventory";
import { DriverRefillUI } from "@/components/DriverRefillUI";

export default async function DriverPortal() {
    const [machines, dispatches] = await Promise.all([
        getMachines(),
        getActiveDispatches()
    ]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg sm:p-4 text-slate-900 dark:text-white">
            <div className="max-w-md mx-auto h-full pt-4 sm:pt-0">
                <DriverRefillUI machines={machines} activeDispatches={dispatches} />
            </div>
        </div>
    );
}
