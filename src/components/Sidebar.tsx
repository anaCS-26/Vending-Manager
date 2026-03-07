"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Truck, Package, Activity, LogOut, AlertTriangle, RefreshCw, History, Settings, CreditCard, FileWarning, PieChart, Store, ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { AdminSettingsModal } from "@/components/AdminSettingsModal";
import { signOut } from "next-auth/react";

const mainNav = [
    { name: 'Overview', href: '/admin', icon: LayoutDashboard },
    { name: 'Dispatches', href: '/admin/dispatches', icon: Truck },
    // { name: 'Refunds', href: '/admin/refunds', icon: CreditCard }, // Archived for now
    { name: 'Financials', href: '/admin/financials', icon: PieChart },
    { name: 'Analytics', href: '/admin/analytics', icon: Activity },
];

const inventoryNav = [
    { name: 'Warehouse Stock', href: '/admin/warehouse', icon: Package },
    { name: 'Machine Stock', href: '/admin/machine-stock', icon: Activity },
    { name: 'Returns Verification', href: '/admin/returns', icon: AlertTriangle },
    { name: 'Manage Orders', href: '/admin/orders', icon: Store },
];

const adminNav = [
    { name: 'Operations History', href: '/admin/history', icon: History },
    { name: 'Manage System', href: '/admin/manage', icon: Settings },
];


export function Sidebar({ user }: { user?: any }) {
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <div className="w-72 bg-slate-50 dark:bg-neo-bg border-r border-slate-200 dark:border-white/5 flex flex-col relative z-20 transition-colors">
            <div className="p-8 pb-6 border-b border-slate-200 dark:border-white/5 relative overflow-hidden transition-colors">
                <Link href="/admin" className="flex items-center gap-3 relative z-10 hover:scale-105 transition-transform cursor-pointer group">
                    <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center border border-accent-blue/20 group-hover:bg-accent-blue/20 transition-colors">
                        <Package className="w-5 h-5 text-accent-blue" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">VendingPro</h1>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Enterprise Manager</p>
                    </div>
                </Link>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto custom-scrollbar">
                <div className="space-y-1">
                    <p className="px-4 text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase mb-3">Core Operations</p>
                    {mainNav.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative group overflow-hidden",
                                    isActive
                                        ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent-blue rounded-r-md"></div>
                                )}
                                <item.icon className={cn("w-4 h-4 relative z-10 transition-colors", isActive ? "text-accent-blue" : "group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300")} />
                                <span className="relative z-10">{item.name}</span>
                            </Link>
                        );
                    })}
                </div>

                <div className="space-y-1">
                    <p className="px-4 text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase mb-3">Inventory Management</p>
                    {inventoryNav.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative group overflow-hidden",
                                    isActive
                                        ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent-purple rounded-r-md"></div>
                                )}
                                <item.icon className={cn("w-4 h-4 relative z-10 transition-colors", isActive ? "text-accent-purple" : "group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300")} />
                                <span className="relative z-10">{item.name}</span>
                            </Link>
                        );
                    })}
                </div>

                <div className="space-y-1">
                    <p className="px-4 text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase mb-3">System Admin</p>
                    {adminNav.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative group overflow-hidden",
                                    isActive
                                        ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent-pink rounded-r-md"></div>
                                )}
                                <item.icon className={cn("w-4 h-4 relative z-10 transition-colors", isActive ? "text-accent-pink" : "group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300")} />
                                <span className="relative z-10">{item.name}</span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            <div className="p-6 border-t border-slate-200 dark:border-white/5 transition-colors">
                {user && (
                    <button onClick={() => setIsSettingsOpen(true)} className="p-2 w-full text-left rounded-xl mb-4 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center gap-3 transition-colors hover:bg-slate-200 dark:hover:bg-white/10 group cursor-pointer block">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex flex-shrink-0 items-center justify-center group-hover:bg-accent-blue/10 group-hover:text-accent-blue transition-colors">
                            <span className="text-slate-900 group-hover:text-accent-blue dark:text-white font-medium text-sm">
                                {user.name ? user.name.charAt(0).toUpperCase() : "A"}
                            </span>
                        </div>
                        <div className="flex-1 text-left hidden md:block">
                            <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1">{user.name || "Administrator"}</p>
                            <p className="text-xs text-slate-500 hover:text-accent-blue line-clamp-1">Edit Profile</p>
                        </div>
                    </button>
                )}

                <Link
                    href="/driver"
                    className="flex items-center gap-3 px-4 py-3 w-full text-accent-blue hover:text-slate-900 dark:text-white hover:bg-accent-blue/20 bg-accent-blue/10 border border-accent-blue/30 rounded-xl transition-all text-sm font-bold group mb-2"
                >
                    <Truck className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    Enter Driver Portal
                </Link>

                <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-3 px-4 py-3 w-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-white/5 rounded-xl transition-all text-sm font-medium group">
                    <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Sign Out
                </button>
            </div>

            {user && (
                <AdminSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user} />
            )}
        </div>
    );
}
