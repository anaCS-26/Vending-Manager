export const dynamic = 'force-dynamic';
import prisma from "@/lib/prisma";
import SuperAdminsDashboard from "@/components/SuperAdminsDashboard";
import { Truck, Package } from "lucide-react";
import { formatRelativeAge } from "@/lib/utils";

export default async function SuperAdminsPage() {
    const [admins, adminActivity, drivers, driverActivity] = await Promise.all([
        prisma.admin.findMany({
            where: { role: 'ADMIN' },
            select: { id: true, email: true, name: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        }),
        // Most-recent audit action per non-driver actor (role filter disambiguates
        // admin ids from driver ids, which share an autoincrement space).
        prisma.systemAuditLog.groupBy({
            by: ['actorId'],
            where: { actorRole: { not: 'driver' } },
            _max: { timestamp: true },
        }),
        prisma.driver.findMany({
            select: { id: true, name: true, phone: true, isActive: true, _count: { select: { DriverStock: true } } },
            orderBy: { name: 'asc' },
        }),
        prisma.refillLog.groupBy({ by: ['driverId'], _max: { refilled_at: true } }),
    ]);

    const adminLastActivity: Record<number, string | null> = {};
    for (const a of adminActivity) {
        if (a.actorId != null) adminLastActivity[a.actorId] = a._max.timestamp ? a._max.timestamp.toISOString() : null;
    }

    const driverLastRefill: Record<number, string | null> = {};
    for (const d of driverActivity) {
        if (d.driverId != null) driverLastRefill[d.driverId] = d._max.refilled_at ? d._max.refilled_at.toISOString() : null;
    }

    return (
        <div className="space-y-10">
            <SuperAdminsDashboard admins={admins} lastActivity={adminLastActivity} />

            {/* Driver roster (read-only) */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Truck className="w-5 h-5 text-accent-green" />
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Driver Roster</h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400">({drivers.length})</span>
                </div>

                {drivers.length === 0 ? (
                    <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-10 text-center text-slate-500 dark:text-slate-400">
                        No drivers registered yet.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {drivers.map((d) => (
                            <div key={d.id} className="glass-panel border border-slate-200 dark:border-white/5 rounded-[1.75rem] p-5 flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-accent-green/10 text-accent-green flex items-center justify-center font-bold text-lg border border-accent-green/20 shrink-0">
                                    {d.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-slate-900 dark:text-white truncate">{d.name}</h3>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${d.isActive ? "bg-accent-green/10 text-accent-green" : "bg-slate-200 dark:bg-white/10 text-slate-500"}`}>
                                            {d.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{d.phone || "No phone"}</p>
                                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                        <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {d._count.DriverStock} in bag</span>
                                        <span>· last refill {formatRelativeAge(driverLastRefill[d.id])}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
