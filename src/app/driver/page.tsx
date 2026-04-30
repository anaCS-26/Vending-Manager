export const dynamic = 'force-dynamic';
import { getMachines, getActiveDispatches } from "@/actions/inventory";
import { getDriverBag } from "@/actions/driver-stock";
import { DriverRefillUI } from "@/components/DriverRefillUI";
import { AssignmentAckBanner } from "@/components/AssignmentAckBanner";
import { DriverReturnTrigger } from "@/components/DriverReturnTrigger";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DriverPortal() {
    const session = await auth();
    if (!session?.user) redirect('/login');

    // @ts-ignore
    const role = session.user.role;
    // @ts-ignore
    const phone = session.user.phone;

    const [machines, allDispatches, driverBag] = await Promise.all([
        getMachines(),
        getActiveDispatches(),
        // Pending assignments live regardless of feature flag — if any exist
        // (e.g. seeded for QA, or after the cutover), surface them. Admin
        // sessions get an empty result here since the action is driver-only.
        role === 'driver' ? getDriverBag() : Promise.resolve({ driverId: null, bag: [], pendingAssignments: [] }),
    ]);

    let dispatches = allDispatches;
    if (role === 'driver') {
        dispatches = allDispatches.filter(d => d.driver.phone === phone);
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg sm:p-4 text-slate-900 dark:text-white">
            <div className="max-w-md mx-auto h-full pt-4 sm:pt-0">
                {role === 'driver' && driverBag.pendingAssignments.length > 0 && (
                    <AssignmentAckBanner pending={driverBag.pendingAssignments} />
                )}
                <DriverRefillUI machines={machines} activeDispatches={dispatches} userRole={role as 'admin' | 'super_admin' | 'driver'} />
                {role === 'driver' && <DriverReturnTrigger bag={driverBag.bag} />}
            </div>
        </div>
    );
}
