export const dynamic = 'force-dynamic';
import prisma from "@/lib/prisma";
import { getAuditLogsPaginated, getAuditActionTypes } from "@/actions/history";
import AuditLogTable from "@/components/AuditLogTable";

export default async function SuperAuditPage() {
    const [initialResult, actionTypes, admins, drivers] = await Promise.all([
        getAuditLogsPaginated({ page: 1 }),
        getAuditActionTypes(),
        prisma.admin.findMany({ select: { id: true, name: true, email: true } }),
        prisma.driver.findMany({ select: { id: true, name: true } }),
    ]);

    const adminNames: Record<number, string> = Object.fromEntries(
        admins.map(a => [a.id, a.name || a.email])
    );
    const driverNames: Record<number, string> = Object.fromEntries(
        drivers.map(d => [d.id, d.name])
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Audit Trail</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Immutable record of every state change — who did what, when, and the before → after.
                </p>
            </div>

            <AuditLogTable
                initialResult={initialResult}
                actionTypes={actionTypes}
                adminNames={adminNames}
                driverNames={driverNames}
            />
        </div>
    );
}
