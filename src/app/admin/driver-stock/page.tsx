export const dynamic = 'force-dynamic';
import { getWarehouseInventory } from "@/actions/inventory";
import { getWarehouses } from "@/actions/warehouses";
import { getDriversWithBagAndPending } from "@/actions/driver-stock";
import { DriverStockManager } from "@/components/DriverStockManager";

export default async function DriverStockPage() {
    const [drivers, inventory, warehouses] = await Promise.all([
        getDriversWithBagAndPending(),
        getWarehouseInventory(),
        getWarehouses(),
    ]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Driver Stock</h1>
                <p className="text-slate-600 dark:text-slate-400 mt-1">Push items directly into a driver's bag. Drivers acknowledge or report missing items from the driver portal.</p>
            </div>

            <DriverStockManager drivers={drivers} inventory={inventory} warehouses={warehouses} />
        </div>
    );
}
