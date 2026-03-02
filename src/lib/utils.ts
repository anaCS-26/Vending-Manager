import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
    return `⃁ ${amount.toFixed(2)}`;
}

export function formatID(id: number, padding: number = 4): string {
    return id.toString().padStart(padding, '0');
}
