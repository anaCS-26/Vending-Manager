"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ShieldAlert, Users, LayoutDashboard, Eye, ScrollText, Activity, LogOut, ArrowLeft, FlaskConical } from "lucide-react";
import { signOut } from "next-auth/react";
import { ENABLE_AI_LAB } from "@/lib/feature-flags";

type NavItem = { name: string; href: string; icon: typeof LayoutDashboard; exact?: boolean };

const consoleNav: NavItem[] = [
    { name: 'Overview', href: '/super', icon: LayoutDashboard, exact: true },
    { name: 'Oversight', href: '/super/oversight', icon: Eye },
    { name: 'Audit Trail', href: '/super/audit', icon: ScrollText },
    { name: 'Integrity', href: '/super/integrity', icon: ShieldAlert },
    { name: 'System Health', href: '/super/system', icon: Activity },
    // Experimental — only when NEXT_PUBLIC_ENABLE_AI_LAB=true.
    ...(ENABLE_AI_LAB ? [{ name: 'AI Lab', href: '/super/lab', icon: FlaskConical }] : []),
];

const accessNav: NavItem[] = [
    { name: 'Admin Accounts', href: '/super/admins', icon: Users },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
    const isActive = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
    return (
        <Link
            href={item.href}
            className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative group",
                isActive
                    ? "text-accent-blue bg-accent-blue/10 border border-accent-blue/20"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent"
            )}
        >
            <item.icon className="w-[18px] h-[18px]" />
            <span>{item.name}</span>
        </Link>
    );
}

export function SuperSidebar() {
    const pathname = usePathname();

    return (
        <div className="w-72 bg-neo-surface backdrop-blur-xl border-r border-neo-border flex flex-col relative z-20">
            <div className="p-8 pb-6 border-b border-neo-border">
                <Link href="/super" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 bg-accent-blue/15 rounded-xl flex items-center justify-center border border-accent-blue/30 group-hover:bg-accent-blue/25 transition-colors">
                        <ShieldAlert className="w-5 h-5 text-accent-blue" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Super Control</h1>
                        <p className="text-xs font-medium text-accent-blue">Provider Console</p>
                    </div>
                </Link>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                    <p className="px-4 text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-3">Console</p>
                    {consoleNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
                </div>

                <div className="space-y-1">
                    <p className="px-4 text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-3">Access</p>
                    {accessNav.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
                </div>
            </nav>

            <div className="p-4 border-t border-neo-border space-y-2">
                <Link
                    href="/admin"
                    className="flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all group"
                >
                    <ArrowLeft className="w-[18px] h-[18px] group-hover:-translate-x-1 transition-transform" />
                    <span>Back to Admin</span>
                </Link>
                <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-accent-pink bg-slate-100 dark:bg-white/5 hover:bg-accent-pink/10 transition-all group"
                >
                    <LogOut className="w-[18px] h-[18px]" />
                    <span>Sign Out</span>
                </button>
            </div>
        </div>
    );
}
