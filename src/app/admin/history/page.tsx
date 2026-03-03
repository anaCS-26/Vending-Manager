export const dynamic = 'force-dynamic';
import { getClosedDispatches } from "@/actions/inventory";
import prisma from "@/lib/prisma";
import UnifiedHistoryManager from "@/components/UnifiedHistoryManager";

export default async function HistoryPage() {
    // 1. Fetch Closed Dispatches for "By Route" view
    const dispatches = await getClosedDispatches();

    // 2. Fetch Granular Refill Logs for "By Event" view
    const logs = await prisma.refillLog.findMany({
        orderBy: { refilled_at: 'desc' },
        include: {
            machine: true,
            item: true,
            dispatch: {
                include: {
                    driver: true,
                    warehouse: true,
                    ReturnVerifications: true
                }
            }
        }
    });

    return (
        <div className="pb-20">
            <UnifiedHistoryManager
                dispatches={dispatches}
                logs={logs}
            />
        </div>
    );
}

