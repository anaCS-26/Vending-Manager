export const dynamic = "force-dynamic";

import Link from "next/link";
import { FlaskConical, Radar, Activity, ArrowUpRight, Sparkles } from "lucide-react";
import { ENABLE_AI_LAB } from "@/lib/feature-flags";
import { getStockoutForecast, getSilentFailureAlerts } from "@/actions/ai-lab";
import StockoutRadar from "@/components/super/StockoutRadar";
import SilentFailureBoard from "@/components/super/SilentFailureBoard";

/**
 * Experimental AI Lab — super-admin only (proxy.ts + layout requireSuperAdmin).
 * Gated behind NEXT_PUBLIC_ENABLE_AI_LAB so it can be tested before rollout.
 * Everything here is read-only and advisory.
 */
export default async function AiLabPage() {
    if (!ENABLE_AI_LAB) return <DisabledNotice />;

    const [forecasts, alerts] = await Promise.all([getStockoutForecast(), getSilentFailureAlerts()]);

    const atRisk = forecasts.filter((f) => f.riskLevel !== "ok").length;
    const critical = alerts.filter((a) => a.severity === "critical").length;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">AI Lab</h1>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-accent-purple bg-accent-purple/10 border border-accent-purple/20 px-2 py-1 rounded-full">
                            Experimental
                        </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Demand forecasting &amp; anomaly detection over your refill history. Read-only and advisory — nothing here changes your data.
                    </p>
                </div>
            </div>

            {/* How to read these numbers */}
            <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-[1.5rem] p-4 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-accent-purple shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Estimates are reconstructed from <span className="font-semibold text-slate-700 dark:text-slate-300">units sold between refills</span> (not live machine sensors), and current stock is an{" "}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">estimate</span> — so treat the figures as guidance, not gospel. The{" "}
                    <span className="font-semibold">confidence</span> tag shows how much history backs each row; trust &ldquo;high&rdquo; more than &ldquo;low&rdquo;.
                </p>
            </div>

            {/* Stockout Radar */}
            <section className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2">
                        <Radar className="w-4 h-4 text-accent-blue" /> Stockout Radar
                        {atRisk > 0 && (
                            <span className="ml-1 text-[10px] font-mono font-bold text-accent-orange bg-accent-orange/10 px-2 py-0.5 rounded-full">
                                {atRisk} at risk
                            </span>
                        )}
                    </h3>
                    <Link href="/admin/manage" className="text-xs font-bold text-accent-blue hover:underline flex items-center gap-1">
                        Set quantities <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Machine-items forecast to run out before their next expected visit. &ldquo;Assign qty&rdquo; suggests how many units to load next time (current &rarr; recommended).
                </p>
                <StockoutRadar forecasts={forecasts} />
            </section>

            {/* Silent-Failure Watch */}
            <section className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2">
                        <Activity className="w-4 h-4 text-accent-pink" /> Silent-Failure Watch
                        {critical > 0 && (
                            <span className="ml-1 text-[10px] font-mono font-bold text-accent-pink bg-accent-pink/10 px-2 py-0.5 rounded-full">
                                {critical} critical
                            </span>
                        )}
                    </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Machines whose sales dropped, spiked, went overdue for service, or show unusual damage/expiry — each compared against its own baseline.
                </p>
                <SilentFailureBoard alerts={alerts} />
            </section>
        </div>
    );
}

function DisabledNotice() {
    return (
        <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-10 text-center max-w-xl mx-auto mt-10">
            <FlaskConical className="w-10 h-10 text-accent-purple mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">AI Lab is disabled</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Set{" "}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 font-mono text-xs">NEXT_PUBLIC_ENABLE_AI_LAB=true</code>{" "}
                in your environment, then restart the dev server and hard-refresh to enable these experimental features.
            </p>
        </div>
    );
}
