import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Package } from "lucide-react";

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
            {/* overflow-x-clip, not -hidden: `hidden` on one axis computes the other axis from
                `visible` to `auto`, making this column a silent vertical scroll container (a
                second scrollbar the moment any descendant overflows). `clip` leaves overflow-y
                `visible` and still contains horizontal overflow. */}
            <div className="flex-1 flex flex-col min-h-screen overflow-x-clip relative z-10 w-full min-w-0">
                {/* The mobile half of this bar used to be empty — both its title and
                    the welcome line were `hidden md:block`, leaving 64px of blank
                    chrome above every phone screen. It now carries the brand mark,
                    which is the only orientation cue left once the sidebar is gone. */}
                <header className="min-h-14 md:min-h-16 bg-white/50 dark:bg-neo-bg/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20 transition-colors pt-safe">
                    <div className="flex items-center gap-2.5">
                        <div className="lg:hidden w-8 h-8 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-accent-blue" />
                        </div>
                        <h2 className="text-base md:text-lg font-semibold text-slate-900 dark:text-white lg:hidden">VendingPro</h2>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white hidden lg:block">System Overview</h2>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                            <span>Welcome, {session?.user?.name || "Administrator"}</span>
                        </div>
                        <ThemeToggle />
                    </div>
                </header>
                {/* pb-nav clears the fixed bottom tab bar + home indicator; from lg up
                    the bar is gone and the padding goes back to the normal rhythm. */}
                <main className="flex-1 p-4 md:p-8 pb-nav lg:pb-8">
                    <div className="max-w-6xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>

            <MobileNav variant="admin" notifications={notifications} user={session?.user} />
        </div>
    );
}
