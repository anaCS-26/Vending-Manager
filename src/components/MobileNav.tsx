"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { signOut } from "next-auth/react";
import { ArrowLeft, LogOut, MoreHorizontal, Package, ShieldAlert, Truck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    adminNavSections,
    adminPrimaryNav,
    isNavItemActive,
    superNavSections,
    superPrimaryNav,
    type NavItem,
    type NavSection,
} from "@/lib/nav-config";
import { AdminSettingsModal } from "@/components/AdminSettingsModal";
import { ThemeToggle } from "@/components/ThemeToggle";

type Notifications = { driverStock: number; returns: number };

/**
 * The nav model is looked up here rather than passed in, because both callers
 * are Server Components and every item carries a lucide icon *component* —
 * functions don't cross the RSC boundary. Only plain data (`notifications`,
 * `user`) is passed as props.
 */
const NAV_BY_VARIANT = {
    admin: { sections: adminNavSections, primary: adminPrimaryNav },
    super: { sections: superNavSections, primary: superPrimaryNav },
} satisfies Record<string, { sections: NavSection[]; primary: NavItem[] }>;

type MobileNavProps = {
    variant: keyof typeof NAV_BY_VARIANT;
    notifications?: Notifications;
    user?: any;
};

function badgeCount(item: NavItem, notifications?: Notifications): number {
    if (!item.badge || !notifications) return 0;
    return notifications[item.badge] ?? 0;
}

/**
 * Phone navigation for the admin and super consoles.
 *
 * The desktop `Sidebar`/`SuperSidebar` used to stay mounted on mobile as a 80px
 * icon rail (and 288px for super, unreduced) — a fifth of a 390px viewport spent
 * on unlabelled icons, permanently, on every page. Below `lg` those are hidden
 * and this takes over: four thumb-reachable tabs pinned to the bottom edge where
 * a hand actually is, plus a More sheet holding the full nav and the account
 * actions that lived in the sidebar footer.
 *
 * The bar is `fixed`, so every page under these layouts pays for it with
 * `pb-nav` (bar height + home indicator) on its main scroll region.
 */
export function MobileNav({ variant, notifications, user }: MobileNavProps) {
    const { sections, primary } = NAV_BY_VARIANT[variant];
    const pathname = usePathname();
    const [sheetOpen, setSheetOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Any navigation closes the sheet — Next keeps this component mounted across
    // route changes, so without this the sheet would survive the tap that used it.
    useEffect(() => {
        setSheetOpen(false);
    }, [pathname]);

    // True when the current route isn't one of the four tabs, so "More" can show
    // itself as the active tab rather than leaving the bar with no active state.
    const onSecondaryRoute = !primary.some((item) => isNavItemActive(item, pathname));

    const overflowBadges = sections
        .flatMap((s) => s.items)
        .filter((item) => !primary.some((p) => p.href === item.href))
        .reduce((sum, item) => sum + badgeCount(item, notifications), 0);

    return (
        <>
            <nav
                className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 dark:border-white/10 bg-white/90 dark:bg-neo-bg/90 backdrop-blur-xl pb-safe"
                aria-label="Primary"
            >
                <div className="grid grid-cols-5">
                    {primary.map((item) => {
                        const isActive = isNavItemActive(item, pathname);
                        const count = badgeCount(item, notifications);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? "page" : undefined}
                                className={cn(
                                    "relative flex flex-col items-center justify-center gap-1 h-16 px-1 transition-colors",
                                    isActive
                                        ? "text-accent-blue"
                                        : "text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-white/5",
                                )}
                            >
                                {isActive && (
                                    <span className="absolute top-0 h-0.5 w-10 rounded-b-full bg-accent-blue" />
                                )}
                                <span className="relative">
                                    <item.icon className="w-5 h-5" />
                                    {count > 0 && (
                                        <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-accent-pink text-white text-[9px] font-bold flex items-center justify-center leading-none">
                                            {count > 9 ? "9+" : count}
                                        </span>
                                    )}
                                </span>
                                <span className="text-[10px] font-semibold tracking-tight truncate max-w-full">
                                    {item.shortName ?? item.name}
                                </span>
                            </Link>
                        );
                    })}

                    <button
                        type="button"
                        onClick={() => setSheetOpen(true)}
                        aria-expanded={sheetOpen}
                        aria-haspopup="dialog"
                        className={cn(
                            "relative flex flex-col items-center justify-center gap-1 h-16 px-1 transition-colors",
                            onSecondaryRoute
                                ? "text-accent-blue"
                                : "text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-white/5",
                        )}
                    >
                        {onSecondaryRoute && <span className="absolute top-0 h-0.5 w-10 rounded-b-full bg-accent-blue" />}
                        <span className="relative">
                            <MoreHorizontal className="w-5 h-5" />
                            {overflowBadges > 0 && (
                                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-accent-pink text-white text-[9px] font-bold flex items-center justify-center leading-none">
                                    {overflowBadges > 9 ? "9+" : overflowBadges}
                                </span>
                            )}
                        </span>
                        <span className="text-[10px] font-semibold tracking-tight">More</span>
                    </button>
                </div>
            </nav>

            <MoreSheet
                isOpen={sheetOpen}
                onClose={() => setSheetOpen(false)}
                variant={variant}
                sections={sections}
                notifications={notifications}
                user={user}
                onEditProfile={() => {
                    setSheetOpen(false);
                    setSettingsOpen(true);
                }}
            />

            {user && variant === "admin" && (
                <AdminSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} />
            )}
        </>
    );
}

function MoreSheet({
    isOpen,
    onClose,
    variant,
    sections,
    notifications,
    user,
    onEditProfile,
}: {
    isOpen: boolean;
    onClose: () => void;
    variant: "admin" | "super";
    sections: NavSection[];
    notifications?: Notifications;
    user?: any;
    onEditProfile: () => void;
}) {
    const pathname = usePathname();

    // Lock the page behind the sheet without pulling in the full modal hook —
    // this panel holds no typed data, so Escape-to-close and a focus trap are
    // the only behaviours it needs, and both come from the backdrop + links.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener("keydown", onKey);
        };
    }, [isOpen, onClose]);

    const isAdmin = variant === "admin";

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
                    <motion.button
                        type="button"
                        aria-label="Close menu"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Navigation menu"
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 32, stiffness: 320 }}
                        className="relative max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-slate-200 dark:border-white/10 bg-white dark:bg-neo-bg shadow-2xl pb-safe"
                    >
                        {/* Grab handle — the conventional "drag/tap to dismiss" signal. */}
                        <div className="sticky top-0 z-10 bg-white/95 dark:bg-neo-bg/95 backdrop-blur-xl pt-3 pb-3 px-5 border-b border-slate-100 dark:border-white/5">
                            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                        className={cn(
                                            "w-9 h-9 rounded-xl flex items-center justify-center border shrink-0",
                                            isAdmin
                                                ? "bg-accent-blue/10 border-accent-blue/20 text-accent-blue"
                                                : "bg-accent-pink/10 border-accent-pink/20 text-accent-pink",
                                        )}
                                    >
                                        {isAdmin ? <Package className="w-[18px] h-[18px]" /> : <ShieldAlert className="w-[18px] h-[18px]" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                            {isAdmin ? "VendingPro" : "Super Control"}
                                        </p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                            {isAdmin ? user?.name || "Administrator" : "Provider Console"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <ThemeToggle />
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        aria-label="Close menu"
                                        className="w-10 h-10 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-white/5"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="px-4 py-4 space-y-5">
                            {sections.map((section) => (
                                <div key={section.label}>
                                    <p className="px-2 mb-2 font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">
                                        {section.label}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {section.items.map((item) => {
                                            const isActive = isNavItemActive(item, pathname);
                                            const count = badgeCount(item, notifications);
                                            return (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    onClick={onClose}
                                                    aria-current={isActive ? "page" : undefined}
                                                    className={cn(
                                                        "flex items-center gap-2.5 rounded-2xl border px-3 min-h-[52px] text-sm font-semibold transition-colors",
                                                        isActive
                                                            ? "border-accent-blue/30 bg-accent-blue/10 text-accent-blue"
                                                            : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-white/10",
                                                    )}
                                                >
                                                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                                                    <span className="truncate leading-tight">{item.shortName ?? item.name}</span>
                                                    {count > 0 && (
                                                        <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-accent-pink text-white text-[10px] font-bold flex items-center justify-center leading-none shrink-0">
                                                            {count}
                                                        </span>
                                                    )}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            <div className="pt-1 space-y-2">
                                {isAdmin ? (
                                    <>
                                        {user && (
                                            <button
                                                type="button"
                                                onClick={onEditProfile}
                                                className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-4 min-h-[52px] text-sm font-semibold text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-white/10"
                                            >
                                                <span className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-900 dark:text-white text-sm font-bold shrink-0">
                                                    {user.name ? user.name.charAt(0).toUpperCase() : "A"}
                                                </span>
                                                Edit profile
                                            </button>
                                        )}
                                        <Link
                                            href="/driver"
                                            onClick={onClose}
                                            className="w-full flex items-center gap-3 rounded-2xl border border-accent-blue/30 bg-accent-blue/10 px-4 min-h-[52px] text-sm font-bold text-accent-blue active:bg-accent-blue/20"
                                        >
                                            <Truck className="w-[18px] h-[18px] shrink-0" />
                                            Enter Driver Portal
                                        </Link>
                                    </>
                                ) : (
                                    <Link
                                        href="/admin"
                                        onClick={onClose}
                                        className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-4 min-h-[52px] text-sm font-semibold text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-white/10"
                                    >
                                        <ArrowLeft className="w-[18px] h-[18px] shrink-0" />
                                        Back to Admin
                                    </Link>
                                )}

                                <button
                                    type="button"
                                    onClick={() => signOut({ callbackUrl: "/login" })}
                                    className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-white/10 px-4 min-h-[52px] text-sm font-bold text-slate-600 dark:text-slate-300 active:bg-accent-pink/10 active:text-accent-pink"
                                >
                                    <LogOut className="w-[18px] h-[18px] shrink-0" />
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
