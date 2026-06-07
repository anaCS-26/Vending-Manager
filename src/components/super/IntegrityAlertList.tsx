"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ArrowUpRight, CheckCircle2, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntegrityCategory, IntegritySeverity } from "@/actions/super-insights";

const SEVERITY: Record<IntegritySeverity, { token: string; ring: string; icon: typeof AlertTriangle; label: string }> = {
    critical: { token: "text-accent-pink", ring: "border-accent-pink/30 bg-accent-pink/5", icon: ShieldAlert, label: "Critical" },
    warning: { token: "text-accent-orange", ring: "border-accent-orange/30 bg-accent-orange/5", icon: AlertTriangle, label: "Warning" },
    info: { token: "text-accent-blue", ring: "border-accent-blue/20 bg-accent-blue/5", icon: Info, label: "Info" },
};

export default function IntegrityAlertList({ categories }: { categories: IntegrityCategory[] }) {
    // Open the first non-empty category by default.
    const firstActive = categories.find((c) => c.count > 0)?.key ?? null;
    const [open, setOpen] = useState<string | null>(firstActive);

    return (
        <div className="space-y-4">
            {categories.map((cat) => {
                const sev = SEVERITY[cat.severity];
                const clear = cat.count === 0;
                const isOpen = open === cat.key && !clear;
                const Icon = clear ? CheckCircle2 : sev.icon;

                return (
                    <div
                        key={cat.key}
                        className={cn(
                            "glass-panel rounded-[1.75rem] overflow-hidden border transition-all",
                            clear ? "border-slate-200 dark:border-white/5" : sev.ring,
                        )}
                    >
                        <button
                            type="button"
                            onClick={() => !clear && setOpen(isOpen ? null : cat.key)}
                            className="w-full flex items-center gap-4 p-5 text-left"
                            aria-expanded={isOpen}
                        >
                            <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border", clear ? "border-accent-green/30 bg-accent-green/10" : sev.ring)}>
                                <Icon className={cn("w-5 h-5", clear ? "text-accent-green" : sev.token)} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-slate-900 dark:text-white">{cat.label}</h3>
                                    {!clear && (
                                        <span className={cn("text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", sev.ring, sev.token)}>
                                            {sev.label}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{cat.description}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className={cn("text-2xl font-black tabular-nums", clear ? "text-accent-green" : sev.token)}>{cat.count}</span>
                                {!clear && (isOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />)}
                            </div>
                        </button>

                        {isOpen && (
                            <div className="px-5 pb-5 space-y-2 border-t border-slate-200 dark:border-white/5 pt-4">
                                {cat.rows.map((row) => (
                                    <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03]">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{row.title}</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{row.detail}</p>
                                        </div>
                                        <span className={cn("text-xs font-mono font-bold whitespace-nowrap", sev.token)}>{row.metric}</span>
                                    </div>
                                ))}
                                {cat.count > cat.rows.length && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 px-4 pt-1">
                                        +{cat.count - cat.rows.length} more…
                                    </p>
                                )}
                                <Link
                                    href={cat.drillHref}
                                    className="inline-flex items-center gap-1.5 mt-2 text-sm font-bold text-accent-blue hover:underline"
                                >
                                    {cat.drillLabel}
                                    <ArrowUpRight className="w-4 h-4" />
                                </Link>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
