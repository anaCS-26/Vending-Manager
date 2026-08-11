"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ShieldAlert, LogOut, ArrowLeft } from "lucide-react";
import { signOut } from "next-auth/react";
import { superNavSections, isNavItemActive, type NavItem } from "@/lib/nav-config";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
    const isActive = isNavItemActive(item, pathname);
    return (
        <Link
            href={item.href}
            aria-current={isActive ? "page" : undefined}
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

/**
 * Desktop only — `hidden lg:flex`. This was a hard `w-72` at every width, so on
 * a 390px phone it took 288px of the viewport and left the console itself in a
 * 100px gutter. `MobileNav` covers the small breakpoint.
 */
export function SuperSidebar() {
    const pathname = usePathname();

    return (
        <div className="hidden lg:flex w-72 bg-neo-surface backdrop-blur-xl border-r border-neo-border flex-col relative z-20">
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
                {superNavSections.map((section) => (
                    <div key={section.label} className="space-y-1">
                        <p className="px-4 text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-3">
                            {section.label}
                        </p>
                        {section.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
                    </div>
                ))}
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
