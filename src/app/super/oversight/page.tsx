export const dynamic = "force-dynamic";

import Link from "next/link";
import { Eye, BarChart3, Users, ArrowUpRight } from "lucide-react";
import { getOversightSummary } from "@/actions/super-insights";
import OversightCharts from "@/components/super/OversightCharts";
import SensitiveFeed from "@/components/super/SensitiveFeed";

export default async function SuperOversightPage() {
    const oversight = await getOversightSummary();
    const { windowDays, totalActions, actorLeaderboard, actionDistribution, sensitiveEvents } = oversight;
    const maxActor = Math.max(1, ...actorLeaderboard.map((a) => a.count));

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <Eye className="w-7 h-7 text-accent-purple" /> Oversight
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Who did what across the last {windowDays} days — {totalActions.toLocaleString()} logged actions.
                    </p>
                </div>
                <Link
                    href="/super/audit"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 transition-all whitespace-nowrap"
                >
                    Full Audit Trail <ArrowUpRight className="w-4 h-4" />
                </Link>
            </div>

            {/* Distribution + leaderboard */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl">
                    <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                        <BarChart3 className="w-4 h-4 text-accent-blue" /> Action Distribution
                    </h3>
                    <OversightCharts data={actionDistribution} />
                </div>

                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl">
                    <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                        <Users className="w-4 h-4 text-accent-green" /> Most Active Admins
                    </h3>
                    {actorLeaderboard.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">No activity in this window.</p>
                    ) : (
                        <ul className="space-y-3">
                            {actorLeaderboard.slice(0, 8).map((a, i) => (
                                <li key={`${a.actorId ?? "sys"}-${i}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-2">
                                            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 w-4">{i + 1}</span>
                                            {a.name}
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{a.role}</span>
                                        </span>
                                        <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">{a.count}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                                        <div className="h-full rounded-full bg-accent-green/70" style={{ width: `${(a.count / maxActor) * 100}%` }} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Sensitive actions feed */}
            <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-xl">
                <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-6">
                    <Eye className="w-4 h-4 text-accent-pink" /> Sensitive Actions
                    <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500 normal-case tracking-normal font-medium">
                        cost corrections · deletions · recounts · audits
                    </span>
                </h3>
                <SensitiveFeed events={sensitiveEvents} />
            </div>
        </div>
    );
}
