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
