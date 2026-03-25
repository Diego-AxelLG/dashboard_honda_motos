"use client";

/**
 * MonthPicker — Selector de mes/año controlado por props.
 *
 * Sin dependencia a contexto global: recibe value y onChange directamente.
 *
 * Ejemplo de uso:
 *
 *   const [mes, setMes] = useState("2026-03");
 *
 *   <MonthPicker value={mes} onChange={setMes} />
 *
 *   // Con rango personalizado:
 *   <MonthPicker value={mes} onChange={setMes} min="2024-01" />
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthPickerProps {
    /** Selected month in "YYYY-MM" format */
    value: string;
    /** Called with the new "YYYY-MM" when the user picks a month */
    onChange: (value: string) => void;
    /** Earliest selectable month. Default: "2016-01" */
    min?: string;
    /** Latest selectable month. Default: current month */
    max?: string;
    /** Show a "Hoy" button to jump to current month. Default: true */
    showToday?: boolean;
    /** Extra CSS classes */
    className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MonthPicker({
    value,
    onChange,
    min = "2016-01",
    max,
    showToday = true,
    className = "",
}: MonthPickerProps) {
    const currentMonth = getCurrentMonth();
    const effectiveMax = max ?? currentMonth;
    const isCurrentMonth = value === currentMonth;

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <input
                type="month"
                value={value}
                min={min}
                max={effectiveMax}
                onChange={(e) => onChange(e.target.value)}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]/30"
            />
            {showToday && !isCurrentMonth && (
                <button
                    onClick={() => onChange(currentMonth)}
                    className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card-hover)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-primary)]/50 hover:text-[var(--text-primary)]"
                >
                    Hoy
                </button>
            )}
        </div>
    );
}
