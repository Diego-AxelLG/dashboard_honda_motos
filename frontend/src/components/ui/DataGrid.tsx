"use client";

/**
 * DataGrid — Grid de tarjetas clickeables con panel de detalle.
 *
 * Implementa el patrón "Grid + Detail Panel" usado en Resumen, Inventario
 * y Seminuevos: un grid responsive de cards, click para seleccionar,
 * y un slot para renderizar un panel de detalle debajo.
 *
 * Ejemplo de uso:
 *
 *   interface Agency { mui: number; name: string; sales: number }
 *
 *   const [selectedId, setSelectedId] = useState<number | null>(null);
 *
 *   <DataGrid<Agency>
 *     items={agencies}
 *     getId={(a) => a.mui}
 *     selectedId={selectedId}
 *     onSelect={(a) => setSelectedId(
 *       selectedId === a.mui ? null : a.mui   // toggle
 *     )}
 *     renderCard={(a, isSelected) => (
 *       <div>
 *         <p className="font-semibold">{a.name}</p>
 *         <p className="text-2xl font-bold">{a.sales}</p>
 *       </div>
 *     )}
 *     renderDetail={(a) => <SalesTable mui={a.mui} />}
 *   />
 */

import { type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataGridProps<T> {
    /** Array of items to render as cards */
    items: T[];
    /** Extract a unique ID from each item */
    getId: (item: T) => string | number;
    /** Currently selected item ID, or null */
    selectedId: string | number | null;
    /** Called when a card is clicked */
    onSelect: (item: T) => void;
    /** Render the content inside each card */
    renderCard: (item: T, isSelected: boolean) => ReactNode;
    /** Render the detail panel for the selected item (optional) */
    renderDetail?: (item: T) => ReactNode;
    /** Grid columns override. Default: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" */
    columns?: string;
    /** Extra CSS classes on the outer grid container */
    className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataGrid<T>({
    items,
    getId,
    selectedId,
    onSelect,
    renderCard,
    renderDetail,
    columns = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    className = "",
}: DataGridProps<T>) {
    const selectedItem =
        selectedId != null ? items.find((i) => getId(i) === selectedId) : null;

    return (
        <div className={className}>
            {/* Card grid */}
            <div className={`grid gap-4 ${columns}`}>
                {items.map((item) => {
                    const id = getId(item);
                    const isSelected = id === selectedId;

                    return (
                        <button
                            key={String(id)}
                            type="button"
                            onClick={() => onSelect(item)}
                            className={`group relative cursor-pointer rounded-xl border p-5 text-left transition-all duration-200 ${
                                isSelected
                                    ? "border-[var(--brand-primary)] bg-[var(--bg-card-hover)] shadow-lg shadow-[var(--brand-primary)]/10 ring-1 ring-[var(--brand-primary)]/30"
                                    : "border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-card)]/80 hover:shadow-lg hover:shadow-black/10"
                            }`}
                        >
                            {renderCard(item, isSelected)}

                            {/* Hint */}
                            <span className="absolute bottom-2 right-3 text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                                {isSelected
                                    ? "Click para cerrar"
                                    : "Click para ver detalle"}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Detail panel (slides in below the grid) */}
            {selectedItem && renderDetail && (
                <div
                    className="mt-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
                    style={{ animation: "slideDown 0.2s ease-out" }}
                >
                    {renderDetail(selectedItem)}
                </div>
            )}
        </div>
    );
}
