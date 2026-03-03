export const dynamic = 'force-dynamic';
import prisma from "@/lib/prisma";
import ManagementDashboard from "@/components/ManagementDashboard";

export default async function ManagePage() {
    const [drivers, machines, warehouses] = await Promise.all([
        prisma.driver.findMany(),
        prisma.machine.findMany(),
        prisma.warehouse.findMany()
    ]);

    const items = await prisma.item.findMany({
        include: {
            WarehouseStock: {
                include: {
                    warehouse: {
                        select: { name: true }
                    }
                }
            }
        }
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Entity Management</h1>
                <p className="text-slate-600 dark:text-slate-400 font-medium">Add, update, and remove fleet drivers, vending machines, catalog items, and warehouse locations.</p>
            </div>

            <ManagementDashboard
                drivers={drivers}
                machines={machines}
                warehouses={warehouses}
                items={items as any}
            />
        </div>
    );
}
