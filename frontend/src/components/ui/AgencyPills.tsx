"use client";

/**
 * AgencyPills — Filtro horizontal con botones tipo pill.
 *
 * Genérico: recibe las opciones como prop, no hardcodea agencias.
 * Siempre incluye "Todas" como primera opción (value = null).
 *
 * Ejemplo de uso:
 *
 *   const AGENCIES = [
 *     { label: "Tijuana", value: 3 },
 *     { label: "Mexicali", value: 4 },
 *     { label: "Ensenada", value: 5 },
 *   ];
 *
 *   const [selected, setSelected] = useState<string | number | null>(null);
 *
 *   <AgencyPills
 *     options={AGENCIES}
 *     selected={selected}
 *     onChange={setSelected}
 *   />
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PillOption {
    label: string;
    value: string | number;
}

export interface AgencyPillsProps {
    /** Available filter options (without "Todas" — that's built-in) */
    options: PillOption[];
    /** Currently selected value, or null for "Todas" */
    selected: string | number | null;
    /** Fires when the user clicks a pill */
    onChange: (value: string | number | null) => void;
    /** Label for the "all" pill. Default: "Todas" */
    allLabel?: string;
    /** Extra CSS classes on the container */
    className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgencyPills({
    options,
    selected,
    onChange,
    allLabel = "Todas",
    className = "",
}: AgencyPillsProps) {
    const pills: { label: string; value: string | number | null }[] = [
        { label: allLabel, value: null },
        ...options,
    ];

    return (
        <div
            className={`flex flex-wrap items-center gap-2 ${className}`}
            role="group"
            aria-label="Filtro"
        >
            {pills.map((pill) => {
                const isActive =
                    pill.value === selected ||
                    (pill.value === null && selected === null);

                return (
                    <button
                        key={String(pill.value)}
                        onClick={() => onChange(pill.value)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                            isActive
                                ? "bg-[var(--brand-primary)] text-white shadow-md shadow-[var(--brand-primary)]/25"
                                : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--brand-primary)]/40 hover:text-[var(--text-primary)]"
                        }`}
                    >
                        {pill.label}
                    </button>
                );
            })}
        </div>
    );
}
