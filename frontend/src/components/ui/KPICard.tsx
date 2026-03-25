"use client";

/**
 * KPICard — Tarjeta de indicador clave.
 *
 * Ejemplo de uso:
 *
 *   <KPICard
 *     title="Ventas del Mes"
 *     value={142}
 *     format="number"
 *     subtitle="unidades nuevas"
 *     delta={12.5}
 *     deltaLabel="vs mes anterior"
 *   />
 *
 *   <KPICard
 *     title="Utilidad Bruta"
 *     value={2_350_000}
 *     format="currency"
 *     delta={-3.2}
 *   />
 */

import { Card } from "@tremor/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KPICardProps {
    /** Card heading */
    title: string;
    /** Primary numeric value */
    value: number | string | null;
    /** How to format `value` — raw keeps it as-is */
    format?: "number" | "currency" | "percent" | "raw";
    /** Small text below the main value */
    subtitle?: string;
    /** Percentage change (positive = good by default) */
    delta?: number | null;
    /** Label next to the delta badge */
    deltaLabel?: string;
    /** When true, a negative delta is colored green instead of red */
    invertDelta?: boolean;
    /** Extra CSS classes on the outer card */
    className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(
    value: number | string | null,
    format: KPICardProps["format"],
): string {
    if (value == null) return "—";
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(n)) return String(value);

    switch (format) {
        case "currency":
            return n.toLocaleString("es-MX", {
                style: "currency",
                currency: "MXN",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            });
        case "percent":
            return `${n.toFixed(1)}%`;
        case "raw":
            return String(value);
        case "number":
        default:
            return n.toLocaleString("es-MX");
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KPICard({
    title,
    value,
    format = "number",
    subtitle,
    delta,
    deltaLabel,
    invertDelta = false,
    className = "",
}: KPICardProps) {
    // Delta color: positive is green unless inverted
    const deltaPositive = delta != null && delta > 0;
    const deltaIsGood = invertDelta ? !deltaPositive : deltaPositive;
    const deltaColor =
        delta == null || delta === 0
            ? "text-[var(--text-muted)]"
            : deltaIsGood
              ? "text-[var(--success)]"
              : "text-[var(--danger)]";
    const deltaArrow =
        delta != null && delta !== 0 ? (delta > 0 ? "\u2191" : "\u2193") : "";

    return (
        <Card
            className={`!bg-[var(--bg-card)] !border-[var(--border-color)] !ring-0 p-5 ${className}`}
        >
            {/* Title */}
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {title}
            </p>

            {/* Main value */}
            <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                {formatValue(value, format)}
            </p>

            {/* Subtitle */}
            {subtitle && (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {subtitle}
                </p>
            )}

            {/* Delta indicator */}
            {delta != null && (
                <div className="mt-3 flex items-center gap-1.5">
                    <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${deltaColor} ${
                            deltaIsGood
                                ? "bg-[var(--success)]/10"
                                : delta === 0
                                  ? "bg-[var(--text-muted)]/10"
                                  : "bg-[var(--danger)]/10"
                        }`}
                    >
                        {deltaArrow} {Math.abs(delta).toFixed(1)}%
                    </span>
                    {deltaLabel && (
                        <span className="text-[11px] text-[var(--text-muted)]">
                            {deltaLabel}
                        </span>
                    )}
                </div>
            )}
        </Card>
    );
}
