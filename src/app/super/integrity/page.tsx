export const dynamic = "force-dynamic";

import { ShieldAlert } from "lucide-react";
import { getIntegrityAlerts } from "@/actions/super-insights";
import IntegrityAlertList from "@/components/super/IntegrityAlertList";

export default async function SuperIntegrityPage() {
    const categories = await getIntegrityAlerts();

    const critical = categories.filter((c) => c.severity === "critical").reduce((s, c) => s + c.count, 0);
    const warnings = categories.filter((c) => c.severity === "warning").reduce((s, c) => s + c.count, 0);
    const open = categories.reduce((s, c) => s + c.count, 0);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <ShieldAlert className="w-7 h-7 text-accent-pink" /> Integrity
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Data and money anomalies that distort your books — each links to where it gets fixed.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Stat label="Critical" value={critical} token="text-accent-pink" />
                    <Stat label="Warnings" value={warnings} token="text-accent-orange" />
                    <Stat label="Total open" value={open} token="text-slate-900 dark:text-white" />
                </div>
            </div>

            <IntegrityAlertList categories={categories} />
        </div>
    );
}

function Stat({ label, value, token }: { label: string; value: number; token: string }) {
    return (
        <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-2xl px-5 py-3 text-center min-w-[90px]">
            <p className={`text-2xl font-black tabular-nums ${token}`}>{value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">{label}</p>
        </div>
    );
}
