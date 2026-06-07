export const dynamic = "force-dynamic";

import { Activity } from "lucide-react";
import { getSystemHealth } from "@/actions/super-insights";
import SystemHealthPanel from "@/components/super/SystemHealthPanel";

export default async function SuperSystemPage() {
    const health = await getSystemHealth();

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                    <Activity className="w-7 h-7 text-accent-blue" /> System Health
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Live infrastructure status — database, realtime pipeline, environment config, and data volume.
                </p>
            </div>

            <SystemHealthPanel health={health} variant="full" />
        </div>
    );
}
