import Link from "next/link";

/**
 * Glassmorphic KPI tile used across the admin dashboard and super console.
 * `color` is the value's text token (e.g. "text-accent-green"); `glowClass`
 * carries the hover border/glow so each card can theme its accent.
 *
 * Sizing is deliberately two-track. At the desktop size (`p-6`, 48px icon with
 * `mb-6`, `text-4xl`) a single tile stands ~200px tall, so a four-KPI row
 * stacked 1-up on a phone was ~800px of scrolling before the first piece of
 * real content. Below `sm` everything steps down one notch and the grid goes
 * 2-up, which puts all four above the fold on a 390px screen.
 */
export default function KpiCard({
    href,
    title,
    value,
    subtitle,
    icon,
    color,
    alert = false,
    glowClass,
}: {
    href: string;
    title: string;
    value: React.ReactNode;
    subtitle: string;
    icon: React.ReactNode;
    color: string;
    alert?: boolean;
    glowClass: string;
}) {
    return (
        <Link href={href} className="group block">
            <div
                className={`glass-panel border border-slate-200 dark:border-white/10 rounded-3xl sm:rounded-[2.5rem] p-4 sm:p-6 relative overflow-hidden transition-all duration-500 group-hover:-translate-y-2 ${glowClass}`}
            >
                <div className="absolute -top-4 -right-4 p-8 opacity-5 transition-all duration-500 group-hover:opacity-10 group-hover:scale-150 rotate-12">
                    {icon}
                </div>
                <div className="relative z-10">
                    <div
                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mb-3 sm:mb-6 transition-all duration-300 [&_svg]:w-5 [&_svg]:h-5 sm:[&_svg]:w-7 sm:[&_svg]:h-7 ${
                            alert ? "border-accent-pink/50 bg-accent-pink/10 shadow-[0_0_20px_rgba(236,72,153,0.2)]" : ""
                        }`}
                    >
                        {icon}
                    </div>
                    <h3 className="text-slate-500 dark:text-slate-400 font-mono text-[9px] sm:text-[10px] font-bold tracking-[0.15em] sm:tracking-[0.2em] uppercase mb-1 truncate">
                        {title}
                    </h3>
                    <div
                        className={`font-display text-2xl sm:text-4xl font-extrabold tracking-tight transition-colors duration-300 ${color}`}
                    >
                        {value}
                    </div>
                    <div
                        className={`flex items-center gap-1.5 text-[9px] sm:text-[10px] mt-2 sm:mt-4 font-mono font-bold ${
                            alert ? "text-accent-pink" : "text-slate-500 dark:text-slate-400"
                        }`}
                    >
                        <div
                            className={`w-1 h-1 rounded-full shrink-0 ${
                                alert ? "bg-accent-pink animate-pulse" : "bg-slate-700"
                            }`}
                        />
                        <span className="truncate">{subtitle}</span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
