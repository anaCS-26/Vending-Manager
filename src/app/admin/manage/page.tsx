export const dynamic = 'force-dynamic';
import prisma from "@/lib/prisma";
import ManagementDashboard from "@/components/ManagementDashboard";

export default async function ManagePage() {
    const [drivers, machines, warehouses, items, templates] = await Promise.all([
        prisma.driver.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
        prisma.machine.findMany({ orderBy: { id: 'asc' } }),
        prisma.warehouse.findMany({ orderBy: { name: 'asc' } }),
        prisma.item.findMany({
            orderBy: { name: 'asc' },
            include: {
                WarehouseStock: {
                    include: {
                        warehouse: {
                            select: { name: true }
                        }
                    }
                }
            }
        }),
        prisma.dispatchTemplate.findMany({
            include: { Items: { include: { item: true } } },
            orderBy: { name: 'asc' }
        })
    ]);

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
                templates={templates}
            />
        </div>
    );
}
