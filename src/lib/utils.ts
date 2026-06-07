import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/** Utility for Tailwind CSS class merging */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/** Formats number as Saudi Riyal (⃁) */
export function formatCurrency(amount: number): string {
    return `⃁ ${amount.toFixed(2)}`;
}

/** Formats ID with leading zeros */
export function formatID(id: number, padding: number = 4): string {
    return id.toString().padStart(padding, '0');
}

/** Formats date to Saudi Arabia Timezone */
export function formatSaudiDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    return new Date(date).toLocaleDateString('en-US', {
        timeZone: 'Asia/Riyadh',
        ...options
    });
}

/** Formats time to Saudi Arabia Timezone */
export function formatSaudiTime(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    return new Date(date).toLocaleTimeString('en-US', {
        timeZone: 'Asia/Riyadh',
        ...options
    });
}

/** Compact "Xm/h/d ago" from a past instant. Returns "never" for null. Timezone-agnostic (pure elapsed time). */
export function formatRelativeAge(date: Date | string | number | null | undefined): string {
    if (date == null) return "never";
    const ms = Date.now() - new Date(date).getTime();
    if (ms < 60000) return "just now";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/**
 * Asia/Riyadh is fixed at +03:00 year-round (Saudi Arabia does not observe DST).
 * All operational day boundaries should anchor to this offset rather than the
 * server's local timezone, so "today" means the same thing whether the request
 * is served from Vercel (UTC) or local dev (any tz).
 */
const RIYADH_OFFSET = "+03:00";

/** YYYY-MM-DD string for the given instant *as observed in Riyadh*. */
function riyadhYMD(date: Date): string {
    // en-CA formats Gregorian dates as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

/**
 * Returns the Date at 00:00 Riyadh on the given calendar day.
 * - No argument → today (Riyadh).
 * - Date argument → the Riyadh calendar day containing that instant.
 * - "YYYY-MM-DD" string → that exact Riyadh calendar day.
 */
export function startOfRiyadhDay(date?: Date | string): Date {
    const ymd = typeof date === "string" ? date : riyadhYMD(date ?? new Date());
    return new Date(`${ymd}T00:00:00.000${RIYADH_OFFSET}`);
}

/** End of Riyadh day (23:59:59.999) for the same input semantics as startOfRiyadhDay. */
export function endOfRiyadhDay(date?: Date | string): Date {
    const ymd = typeof date === "string" ? date : riyadhYMD(date ?? new Date());
    return new Date(`${ymd}T23:59:59.999${RIYADH_OFFSET}`);
}

/** Returns Jan 1 00:00 Riyadh of the calendar year containing the given instant (default: now). */
export function startOfRiyadhYear(date?: Date): Date {
    const year = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
    }).format(date ?? new Date());
    return new Date(`${year}-01-01T00:00:00.000${RIYADH_OFFSET}`);
}
