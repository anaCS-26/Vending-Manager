export const revalidate = 30;
import { getWarehouseInventory } from "@/actions/inventory";
import { getWarehouses } from "@/actions/warehouses";
import { Database } from "lucide-react";
import WarehouseInventoryTable from "@/components/WarehouseInventoryTable";
import prisma from "@/lib/prisma";

export default async function WarehousePage() {
    const [inventory, warehouses, existingItems] = await Promise.all([
        getWarehouseInventory(),
        getWarehouses(),
        prisma.item.findMany()
    ]);

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Warehouse Inventory
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                        Current stock levels and statuses
                    </p>
                </div>
                <div className="hidden md:flex w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 items-center justify-center">
                    <Database className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                </div>
            </div>

            <WarehouseInventoryTable
                inventory={inventory}
                warehouses={warehouses}
                existingItems={existingItems}
            />
        </div>
    );
}
