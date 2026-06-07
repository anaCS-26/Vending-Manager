import Link from "next/link";

/**
 * Glassmorphic KPI tile used across the admin dashboard and super console.
 * `color` is the value's text token (e.g. "text-accent-green"); `glowClass`
 * carries the hover border/glow so each card can theme its accent.
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
    value: string;
    subtitle: string;
    icon: React.ReactNode;
    color: string;
    alert?: boolean;
    glowClass: string;
}) {
    return (
        <Link href={href} className="group block">
            <div
                className={`glass-panel border border-slate-200 dark:border-white/10 rounded-[2.5rem] p-6 relative overflow-hidden transition-all duration-500 group-hover:-translate-y-2 ${glowClass}`}
            >
                <div className="absolute -top-4 -right-4 p-8 opacity-5 transition-all duration-500 group-hover:opacity-10 group-hover:scale-150 rotate-12">
                    {icon}
                </div>
                <div className="relative z-10">
                    <div
                        className={`w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mb-6 transition-all duration-300 ${
                            alert ? "border-accent-pink/50 bg-accent-pink/10 shadow-[0_0_20px_rgba(236,72,153,0.2)]" : ""
                        }`}
                    >
                        {icon}
                    </div>
                    <h3 className="text-slate-500 dark:text-slate-400 font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-1">
                        {title}
                    </h3>
                    <div className={`text-4xl font-black tracking-tighter transition-colors duration-300 ${color}`}>
                        {value}
                    </div>
                    <div
                        className={`flex items-center gap-1.5 text-[10px] mt-4 font-mono font-bold ${
                            alert ? "text-accent-pink" : "text-slate-500 dark:text-slate-400"
                        }`}
                    >
                        <div
                            className={`w-1 h-1 rounded-full ${
                                alert ? "bg-accent-pink animate-pulse" : "bg-slate-700"
                            }`}
                        />
                        {subtitle}
                    </div>
                </div>
            </div>
        </Link>
    );
}
