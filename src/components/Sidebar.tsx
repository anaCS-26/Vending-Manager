"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Truck, Package, Activity, LogOut, AlertTriangle, RefreshCw, History, Settings, FileWarning, PieChart, Store, ExternalLink, ChevronLeft, Backpack } from "lucide-react";
import { useState, useTransition, useEffect } from "react";
import { AdminSettingsModal } from "@/components/AdminSettingsModal";
import { signOut } from "next-auth/react";

// In dispatchless mode the "Dispatches" page is replaced by "Driver Stock".
// Both entries exist in code; only one is rendered based on the flag so the
// nav doesn't grow during the cutover window.
const mainNav = [
    { name: 'Overview', href: '/admin', icon: LayoutDashboard },
    { name: 'Driver Stock', href: '/admin/driver-stock', icon: Backpack },
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
    // null means "use CSS default responsive behavior"
    const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const [windowWidth, setWindowWidth] = useState(0);

    useEffect(() => {
        setIsMounted(true);
        setWindowWidth(window.innerWidth);
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const toggleCollapse = () => {
        if (userCollapsed === null) {
            setUserCollapsed(window.innerWidth < 1024 ? false : true);
        } else {
            setUserCollapsed(!userCollapsed);
        }
    };

    const isMobile = isMounted ? windowWidth < 1024 : false;
    const collapsed = userCollapsed !== null ? userCollapsed : (isMounted ? isMobile : false);
    
    const sidebarWidthClass = userCollapsed === true 
        ? "w-20" 
        : userCollapsed === false 
            ? "w-[280px]" 
            : "w-20 lg:w-[280px]"; // Default CSS behavior

    return (
        <div 
            suppressHydrationWarning 
            className={cn("bg-slate-50 dark:bg-neo-bg border-r border-slate-200 dark:border-white/5 flex flex-col sticky top-0 h-screen z-40 transition-all duration-300 shrink-0 group/sidebar", sidebarWidthClass, userCollapsed !== null ? (userCollapsed ? "is-collapsed" : "is-expanded") : "")}
        >
            <button
                suppressHydrationWarning
                onClick={toggleCollapse}
                className="absolute -right-3 top-10 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-full flex items-center justify-center text-slate-500 hover:text-accent-blue transition-colors z-50 shadow-sm"
            >
                {/* Use CSS to toggle the chevron direction based on sidebar width or state */}
                <ChevronLeft className={cn("w-3 h-3 transition-transform", (userCollapsed === true || (userCollapsed === null && !isMounted) || (userCollapsed === null && isMounted && window?.innerWidth < 1024)) ? "rotate-180" : "")} />
            </button>
            <div className={cn("p-8 pb-6 border-b border-slate-200 dark:border-white/5 relative overflow-hidden transition-colors flex items-center", collapsed ? "justify-center px-0" : "")}>
                <Link href="/admin" className={cn("flex items-center gap-3 relative z-10 hover:scale-105 transition-transform cursor-pointer group", collapsed ? "justify-center" : "")}>
                    <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center border border-accent-blue/20 group-hover:bg-accent-blue/20 transition-colors shrink-0">
                        <Package className="w-5 h-5 text-accent-blue" />
                    </div>
                    {!collapsed && (
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight truncate">VendingPro</h1>
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">Enterprise Manager</p>
                        </div>
                    )}
                </Link>
            </div>

            <nav className={cn("flex-1 py-6 space-y-8 overflow-y-auto custom-scrollbar", collapsed ? "px-2" : "px-4")}>
                <div className="space-y-1">
                    {!collapsed ? (
                        <p className="px-4 text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase mb-3 truncate">Core Operations</p>
                    ) : (
                        <div className="w-8 h-px bg-slate-200 dark:bg-white/10 mx-auto my-4" />
                    )}
                    {mainNav.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                title={item.name}
                                className={cn(
                                    "flex items-center rounded-xl text-sm font-medium transition-all relative group overflow-hidden",
                                    collapsed ? "justify-center py-3 w-12 mx-auto" : "gap-3 px-4 py-2.5",
                                    isActive
                                        ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent-blue rounded-r-md"></div>
                                )}
                                <item.icon className={cn("w-4 h-4 relative z-10 transition-colors shrink-0", isActive ? "text-accent-blue" : "group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300")} />
                                {!collapsed && <span className="relative z-10 truncate">{item.name}</span>}
                            </Link>
                        );
                    })}
                </div>

                <div className="space-y-1">
                    {!collapsed ? (
                        <p className="px-4 text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase mb-3 truncate">Inventory Management</p>
                    ) : (
                        <div className="w-8 h-px bg-slate-200 dark:bg-white/10 mx-auto my-4" />
                    )}
                    {inventoryNav.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                title={item.name}
                                className={cn(
                                    "flex items-center rounded-xl text-sm font-medium transition-all relative group overflow-hidden",
                                    collapsed ? "justify-center py-3 w-12 mx-auto" : "gap-3 px-4 py-2.5",
                                    isActive
                                        ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent-purple rounded-r-md"></div>
                                )}
                                <item.icon className={cn("w-4 h-4 relative z-10 transition-colors shrink-0", isActive ? "text-accent-purple" : "group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300")} />
                                {!collapsed && <span className="relative z-10 truncate">{item.name}</span>}
                            </Link>
                        );
                    })}
                </div>

                <div className="space-y-1">
                    {!collapsed ? (
                        <p className="px-4 text-[10px] font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase mb-3 truncate">System Admin</p>
                    ) : (
                        <div className="w-8 h-px bg-slate-200 dark:bg-white/10 mx-auto my-4" />
                    )}
                    {adminNav.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                title={item.name}
                                className={cn(
                                    "flex items-center rounded-xl text-sm font-medium transition-all relative group overflow-hidden",
                                    collapsed ? "justify-center py-3 w-12 mx-auto" : "gap-3 px-4 py-2.5",
                                    isActive
                                        ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                                )}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent-pink rounded-r-md"></div>
                                )}
                                <item.icon className={cn("w-4 h-4 relative z-10 transition-colors shrink-0", isActive ? "text-accent-pink" : "group-hover:text-slate-500 dark:text-slate-400 dark:text-slate-300")} />
                                {!collapsed && <span className="relative z-10 truncate">{item.name}</span>}
                            </Link>
                        );
                    })}
                </div>
            </nav>

            <div className={cn("border-t border-slate-200 dark:border-white/5 transition-colors flex flex-col items-center", collapsed ? "p-4 space-y-4" : "p-6")}>
                {user && (
                    <button onClick={() => setIsSettingsOpen(true)} title="Edit Profile" className={cn("text-left rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center transition-colors hover:bg-slate-200 dark:hover:bg-white/10 group cursor-pointer", collapsed ? "p-1 justify-center w-12 h-12" : "p-2 w-full gap-3 mb-4")}>
                        <div className={cn("rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex flex-shrink-0 items-center justify-center group-hover:bg-accent-blue/10 group-hover:text-accent-blue transition-colors", collapsed ? "w-8 h-8" : "w-10 h-10")}>
                            <span className="text-slate-900 group-hover:text-accent-blue dark:text-white font-medium text-sm">
                                {user.name ? user.name.charAt(0).toUpperCase() : "A"}
                            </span>
                        </div>
                        {!collapsed && (
                            <div className="flex-1 text-left overflow-hidden">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user.name || "Administrator"}</p>
                                <p className="text-xs text-slate-500 hover:text-accent-blue truncate">Edit Profile</p>
                            </div>
                        )}
                    </button>
                )}

                <Link
                    href="/driver"
                    title="Enter Driver Portal"
                    className={cn("flex items-center text-accent-blue hover:text-slate-900 dark:text-white hover:bg-accent-blue/20 bg-accent-blue/10 border border-accent-blue/30 rounded-xl transition-all font-bold group", collapsed ? "justify-center w-12 h-12" : "px-4 py-3 w-full gap-3 text-sm mb-2")}
                >
                    <Truck className="w-4 h-4 group-hover:scale-110 transition-transform shrink-0" />
                    {!collapsed && <span className="truncate">Enter Driver Portal</span>}
                </Link>

                <button 
                    onClick={() => signOut({ callbackUrl: '/login' })} 
                    title="Sign Out"
                    className={cn("flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:bg-white/5 rounded-xl transition-all font-medium group", collapsed ? "justify-center w-12 h-12" : "px-4 py-3 w-full gap-3 text-sm")}
                >
                    <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform shrink-0" />
                    {!collapsed && <span className="truncate">Sign Out</span>}
                </button>
            </div>

            {user && (
                <AdminSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user} />
            )}
        </div>
    );
}
