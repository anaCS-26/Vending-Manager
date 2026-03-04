export const revalidate = 30;
import { getMachineInventory, getMachines } from "@/actions/inventory";
import { TrendingDown } from "lucide-react";
import MachineInventoryTable from "@/components/MachineInventoryTable";

export default async function MachineStockPage() {
    const [inventory, machines] = await Promise.all([
        getMachineInventory(),
        getMachines()
    ]);

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Machine Inventory
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                        Estimated machine stock levels based on driver restocks and sales declarations
                    </p>
                </div>
                <div className="hidden md:flex w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 items-center justify-center">
                    <TrendingDown className="w-6 h-6 text-brand-400" />
                </div>
            </div>

            <MachineInventoryTable
                inventory={inventory}
                machines={machines}
            />
        </div>
    );
}
