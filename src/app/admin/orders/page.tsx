import prisma from "@/lib/prisma";
import { Store } from "lucide-react";
import OrderManagerUI from "@/components/OrderManagerUI";

export default async function OrdersPage() {
    const warehouses = await prisma.warehouse.findMany({
        orderBy: { name: 'asc' }
    });

    const items = await prisma.item.findMany({
        orderBy: { name: 'asc' },
        include: {
            WarehouseStock: true,
            _count: { select: { DispatchItems: true } }
        }
    });

    const orders = await prisma.purchaseOrder.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            warehouse: true,
            Items: {
                include: {
                    item: true
                }
            }
        }
    });

    const pendingOrders = orders.filter((o: any) => o.status === "PENDING" || o.status === "DRAFT");
    const completedOrders = orders.filter((o: any) => o.status === "COMPLETED" || o.status === "CANCELLED");

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Manage Orders
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                        Create purchase orders, receive supplier shipments, and track inventory history.
                    </p>
                </div>
                <div className="hidden md:flex w-12 h-12 rounded-xl bg-accent-purple/10 border border-accent-purple/20 items-center justify-center">
                    <Store className="w-6 h-6 text-accent-purple" />
                </div>
            </div>

            <OrderManagerUI
                warehouses={warehouses}
                items={items}
                pendingOrders={pendingOrders as any}
                completedOrders={completedOrders as any}
            />
        </div>
    );
}
