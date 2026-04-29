import { SuperSidebar } from "@/components/SuperSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";

export default function SuperLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-slate-950 text-white transition-colors duration-300">
            <RealtimeRefresher />
            <SuperSidebar />
            <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
                <header className="h-16 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-8 sticky top-0 z-20 transition-colors">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-white hidden md:block">Master Dashboard</h2>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-2 text-sm text-brand-400">
                            <span className="w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]"></span>
                            <span>Super Admin Mode</span>
                        </div>
                    </div>
                </header>
                <main className="flex-1 p-8">
                    <div className="max-w-6xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
