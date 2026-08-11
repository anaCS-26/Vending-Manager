import { SuperSidebar } from "@/components/SuperSidebar";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { requireSuperAdmin } from "@/lib/auth-utils";
import { ShieldAlert } from "lucide-react";

export default async function SuperLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Defense-in-depth: src/proxy.ts already gates /super to super_admin at the edge.
    // This makes the whole /super subtree fail closed at the RSC layer too, covering
    // pages that do inline prisma reads (admins roster, audit name maps).
    await requireSuperAdmin();

    return (
        <div className="flex min-h-screen bg-neo-bg text-foreground">
            <SuperSidebar />
            <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden relative z-10">
                <header className="min-h-14 md:min-h-16 bg-white/50 dark:bg-neo-bg/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20 pt-safe">
                    <div className="flex items-center gap-2.5">
                        <div className="lg:hidden w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center shrink-0">
                            <ShieldAlert className="w-4 h-4 text-accent-blue" />
                        </div>
                        <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-white">Provider Console</h2>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-2 text-sm text-accent-blue font-medium">
                            <span className="w-2 h-2 rounded-full bg-accent-blue shadow-[0_0_10px_rgba(59,130,246,0.6)] animate-pulse"></span>
                            <span>Super Admin Mode</span>
                        </div>
                        <ThemeToggle />
                    </div>
                </header>
                <main className="flex-1 p-4 md:p-8 pb-nav lg:pb-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>

            <MobileNav variant="super" />
        </div>
    );
}
