export const dynamic = 'force-dynamic';
import { getMachines, getActiveDispatches } from "@/actions/inventory";
import { DriverRefillUI } from "@/components/DriverRefillUI";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DriverPortal() {
    const session = await auth();
    if (!session?.user) redirect('/login');

    // @ts-ignore
    const role = session.user.role;
    // @ts-ignore
    const phone = session.user.phone;

    const [machines, allDispatches] = await Promise.all([
        getMachines(),
        getActiveDispatches()
    ]);

    let dispatches = allDispatches;
    if (role === 'driver') {
        dispatches = allDispatches.filter(d => d.driver.phone === phone);
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg sm:p-4 text-slate-900 dark:text-white">
            <div className="max-w-md mx-auto h-full pt-4 sm:pt-0">
                <DriverRefillUI machines={machines} activeDispatches={dispatches} userRole={role as 'admin' | 'driver'} />
            </div>
        </div>
    );
}
