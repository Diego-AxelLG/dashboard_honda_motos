/**
 * Shared formatting utilities.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely (clsx + twMerge). */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Format number as MXN currency: $1,234,567 */
export function fmtCurrency(value: number | string | null | undefined): string {
    if (value == null) return "—";
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(n)) return "—";
    return n.toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

/** Format number with thousand separators: 1,234,567 */
export function fmtNumber(value: number | string | null | undefined): string {
    if (value == null) return "—";
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(n)) return "—";
    return n.toLocaleString("es-MX");
}

/** Format a percentage: 85.3% */
export function fmtPct(value: number | null | undefined, decimals = 1): string {
    if (value == null) return "—";
    return `${value.toFixed(decimals)}%`;
}

/** Format ISO date string to short Spanish: "25 mar 2026" */
export function fmtDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}
