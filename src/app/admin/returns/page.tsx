export const revalidate = 30;
import { getPendingReturns, getProcessedReturns } from "@/actions/returns";
import { ReturnsManager } from "@/components/ReturnsManager";

export default async function ReturnsVerificationPage() {
    const [pending, history] = await Promise.all([
        getPendingReturns(),
        getProcessedReturns()
    ]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Returns Verification</h1>
                <p className="text-slate-600 dark:text-slate-400 mt-1">Review and approve driver reports for damaged or expired stock.</p>
            </div>

            <ReturnsManager pending={pending} history={history} />
        </div>
    );
}
