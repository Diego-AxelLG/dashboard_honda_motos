"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    getInventarioResumenStock, getInventarioDetalle, getInventarioApartados,
} from "@/lib/api";
import { fmtNumber } from "@/lib/utils";
import { LoadingState, UltimaActualizacion } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModeloRow {
    modelo: string;
    disponible: number;
    apartado: number;
    facturado: number;
    total: number;
    vta_3m: number | null;
    meses_inventario: number | null;
}
interface SucursalCard {
    mui: number | null;
    sucursal: string;
    total_stock: number;
    disponible: number;
    apartado: number;
    facturado: number;
    unidades_90_plus: number;
    pct_90_plus: number;
    edad_promedio: number;
    vta_3m_total: number | null;
    meses_inventario_total: number | null;
    modelos: ModeloRow[];
}
interface ResumenStock {
    fecha_snapshot: string;
    sucursales: SucursalCard[];
    total: SucursalCard;
}
interface DetalleRow {
    mui: number;
    sucursal: string;
    vin: string;
    modelo: string;
    color: string;
    anio: number | null;
    dias_inventario: number;
    dias_apartado: number | null;
    estatus: string;
    facturado: boolean;
    fecha_facturacion: string | null;
    tipo_compra: string | null;
    status_proceso: string | null;
    rango: string;
}
interface ApartadoRow {
    mui: number;
    sucursal: string;
    vin: string;
    modelo: string;
    color: string;
    anio: number | null;
    dias_inventario: number;
    dias_apartado: number | null;
    estatus: string;
    asesor_nombre: string | null;
    asesor_id: number | null;
    cliente_nombre: string | null;
    fecha_apartado: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mesesBadgeClass(m: number | null): string {
    if (m == null) return "bg-[var(--text-muted)]/10 text-[var(--text-muted)]";
    if (m < 2) return "bg-[var(--success)]/15 text-[var(--success)]";
    if (m <= 3) return "bg-[var(--warning)]/15 text-[var(--warning)]";
    return "bg-[var(--danger)]/15 text-[var(--danger)]";
}

function estatusBadge(estatus: string): string {
    if (estatus === "Disponible") return "bg-[var(--success)]/15 text-[var(--success)]";
    if (estatus === "Apartado") return "bg-[var(--warning)]/15 text-[var(--warning)]";
    return "bg-[var(--danger)]/15 text-[var(--danger)]";
}

function rangoBadge(r: string): string {
    if (r === "0-30") return "bg-[var(--success)]/10 text-[var(--success)]";
    if (r === "31-60") return "bg-blue-500/10 text-blue-500";
    if (r === "61-90") return "bg-[var(--warning)]/10 text-[var(--warning)]";
    return "bg-[var(--danger)]/10 text-[var(--danger)]";
}

// Donut SVG — pct in [0,100]
function Donut({ pct, label }: { pct: number; label: string }) {
    const radius = 18;
    const circ = 2 * Math.PI * radius;
    const offset = circ * (1 - pct / 100);
    const color = pct > 20 ? "var(--danger)" : pct > 10 ? "var(--warning)" : "var(--success)";
    return (
        <div className="flex items-center gap-3">
            <svg width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--border-color)" strokeWidth="5" />
                <circle cx="24" cy="24" r={radius} fill="none" stroke={color} strokeWidth="5"
                    strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                    transform="rotate(-90 24 24)" />
                <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-primary)">{pct.toFixed(0)}%</text>
            </svg>
            <div className="text-xs">
                <p className="font-semibold text-[var(--text-primary)]">{label}</p>
                <p className="text-[var(--text-muted)]">+90 d&iacute;as</p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InventarioPage() {
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const [resumen, setResumen] = useState<ResumenStock | null>(null);
    const [detalle, setDetalle] = useState<Record<number, DetalleRow[]>>({});
    const [apartados, setApartados] = useState<Record<number, ApartadoRow[]>>({});
    // "total" usa mui=0 para agregados; sucursales usan su mui real
    const [selected, setSelected] = useState<number | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(false);
        try {
            const [res, det, apt] = await Promise.all([
                getInventarioResumenStock().catch(() => null),
                getInventarioDetalle().catch(() => null),
                getInventarioApartados().catch(() => null),
            ]);
            if (!res && !det && !apt) setFetchError(true);
            setResumen(res ?? null);
            const detMap: Record<number, DetalleRow[]> = { 0: det ?? [] };
            const aptMap: Record<number, ApartadoRow[]> = { 0: apt ?? [] };
            (det ?? []).forEach((r: DetalleRow) => {
                (detMap[r.mui] ??= []).push(r);
            });
            (apt ?? []).forEach((r: ApartadoRow) => {
                (aptMap[r.mui] ??= []).push(r);
            });
            setDetalle(detMap);
            setApartados(aptMap);
        } catch {
            setFetchError(true);
            setResumen(null);
            setDetalle({});
            setApartados({});
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={3} columns={3} />
                <LoadingState variant="table" count={8} />
            </div>
        );
    }

    const cards: SucursalCard[] = resumen
        ? [resumen.total, ...resumen.sucursales]
        : [];

    const selectedKey = selected ?? -1;
    const selectedDet = selectedKey >= 0 ? detalle[selectedKey] ?? [] : [];
    const selectedApt = selectedKey >= 0 ? apartados[selectedKey] ?? [] : [];
    const selectedCard = cards.find(c => (c.mui ?? 0) === selectedKey);

    return (
        <motion.div className="space-y-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Inventario</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Stock actual por sucursal &mdash; click en una card para ver detalle</p>
                    <div className="mt-1">
                        <UltimaActualizacion etls={["inventario"]} />
                    </div>
                </div>
                {resumen && (
                    <p className="text-xs text-[var(--text-muted)]">Snapshot: {resumen.fecha_snapshot}</p>
                )}
            </div>

            {fetchError && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
                    No se pudieron cargar datos del servidor. Verifica que el backend est&eacute; corriendo en el puerto 8001.
                </div>
            )}

            {/* Cards */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {cards.map((c) => {
                    const key = c.mui ?? 0;
                    const isSelected = selectedKey === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setSelected(isSelected ? null : key)}
                            className={`text-left rounded-xl border bg-[var(--bg-card)] p-5 transition-all hover:shadow-md ${isSelected ? "border-[var(--brand-primary)] shadow-md" : "border-[var(--border-color)]"}`}
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{c.sucursal}</p>
                                    <p className="mt-0.5 text-xs uppercase tracking-wider text-[var(--text-muted)]">Stock</p>
                                </div>
                                <p className="text-3xl font-bold text-[var(--text-primary)]">{c.total_stock}</p>
                            </div>

                            <table className="mt-4 w-full text-xs">
                                <thead>
                                    <tr className="border-b border-[var(--border-color)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                                        <th className="pb-1.5 text-left">Modelo</th>
                                        <th className="pb-1.5 text-right text-[var(--success)]">D</th>
                                        <th className="pb-1.5 text-right text-[var(--warning)]">A</th>
                                        <th className="pb-1.5 text-right text-[var(--danger)]">F</th>
                                        <th className="pb-1.5 text-right">Uds</th>
                                        <th className="pb-1.5 text-right" title="Promedio mensual de ventas, últimos 3 meses">VTA 3M</th>
                                        <th className="pb-1.5 text-right">Meses</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {c.modelos.slice(0, 10).map((m) => (
                                        <tr key={m.modelo} className="border-b border-[var(--border-color)]/30">
                                            <td className="py-1 pr-2 text-[var(--text-primary)] truncate max-w-[110px]" title={m.modelo}>{m.modelo}</td>
                                            <td className="py-1 text-right text-[var(--success)]">{m.disponible || <span className="text-[var(--text-muted)]">—</span>}</td>
                                            <td className="py-1 text-right text-[var(--warning)]">{m.apartado || <span className="text-[var(--text-muted)]">—</span>}</td>
                                            <td className="py-1 text-right text-[var(--danger)]">{m.facturado || <span className="text-[var(--text-muted)]">—</span>}</td>
                                            <td className="py-1 text-right font-semibold text-[var(--text-primary)]">{m.total}</td>
                                            <td className="py-1 text-right text-[var(--text-secondary)]">
                                                {m.vta_3m == null ? <span className="text-[var(--text-muted)]">—</span> : m.vta_3m.toFixed(1)}
                                            </td>
                                            <td className="py-1 text-right">
                                                <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${mesesBadgeClass(m.meses_inventario)}`}>
                                                    {m.meses_inventario == null ? "—" : m.meses_inventario.toFixed(1)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="border-t-2 border-[var(--border-color)]">
                                        <td className="pt-2 text-[10px] font-bold uppercase text-[var(--text-muted)]">Total</td>
                                        <td className="pt-2 text-right font-bold text-[var(--success)]">{c.disponible}</td>
                                        <td className="pt-2 text-right font-bold text-[var(--warning)]">{c.apartado}</td>
                                        <td className="pt-2 text-right font-bold text-[var(--danger)]">{c.facturado}</td>
                                        <td className="pt-2 text-right font-bold text-[var(--text-primary)]">{c.total_stock}</td>
                                        <td className="pt-2 text-right font-bold text-[var(--text-primary)]">
                                            {c.vta_3m_total == null ? <span className="text-[var(--text-muted)]">—</span> : c.vta_3m_total.toFixed(1)}
                                        </td>
                                        <td className="pt-2 text-right">
                                            <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${mesesBadgeClass(c.meses_inventario_total)}`}>
                                                {c.meses_inventario_total == null ? "—" : c.meses_inventario_total.toFixed(1)}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                                <Donut pct={c.pct_90_plus} label={`${c.unidades_90_plus} uds`} />
                                <div className="text-right text-xs">
                                    <p className="text-[var(--text-muted)]">Edad prom.</p>
                                    <p className="text-lg font-bold text-[var(--text-primary)]">{c.edad_promedio} <span className="text-xs font-normal text-[var(--text-muted)]">d</span></p>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Drawer: tablas desplegables */}
            <AnimatePresence>
                {selectedCard && (
                    <motion.div
                        key={selectedKey}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-6"
                    >
                        {/* Tabla inventario */}
                        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Inventario &mdash; {selectedCard.sucursal}</h3>
                                    <p className="text-xs text-[var(--text-muted)]">{fmtNumber(selectedDet.length)} unidades en stock</p>
                                </div>
                                <button onClick={() => setSelected(null)} className="rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-[var(--border-color)] text-left uppercase tracking-wider text-[var(--text-muted)]">
                                            <th className="pb-2 pr-3">Modelo</th>
                                            <th className="pb-2 pr-3">Color</th>
                                            <th className="pb-2 pr-3">A&ntilde;o</th>
                                            <th className="pb-2 pr-3">Estatus</th>
                                            <th className="pb-2 pr-3 text-right">D&iacute;as Inv.</th>
                                            <th className="pb-2 pr-3 text-right">D&iacute;as Apt.</th>
                                            <th className="pb-2">Rango</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedDet.map((d) => (
                                            <tr key={d.vin} className="border-b border-[var(--border-color)]/40 hover:bg-[var(--bg-card-hover)]">
                                                <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{d.modelo}</td>
                                                <td className="py-2 pr-3 text-[var(--text-secondary)]">{d.color}</td>
                                                <td className="py-2 pr-3 text-[var(--text-secondary)]">{d.anio ?? "—"}</td>
                                                <td className="py-2 pr-3">
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${estatusBadge(d.estatus)}`}>{d.estatus}</span>
                                                </td>
                                                <td className={`py-2 pr-3 text-right font-semibold ${d.dias_inventario > 90 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{d.dias_inventario}</td>
                                                <td className={`py-2 pr-3 text-right ${d.dias_apartado != null && d.dias_apartado > 45 ? "text-[var(--danger)] font-semibold" : "text-[var(--text-muted)]"}`}>
                                                    {d.dias_apartado != null ? d.dias_apartado : "—"}
                                                </td>
                                                <td className="py-2">
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rangoBadge(d.rango)}`}>{d.rango}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Tabla apartados */}
                        {selectedApt.length > 0 && (
                            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Apartados &mdash; {selectedCard.sucursal}</h3>
                                        <p className="text-xs text-[var(--text-muted)]">{fmtNumber(selectedApt.length)} unidades apartadas</p>
                                    </div>
                                    <button onClick={() => setSelected(null)} className="rounded-lg border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-[var(--border-color)] text-left uppercase tracking-wider text-[var(--text-muted)]">
                                                <th className="pb-2 pr-3">Asesor</th>
                                                <th className="pb-2 pr-3">Modelo</th>
                                                <th className="pb-2 pr-3">Color</th>
                                                <th className="pb-2 pr-3">Cliente</th>
                                                <th className="pb-2 pr-3 text-right">D&iacute;as Inv.</th>
                                                <th className="pb-2 pr-3 text-right">D&iacute;as Apt.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedApt.map((a) => (
                                                <tr key={a.vin} className="border-b border-[var(--border-color)]/40 hover:bg-[var(--bg-card-hover)]">
                                                    <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{a.asesor_nombre || "—"}</td>
                                                    <td className="py-2 pr-3 font-semibold text-[var(--text-primary)]">{a.modelo}</td>
                                                    <td className="py-2 pr-3 text-[var(--text-secondary)]">{a.color}</td>
                                                    <td className="py-2 pr-3 text-[var(--text-secondary)]">{a.cliente_nombre || "—"}</td>
                                                    <td className={`py-2 pr-3 text-right font-semibold ${a.dias_inventario > 90 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{a.dias_inventario}</td>
                                                    <td className={`py-2 pr-3 text-right font-semibold ${a.dias_apartado != null && a.dias_apartado > 45 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
                                                        {a.dias_apartado != null ? a.dias_apartado : "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
