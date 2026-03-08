"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ShieldAlert, Users, LayoutDashboard, CloudCog, Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

const mainNav = [
    { name: 'Provider Health', href: '/super', icon: LayoutDashboard },
    { name: 'Tenant Admins', href: '/super/admins', icon: Users },
];

const infrastructureNav = [
    { name: 'Database Status', href: '/super/database', icon: CloudCog },
    { name: 'Global Settings', href: '/super/settings', icon: Settings },
];

export function SuperSidebar() {
    const pathname = usePathname();

    return (
        <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col relative z-20 transition-colors">
            <div className="p-8 pb-6 border-b border-slate-800 relative overflow-hidden transition-colors">
                <Link href="/admin" className="flex items-center gap-3 relative z-10 hover:scale-105 transition-transform cursor-pointer group">
                    <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center border border-brand-500/40 group-hover:bg-brand-500/30 transition-colors">
                        <ShieldAlert className="w-5 h-5 text-brand-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Super Control</h1>
                        <p className="text-xs font-medium text-brand-400">Master Level</p>
                    </div>
                </Link>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                    <p className="px-4 text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">System Core</p>
                    {mainNav.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative group overflow-hidden",
                                    isActive
                                        ? "text-brand-400 bg-brand-500/10 border border-brand-500/20"
                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <item.icon className="w-[18px] h-[18px] relative z-10" />
                                <span className="relative z-10">{item.name}</span>
                            </Link>
                        );
                    })}
                </div>

                <div className="space-y-1">
                    <p className="px-4 text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">Infrastructure</p>
                    {infrastructureNav.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative group overflow-hidden",
                                    isActive
                                        ? "text-brand-400 bg-brand-500/10 border border-brand-500/20"
                                        : "text-slate-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <item.icon className="w-[18px] h-[18px] relative z-10" />
                                <span className="relative z-10">{item.name}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            <div className="p-6 border-t border-slate-800 bg-slate-900 sticky bottom-0 z-10 mt-auto">
                <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-accent-pink/20 transition-all group"
                >
                    <LogOut className="w-[18px] h-[18px] group-hover:-translate-x-1 transition-transform" />
                    <span className="flex-1 text-left">Sign Out</span>
                </button>
            </div>
        </div>
    );
}
