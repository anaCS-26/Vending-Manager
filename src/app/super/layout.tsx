import { SuperSidebar } from "@/components/SuperSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SuperLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen bg-neo-bg text-foreground">
            <SuperSidebar />
            <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden relative z-10">
                <header className="h-16 bg-white/50 dark:bg-neo-bg/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-8 sticky top-0 z-20">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white hidden md:block">Provider Console</h2>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-2 text-sm text-accent-blue font-medium">
                            <span className="w-2 h-2 rounded-full bg-accent-blue shadow-[0_0_10px_rgba(59,130,246,0.6)] animate-pulse"></span>
                            <span>Super Admin Mode</span>
                        </div>
                        <ThemeToggle />
                    </div>
                </header>
                <main className="flex-1 p-4 md:p-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
