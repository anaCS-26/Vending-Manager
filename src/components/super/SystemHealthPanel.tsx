import { Database, Radio, Server, Activity, CheckCircle2, XCircle, HardDrive } from "lucide-react";
import { cn, formatRelativeAge, formatSaudiDate, formatSaudiTime } from "@/lib/utils";
import type { SystemHealth } from "@/actions/super-insights";

function StatusDot({ ok }: { ok: boolean }) {
    return (
        <span className={cn("w-2 h-2 rounded-full shrink-0", ok ? "bg-accent-green shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-accent-pink shadow-[0_0_8px_rgba(244,63,94,0.6)]")} />
    );
}

/** Real infrastructure status. `variant="compact"` renders the 3-pill Overview band. */
export default function SystemHealthPanel({ health, variant = "full" }: { health: SystemHealth; variant?: "full" | "compact" }) {
    const { db, realtime, env, lastActivity, rowCounts } = health;
    // Heartbeat is "warm" if bumped within the last hour.
    const heartbeatWarm = realtime.lastBumpAt != null && Date.now() - new Date(realtime.lastBumpAt).getTime() < 60 * 60 * 1000;

    if (variant === "compact") {
        return (
            <div className="space-y-2.5">
                <HealthRow icon={<Database className="w-4 h-4" />} label="Database" value={db.ok ? `${db.latencyMs} ms` : "Offline"} ok={db.ok} />
                <HealthRow icon={<Radio className="w-4 h-4" />} label="Realtime" value={realtime.configured ? formatRelativeAge(realtime.lastBumpAt) : "Missing"} ok={realtime.configured && heartbeatWarm} />
                <HealthRow icon={<Activity className="w-4 h-4" />} label="Last refill" value={formatRelativeAge(lastActivity.lastRefillAt)} ok={lastActivity.lastRefillAt != null} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Connectivity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass-panel rounded-[1.75rem] p-6 border border-slate-200 dark:border-white/5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2">
                            <Database className="w-4 h-4 text-accent-blue" /> Database
                        </h3>
                        <StatusDot ok={db.ok} />
                    </div>
                    <p className={cn("text-3xl font-black tracking-tight", db.ok ? "text-accent-green" : "text-accent-pink")}>
                        {db.ok ? `${db.latencyMs} ms` : "Offline"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{db.ok ? "Round-trip SELECT 1 latency" : db.error}</p>
                </div>

                <div className="glass-panel rounded-[1.75rem] p-6 border border-slate-200 dark:border-white/5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2">
                            <Radio className="w-4 h-4 text-accent-purple" /> Realtime Heartbeat
                        </h3>
                        <StatusDot ok={realtime.configured && heartbeatWarm} />
                    </div>
                    <p className={cn("text-3xl font-black tracking-tight", realtime.configured ? "text-slate-900 dark:text-white" : "text-accent-pink")}>
                        {realtime.configured ? formatRelativeAge(realtime.lastBumpAt) : "Not configured"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {realtime.configured ? `Version counter at ${realtime.version} — bumps on every mutation` : "SystemMeta row missing"}
                    </p>
                </div>
            </div>

            {/* Environment + last activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass-panel rounded-[1.75rem] p-6 border border-slate-200 dark:border-white/5">
                    <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-4">
                        <Server className="w-4 h-4 text-accent-orange" /> Environment Config
                    </h3>
                    <div className="space-y-2.5">
                        <EnvRow label="Supabase URL" ok={env.supabaseUrl} />
                        <EnvRow label="Supabase Anon Key" ok={env.supabaseAnonKey} />
                        <EnvRow label="Blob Storage Token" ok={env.blobToken} />
                    </div>
                </div>

                <div className="glass-panel rounded-[1.75rem] p-6 border border-slate-200 dark:border-white/5">
                    <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-4">
                        <Activity className="w-4 h-4 text-accent-green" /> Last Activity
                    </h3>
                    <div className="space-y-4">
                        <ActivityRow label="Last refill logged" date={lastActivity.lastRefillAt} />
                        <ActivityRow label="Last audit entry" date={lastActivity.lastAuditAt} />
                    </div>
                </div>
            </div>

            {/* Data volume */}
            <div className="glass-panel rounded-[1.75rem] p-6 border border-slate-200 dark:border-white/5">
                <h3 className="font-bold text-slate-500 dark:text-slate-400 tracking-widest uppercase text-xs flex items-center gap-2 mb-5">
                    <HardDrive className="w-4 h-4 text-accent-blue" /> Data Volume
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {rowCounts.map((r) => (
                        <div key={r.label} className="rounded-2xl bg-slate-50 dark:bg-white/[0.03] p-4">
                            <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{r.count.toLocaleString()}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{r.label}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function HealthRow({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
    return (
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] px-4 py-2.5 border border-slate-200 dark:border-white/5">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", ok ? "bg-accent-green/10 text-accent-green" : "bg-accent-pink/10 text-accent-pink")}>
                {icon}
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
            <span className="ml-auto text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">{value}</span>
        </div>
    );
}

function EnvRow({ label, ok }: { label: string; ok: boolean }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-300">{label}</span>
            {ok ? (
                <span className="flex items-center gap-1.5 text-accent-green font-medium"><CheckCircle2 className="w-4 h-4" /> Present</span>
            ) : (
                <span className="flex items-center gap-1.5 text-accent-pink font-medium"><XCircle className="w-4 h-4" /> Missing</span>
            )}
        </div>
    );
}

function ActivityRow({ label, date }: { label: string; date: Date | null }) {
    return (
        <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{formatRelativeAge(date)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
                {label}
                {date ? ` · ${formatSaudiDate(date)} ${formatSaudiTime(date, { hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
        </div>
    );
}
