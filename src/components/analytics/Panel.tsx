import React from "react";

/**
 * Card chrome for the sections that are already tables or lists — the at-risk
 * queue and the driver scorecard. They get no chart/table toggle because there
 * is nothing to toggle: the values are already in text, which is the state the
 * toggle exists to reach. Everything that encodes a value as ink uses
 * `ChartCard` instead.
 */
export default function Panel({
    title,
    subtitle,
    icon,
    accent = "text-accent-blue",
    action,
    caveat,
    children,
    className = "",
}: {
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    accent?: string;
    action?: React.ReactNode;
    caveat?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section
            className={`glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden ${className}`}
        >
            <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 shrink-0 ${accent}`}>{icon}</div>
                    <div className="min-w-0">
                        <h3 className="font-display font-bold text-slate-900 dark:text-white text-base leading-tight">
                            {title}
                        </h3>
                        {subtitle && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{subtitle}</p>
                        )}
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </header>

            <div className="p-5 sm:p-6">
                {children}
                {caveat && (
                    <p className="mt-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{caveat}</p>
                )}
            </div>
        </section>
    );
}
