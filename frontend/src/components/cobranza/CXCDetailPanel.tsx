"use client";

import { useEffect, useMemo, useState } from "react";
import {
    getCobranzaCxcDetalle,
    getCobranzaCxcHistorial,
    createCobranzaCxcCompromiso,
    updateCobranzaCxcCompromiso,
    type CXCDetalleRow,
} from "@/lib/api";
import { fmtCurrency, fmtDate } from "@/lib/utils";
import { LoadingState } from "@/components/ui";
import CompromisoSection from "./CompromisoSection";

export interface CXCDetailPanelProps {
    mui: number;
    sucursal: string;
    onClose: () => void;
}

const EXCLUDE_CATEGORIA = "Facturas empleados";

export default function CXCDetailPanel({ mui, sucursal, onClose }: CXCDetailPanelProps) {
    const [data, setData] = useState<CXCDetalleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const [activeTab, setActiveTab] = useState<string>("Todas");
    const [searchMov, setSearchMov] = useState("");
    const [filterSinJustif, setFilterSinJustif] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        getCobranzaCxcDetalle(mui)
            .then(rows => {
                if (!cancelled) setData(rows);
            })
            .catch(() => {
                if (!cancelled) setError(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [mui, reloadKey]);

    const tabs = useMemo(() => {
        const set = new Set<string>(data.map(r => r.categoria ?? "Sin categoria"));
        return ["Todas", ...Array.from(set).sort()];
    }, [data]);

    const filtered = useMemo(() => {
        return data.filter(r => {
            if (activeTab !== "Todas" && (r.categoria ?? "Sin categoria") !== activeTab) return false;
            if (filterSinJustif) {
                const justificado =
                    r.compromiso_activo !== null || r.categoria === EXCLUDE_CATEGORIA;
                if (justificado) return false;
            }
            if (searchMov.trim()) {
                const q = searchMov.trim().toLowerCase();
                if (!r.movimiento.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [data, activeTab, searchMov, filterSinJustif]);

    const conJustif = data.filter(
        r => r.compromiso_activo !== null || r.categoria === EXCLUDE_CATEGORIA
    ).length;
    const sinJustif = data.length - conJustif;

    return (
        <div
            className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--bg-card)] p-4"
            style={{ animation: "slideDown 0.2s ease-out" }}
        >
            {/* Header */}
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-color)] pb-3">
                <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                        CxC · {sucursal}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-[var(--text-muted)]">{data.length} facturas</span>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-400">
                            {conJustif} con justificacion
                        </span>
                        <button
                            type="button"
                            onClick={() => setFilterSinJustif(v => !v)}
                            className={`rounded-full px-2 py-0.5 font-medium transition-colors ${
                                filterSinJustif
                                    ? "bg-red-500/20 text-red-300 ring-1 ring-red-400/50"
                                    : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            }`}
                        >
                            {sinJustif} sin justificacion
                        </button>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="ml-auto rounded-md border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                >
                    Cerrar
                </button>
            </div>

            {/* Tabs + search */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
                {tabs.map(t => {
                    const isActive = t === activeTab;
                    const count =
                        t === "Todas"
                            ? data.length
                            : data.filter(r => (r.categoria ?? "Sin categoria") === t).length;
                    return (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setActiveTab(t)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                isActive
                                    ? "bg-[var(--brand-primary)] text-white"
                                    : "border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]/40"
                            }`}
                        >
                            {t} ({count})
                        </button>
                    );
                })}
                <input
                    type="text"
                    value={searchMov}
                    onChange={e => setSearchMov(e.target.value)}
                    placeholder="Buscar movimiento..."
                    className="ml-auto w-56 rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                />
            </div>

            {/* List */}
            <div className="mt-4 max-h-[640px] space-y-3 overflow-y-auto pr-1">
                {loading && <LoadingState variant="table" count={3} />}
                {!loading && error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
                        Error al cargar el detalle.
                    </div>
                )}
                {!loading && !error && filtered.length === 0 && (
                    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card-hover)]/30 p-6 text-center text-sm text-[var(--text-muted)]">
                        Sin facturas que coincidan con el filtro.
                    </div>
                )}
                {!loading && !error && filtered.map(r => {
                    const isEmpleado = r.categoria === EXCLUDE_CATEGORIA;
                    const diasColor =
                        (r.dias_vencido ?? 0) > 90
                            ? "text-red-400"
                            : (r.dias_vencido ?? 0) > 60
                            ? "text-amber-400"
                            : "text-[var(--brand-primary)]";
                    return (
                        <div
                            key={`${r.mui}-${r.movimiento}`}
                            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card-hover)]/30 p-3"
                        >
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded bg-[var(--bg-card)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)]">
                                            {r.movimiento}
                                        </span>
                                        <span className="text-xs text-[var(--text-muted)]">
                                            {r.categoria ?? "Sin categoria"}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                                        {r.cliente ?? "Sin cliente"}
                                    </div>
                                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                                        Emision: {fmtDate(r.fecha_emision)}
                                    </div>
                                    {r.observaciones && (
                                        <div className="mt-1 text-xs italic text-[var(--text-secondary)]">
                                            &ldquo;{r.observaciones}&rdquo;
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col items-end gap-1 text-right">
                                    <div className={`text-xs font-medium ${diasColor}`}>
                                        {r.dias_vencido ?? "—"} dias vencido
                                    </div>
                                    <div className="font-mono text-base font-semibold text-red-400">
                                        {fmtCurrency(r.saldo_vencido)}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                                <CompromisoSection
                                    rowKey={`${r.mui}-${r.movimiento}-${reloadKey}`}
                                    compromisoActivo={r.compromiso_activo}
                                    compromisosVencidos={r.compromisos_vencidos}
                                    fixedText={isEmpleado ? "Descuento via nomina" : null}
                                    loadHistorial={() => getCobranzaCxcHistorial(r.movimiento, r.mui)}
                                    onCreate={async (com, dias) => {
                                        await createCobranzaCxcCompromiso(r.movimiento, r.mui, com, dias);
                                        setReloadKey(k => k + 1);
                                    }}
                                    onEdit={async (id, com) => {
                                        await updateCobranzaCxcCompromiso(id, com);
                                        setReloadKey(k => k + 1);
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <style jsx>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
