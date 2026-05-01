import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    const [disputedAssignmentsCount, pendingReturnsCount] = await Promise.all([
        prisma.stockAssignment.count({ where: { status: "DISPUTED" } }),
        prisma.returnVerification.count({ where: { status: "PENDING" } })
    ]);

    const notifications = {
        driverStock: disputedAssignmentsCount,
        returns: pendingReturnsCount
    };

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-neo-bg text-slate-900 dark:text-white transition-colors duration-300">
            <Sidebar user={session?.user} notifications={notifications} />
            <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden relative z-10 w-full min-w-0">
                <header className="h-16 bg-white/50 dark:bg-neo-bg/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-8 sticky top-0 z-20 transition-colors">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white hidden md:block">System Overview</h2>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                            <span>Welcome, {session?.user?.name || "Administrator"}</span>
                        </div>
                        <ThemeToggle />
                    </div>
                </header>
                <main className="flex-1 p-4 md:p-8">
                    <div className="max-w-6xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
