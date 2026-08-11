export const dynamic = 'force-dynamic';
import { getMachines } from "@/actions/inventory";
import { getDriverBag, getDriversWithBagAndPending } from "@/actions/driver-stock";
import { DriverRefillUI } from "@/components/DriverRefillUI";
import { AssignmentAckBanner } from "@/components/AssignmentAckBanner";
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

    const [machines, driverBag, allDrivers] = await Promise.all([
        getMachines(),
        role === 'driver' ? getDriverBag() : Promise.resolve({ driverId: null, bag: [], pendingAssignments: [] }),
        (role === 'admin' || role === 'super_admin') ? getDriversWithBagAndPending() : Promise.resolve([])
    ]);

    let dispatches: any[] = [];

    if (role === 'driver') {
        if (driverBag.driverId !== null) {
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
    } else {
        // Admins see a synthetic route for EVERY driver
        dispatches = allDrivers.map(d => synthesizeDispatchlessRoute({
            driverId: d.id,
            driverName: d.name,
            driverPhone: d.phone,
            bag: d.DriverStock,
        }));
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg sm:p-4 text-slate-900 dark:text-white">
            {/* No top padding below `sm`: the refill card is edge-to-edge there and
                supplies its own status-bar inset, so a gap here only exposed a
                strip of page background above the header. */}
            <div className="max-w-md mx-auto h-full">
                {role === 'driver' && driverBag.pendingAssignments.length > 0 && (
                    <AssignmentAckBanner pending={driverBag.pendingAssignments} />
                )}
                <DriverRefillUI machines={machines} activeDispatches={dispatches} userRole={role as 'admin' | 'super_admin' | 'driver'} />
            </div>
        </div>
    );
}
