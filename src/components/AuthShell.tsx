import { MapPin } from "lucide-react"

/**
 * Chrome shared by the unauthenticated pages (/login, /forgot-password,
 * /reset-password) so the three read as one surface. RSC — no client state.
 */
export default function AuthShell({
    title,
    subtitle,
    children,
}: {
    title: string
    subtitle?: string
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent-blue/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-md mx-auto relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center p-4 rounded-3xl bg-accent-green/10 border border-accent-green/20 mb-6 shadow-[0_0_30px_rgba(52,211,153,0.15)] glow-effect">
                        <MapPin className="w-10 h-10 text-accent-green" />
                    </div>
                    {/* Bricolage caps at 800 — font-black (900) would synthesise a fake bold. */}
                    <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tighter mb-2">{title}</h1>
                    {subtitle && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">{subtitle}</p>
                    )}
                </div>

                <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden shadow-2xl bg-gradient-to-b from-white/5 to-transparent backdrop-blur-xl">
                    {children}
                </div>
            </div>
        </div>
    )
}
