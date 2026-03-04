export const revalidate = 30;
import { getClosedDispatches } from "@/actions/inventory";
import prisma from "@/lib/prisma";
import UnifiedHistoryManager from "@/components/UnifiedHistoryManager";

export default async function HistoryPage() {
    // 1. Fetch data in parallel
    const [dispatches, logs] = await Promise.all([
        getClosedDispatches(),
        prisma.refillLog.findMany({
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
        })
    ]);

    return (
        <div className="pb-20">
            <UnifiedHistoryManager
                dispatches={dispatches}
                logs={logs}
            />
        </div>
    );
}

