"use client";

/**
 * LoadingState — Skeletons y spinner para estados de carga.
 *
 * Tres variantes:
 *   - "cards"   → grid de tarjetas skeleton (para grids de KPIs)
 *   - "table"   → filas skeleton (para tablas)
 *   - "spinner" → spinner centrado (para carga genérica)
 *
 * Ejemplo de uso:
 *
 *   // Grid de 6 skeleton cards en 3 columnas:
 *   <LoadingState variant="cards" count={6} columns={3} />
 *
 *   // Tabla con 5 filas:
 *   <LoadingState variant="table" count={5} />
 *
 *   // Spinner simple:
 *   <LoadingState variant="spinner" />
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadingStateProps {
    /** Which skeleton to render */
    variant?: "cards" | "table" | "spinner";
    /** Number of skeleton items. Default: 4 for cards, 5 for table rows */
    count?: number;
    /** Grid columns for "cards" variant. Default: 4 */
    columns?: number;
    /** Extra CSS classes */
    className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCard() {
    return (
        <div className="animate-pulse rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
            {/* Title */}
            <div className="h-3 w-24 rounded bg-[var(--bg-skeleton)]" />
            {/* Value */}
            <div className="mt-4 h-8 w-32 rounded bg-[var(--bg-skeleton)]" />
            {/* Subtitle */}
            <div className="mt-3 h-3 w-20 rounded bg-[var(--bg-skeleton)]" />
            {/* Delta */}
            <div className="mt-4 h-5 w-16 rounded-full bg-[var(--bg-skeleton)]" />
        </div>
    );
}

function SkeletonRow() {
    return (
        <div className="flex animate-pulse items-center gap-4 border-b border-[var(--border-color)] px-4 py-3">
            <div className="h-3 w-20 rounded bg-[var(--bg-skeleton)]" />
            <div className="h-3 w-32 rounded bg-[var(--bg-skeleton)]" />
            <div className="h-3 w-16 rounded bg-[var(--bg-skeleton)]" />
            <div className="ml-auto h-3 w-24 rounded bg-[var(--bg-skeleton)]" />
        </div>
    );
}

function Spinner() {
    return (
        <div className="flex items-center justify-center py-12">
            <svg
                className="h-8 w-8 animate-spin text-[var(--brand-primary)]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
            >
                <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                />
                <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
            </svg>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Grid column class map
// ---------------------------------------------------------------------------

const COL_MAP: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LoadingState({
    variant = "cards",
    count,
    columns = 4,
    className = "",
}: LoadingStateProps) {
    if (variant === "spinner") {
        return (
            <div className={className}>
                <Spinner />
            </div>
        );
    }

    if (variant === "table") {
        const rows = count ?? 5;
        return (
            <div
                className={`rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden ${className}`}
            >
                {Array.from({ length: rows }).map((_, i) => (
                    <SkeletonRow key={i} />
                ))}
            </div>
        );
    }

    // variant === "cards"
    const cards = count ?? columns;
    const colClass = COL_MAP[columns] ?? COL_MAP[4];

    return (
        <div className={`grid gap-4 ${colClass} ${className}`}>
            {Array.from({ length: cards }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}
