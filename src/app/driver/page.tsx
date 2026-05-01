export const dynamic = 'force-dynamic';
import { getMachines, getActiveDispatches } from "@/actions/inventory";
import { getDriverBag } from "@/actions/driver-stock";
import { DriverRefillUI } from "@/components/DriverRefillUI";
import { AssignmentAckBanner } from "@/components/AssignmentAckBanner";
import { DriverReturnTrigger } from "@/components/DriverReturnTrigger";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Builds a synthetic DispatchWithRelations from the driver's DriverStock so the
 * existing DriverRefillUI renders without a parallel component tree. id=0 is
 * the dispatchless sentinel — DriverRefillUI translates it to null at the
 * server-action boundary so logBatchRefills routes to the bag-based path.
 */
function synthesizeDispatchlessRoute(args: {
    driverId: number;
    driverName: string;
    driverPhone: string | null;
    bag: Array<{ id: number; itemId: number; quantity_on_hand: number; item: any }>;
}): any {
    return {
        id: 0,
        driverId: args.driverId,
        warehouseId: null,
        dispatch_date: new Date(),
        status: 'OPEN',
        driver: {
            id: args.driverId,
            name: args.driverName,
            phone: args.driverPhone,
            email: null,
            isActive: true,
            DriverStock: args.bag,
        },
        DispatchItems: [],
        RefillLogs: [],
    };
}

export default async function DriverPortal() {
    const session = await auth();
    if (!session?.user) redirect('/login');

    // @ts-expect-error - session.user.role is populated via session callback
    const role = session.user.role;
    // @ts-expect-error - session.user.phone is populated via session callback
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

    // Dispatchless synthesis: with the flag on, when a driver has no active
    // dispatch but does have items in their bag, hand DriverRefillUI a synthetic
    // route so they can refill machines from DriverStock directly.
    if (
        role === 'driver' &&
        dispatches.length === 0 &&
        driverBag.bag.length > 0 &&
        driverBag.driverId !== null
    ) {
        const driverName = (session.user.name as string) || 'Driver';
        dispatches = [
            synthesizeDispatchlessRoute({
                driverId: driverBag.driverId,
                driverName,
                driverPhone: phone || null,
                bag: driverBag.bag,
            }),
        ];
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
