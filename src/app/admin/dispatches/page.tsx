import { getDrivers, getWarehouseInventory, getActiveDispatches } from "@/actions/inventory";
import { getWarehouses } from "@/actions/warehouses";
import { DispatchManager } from "@/components/DispatchManager";

export default async function DispatchesPage() {
    const drivers = await getDrivers();
    const inventory = await getWarehouseInventory();
    const activeDispatches = await getActiveDispatches();
    const warehouses = await getWarehouses();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Active Dispatches</h1>
                <p className="text-slate-600 dark:text-slate-400 mt-1">Assign inventory to drivers and manage live route operations.</p>
            </div>

            <DispatchManager
                drivers={drivers}
                inventory={inventory}
                activeDispatches={activeDispatches}
                warehouses={warehouses}
            />
        </div>
    );
}

