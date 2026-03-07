import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auth } from "@/auth";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-neo-bg text-slate-900 dark:text-white transition-colors duration-300">
            <Sidebar user={session?.user} />
            <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
                <header className="h-16 bg-white/50 dark:bg-neo-bg/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-8 sticky top-0 z-20 transition-colors">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white hidden md:block">System Overview</h2>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <span className="w-2 h-2 rounded-full bg-accent-green"></span>
                            <span>All services operational</span>
                        </div>
                        <ThemeToggle />
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
