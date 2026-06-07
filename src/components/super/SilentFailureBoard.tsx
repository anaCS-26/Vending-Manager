import Link from "next/link";
import { Info, TrendingDown, TrendingUp, Clock, PackageX, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SilentFailureAlert, SilentFailureKind } from "@/types";

/**
 * Silent-Failure Watch board (experimental AI Lab). Presentational +
 * server-rendered — anomaly cards ordered most-severe first by the action.
 */

const SEVERITY: Record<SilentFailureAlert["severity"], { token: string; ring: string }> = {
    critical: { token: "text-accent-pink", ring: "border-accent-pink/30 bg-accent-pink/5" },
    warning: { token: "text-accent-orange", ring: "border-accent-orange/30 bg-accent-orange/5" },
    info: { token: "text-accent-blue", ring: "border-accent-blue/20 bg-accent-blue/5" },
};

const KIND_ICON: Record<SilentFailureKind, typeof Info> = {
    demand_collapse: TrendingDown,
    demand_spike: TrendingUp,
    overdue_service: Clock,
    abnormal_shrinkage: PackageX,
};

export default function SilentFailureBoard({ alerts }: { alerts: SilentFailureAlert[] }) {
    if (alerts.length === 0) {
        return (
            <p className="text-sm text-accent-green font-medium py-8 text-center">
                No anomalies detected — every active machine is selling in line with its own history.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {alerts.map((a) => {
                const sev = SEVERITY[a.severity];
                const Icon = KIND_ICON[a.kind];
                return (
                    <div key={a.id} className={cn("rounded-2xl border p-4 flex items-start gap-3.5", sev.ring)}>
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", sev.ring)}>
                            <Icon className={cn("w-5 h-5", sev.token)} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3">
                                <p className="font-bold text-slate-900 dark:text-white truncate">{a.headline}</p>
                                <span className={cn("text-sm font-mono font-bold whitespace-nowrap", sev.token)}>{a.metric}</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{a.detail}</p>
                            <div className="flex items-center gap-3 mt-2">
                                <Link href={a.drillHref} className="inline-flex items-center gap-1 text-xs font-bold text-accent-blue hover:underline">
                                    Investigate <ArrowUpRight className="w-3.5 h-3.5" />
                                </Link>
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
                                    {a.confidence} confidence
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
