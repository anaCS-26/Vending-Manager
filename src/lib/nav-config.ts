import {
    Activity,
    AlertTriangle,
    Backpack,
    Eye,
    FlaskConical,
    History,
    LayoutDashboard,
    Package,
    PieChart,
    ScrollText,
    Settings,
    ShieldAlert,
    Store,
    Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ENABLE_AI_LAB } from "@/lib/feature-flags";

export type NavItem = {
    name: string;
    /** Short label for the bottom tab bar, where ~10 chars is the budget. */
    shortName?: string;
    href: string;
    icon: LucideIcon;
    /** Match the href exactly instead of as a prefix (section roots). */
    exact?: boolean;
    /** Which notification counter, if any, badges this entry. */
    badge?: "driverStock" | "returns";
    /** Token used for the active indicator and icon tint. */
    accent?: "blue" | "purple" | "pink";
};

export type NavSection = { label: string; items: NavItem[] };

/**
 * Single source of truth for both navigations. The desktop `Sidebar` renders
 * every section; the mobile bottom bar renders `adminPrimaryNav` and folds the
 * rest into the "More" sheet — so a route added here shows up in both without
 * the two drifting apart.
 */
export const adminNavSections: NavSection[] = [
    {
        label: "Core Operations",
        items: [
            { name: "Overview", href: "/admin", icon: LayoutDashboard, exact: true, accent: "blue" },
            { name: "Driver Stock", href: "/admin/driver-stock", icon: Backpack, badge: "driverStock", accent: "blue" },
            { name: "Financials", href: "/admin/financials", icon: PieChart, accent: "blue" },
            { name: "Analytics", href: "/admin/analytics", icon: Activity, accent: "blue" },
        ],
    },
    {
        label: "Inventory Management",
        items: [
            { name: "Warehouse Stock", shortName: "Warehouse", href: "/admin/warehouse", icon: Package, accent: "purple" },
            { name: "Machine Stock", shortName: "Machines", href: "/admin/machine-stock", icon: Activity, accent: "purple" },
            { name: "Returns Verification", shortName: "Returns", href: "/admin/returns", icon: AlertTriangle, badge: "returns", accent: "purple" },
            { name: "Manage Orders", shortName: "Orders", href: "/admin/orders", icon: Store, accent: "purple" },
        ],
    },
    {
        label: "System Admin",
        items: [
            { name: "Operations History", shortName: "History", href: "/admin/history", icon: History, accent: "pink" },
            { name: "Manage System", shortName: "Manage", href: "/admin/manage", icon: Settings, accent: "pink" },
        ],
    },
];

/**
 * The four destinations that earn a permanent thumb-reachable slot. Chosen by
 * what an admin opens from a phone: the dashboard, the two queues that carry
 * unread badges, and the stock page they check against a driver on the line.
 */
export const adminPrimaryNav: NavItem[] = [
    { name: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
    { name: "Driver Stock", shortName: "Stock", href: "/admin/driver-stock", icon: Backpack, badge: "driverStock" },
    { name: "Returns Verification", shortName: "Returns", href: "/admin/returns", icon: AlertTriangle, badge: "returns" },
    { name: "Machine Stock", shortName: "Machines", href: "/admin/machine-stock", icon: Activity },
];

export const superNavSections: NavSection[] = [
    {
        label: "Console",
        items: [
            { name: "Overview", href: "/super", icon: LayoutDashboard, exact: true },
            { name: "Oversight", href: "/super/oversight", icon: Eye },
            { name: "Audit Trail", shortName: "Audit", href: "/super/audit", icon: ScrollText },
            { name: "Integrity", href: "/super/integrity", icon: ShieldAlert },
            { name: "System Health", shortName: "Health", href: "/super/system", icon: Activity },
            // Experimental — only when NEXT_PUBLIC_ENABLE_AI_LAB=true.
            ...(ENABLE_AI_LAB ? [{ name: "AI Lab", href: "/super/lab", icon: FlaskConical }] : []),
        ],
    },
    {
        label: "Access",
        items: [{ name: "Admin Accounts", shortName: "Admins", href: "/super/admins", icon: Users }],
    },
];

export const superPrimaryNav: NavItem[] = [
    { name: "Overview", href: "/super", icon: LayoutDashboard, exact: true },
    { name: "Oversight", href: "/super/oversight", icon: Eye },
    { name: "Audit Trail", shortName: "Audit", href: "/super/audit", icon: ScrollText },
    { name: "Integrity", href: "/super/integrity", icon: ShieldAlert },
];

/** Shared active-route test so the sidebar and the bottom bar can't disagree. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
    return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}
