"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, ComposedChart, LabelList,
} from "recharts";
import {
    getVentasResumen, getVentasTendencia, getVentasPorModelo,
    getVentasFlujos, getVentasDetalle, getVentasCumplimientoPacing,
} from "@/lib/api";
import { AGENCIES } from "@/lib/constants";
import { fmtNumber, fmtDate } from "@/lib/utils";
import { LoadingState, AgencyPills, MonthPicker } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tendencia {
    fecha: string;
    ventas_acumuladas: number;
    plan_prorrateado: number;
    ventas_mes_anterior: number;
    ventas_anio_anterior: number;
}
interface Modelo { modelo: string; unidades: number; contado: number; financiamiento: number }
interface Flujo { fecha: string; id_sucursal: number; freshup: number; internet: number; total: number }
interface VentaDetalle { fecha: string; id_sucursal: number; sucursal: string; modelo: string; vin: string; venta_contado: boolean }
interface Resumen { anio_mes: string; id_sucursal: number; sucursal: string; total_ventas: number; ventas_nuevos: number; monto_total: number; meta: number; pct_cumplimiento: number; var_pct_yoy: number }
interface PacingRow {
    ventas_actual: number;
    plan_total: number;
    plan_prorrateado: number;
    cumplimiento_vs_plan_pct: number | null;
    ventas_mes_anterior: number;
    var_vs_mes_anterior_pct: number | null;
    ventas_anio_anterior: number;
    var_vs_anio_anterior_pct: number | null;
}
interface PacingResponse { anio_mes: string; cutoff_day: number; dias_mes: number; total: PacingRow; sucursales: (PacingRow & { mui: number; sucursal: string })[] }
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VentasPage() {
    const [mes, setMes] = useState(getCurrentMonth());
    const [mui, setMui] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const [tab, setTab] = useState<"ventas" | "flujos">("ventas");
    const [page, setPage] = useState(0);

    const [resumen, setResumen] = useState<Resumen[]>([]);
    const [tendencia, setTendencia] = useState<Tendencia[]>([]);
    const [modelos, setModelos] = useState<Modelo[]>([]);
    const [flujos, setFlujos] = useState<Flujo[]>([]);
    const [detalle, setDetalle] = useState<VentaDetalle[]>([]);
    const [pacing, setPacing] = useState<PacingResponse | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(false);
        setPage(0);
        const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
        try {
            const [res, tend, mod, flu, det, pac] = await Promise.all([
                getVentasResumen(params).catch(() => null),
                getVentasTendencia(params).catch(() => null),
                getVentasPorModelo(params).catch(() => null),
                getVentasFlujos(params).catch(() => null),
                getVentasDetalle(params).catch(() => null),
                getVentasCumplimientoPacing(params).catch(() => null),
            ]);
            const anyFailed = !res && !tend && !mod && !flu && !det && !pac;
            if (anyFailed) setFetchError(true);
            setResumen(res ?? []);
            setTendencia(tend ?? []);
            setModelos(mod ?? []);
            setFlujos(flu ?? []);
            setDetalle(det ?? []);
            setPacing(pac ?? null);
        } catch {
            setFetchError(true);
            setResumen([]);
            setTendencia([]);
            setModelos([]);
            setFlujos([]);
            setDetalle([]);
            setPacing(null);
        } finally {
            setLoading(false);
        }
    }, [mes, mui]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived
    const filtered = mui ? resumen.filter(r => r.id_sucursal === mui) : resumen;
    const totalMeta = filtered.reduce((s, r) => s + r.meta, 0);

    // KPIs del mes (prefiere pacing; fallback a resumen)
    const p = pacing?.total;
    const ventasActual = p?.ventas_actual ?? filtered.reduce((s, r) => s + r.total_ventas, 0);
    const meta = p?.plan_total ?? totalMeta;
    const cumplDiario = p?.cumplimiento_vs_plan_pct ?? null;
    const cumplMensual = meta > 0 ? (ventasActual / meta) * 100 : null;
    const varMoM = p?.var_vs_mes_anterior_pct ?? null;
    const varYoY = p?.var_vs_anio_anterior_pct ?? null;

    const pagedDetalle = detalle.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(detalle.length / PAGE_SIZE);

    const fmtSigned = (v: number | null) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
    const colorPct = (v: number | null, goodPositive = true) => {
        if (v == null) return "text-[var(--text-muted)]";
        const good = goodPositive ? v >= 0 : v < 0;
        return good ? "text-[var(--success)]" : "text-[var(--danger)]";
    };
    const cumplOk = (cumplMensual ?? 0) >= 100;

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={4} columns={4} />
                <LoadingState variant="table" count={8} />
            </div>
        );
    }

    return (
        <motion.div className="space-y-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Ventas</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Evoluci&oacute;n diaria, ventas por modelo y KPIs del mes</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <MonthPicker value={mes} onChange={setMes} min="2024-01" />
                    <AgencyPills options={AGENCIES} selected={mui} onChange={(v) => setMui(v as number | null)} />
                </div>
            </div>

            {fetchError && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
                    No se pudieron cargar datos del servidor. Verifica que el backend est&eacute; corriendo en el puerto 8001.
                </div>
            )}

            {/* Tendencia full width */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Evoluci&oacute;n Diaria de Ventas</h3>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Acumulado del mes actual vs plan vs mes anterior vs a&ntilde;o pasado</p>
                    </div>
                    {cumplMensual != null && (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cumplOk ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
                            {cumplMensual.toFixed(1)}% vs Plan Mensual
                        </span>
                    )}
                </div>
                <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={tendencia}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                        <XAxis dataKey="fecha" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                        <Tooltip
                            contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }}
                            labelFormatter={(v: string) => fmtDate(v)}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="ventas_anio_anterior" name="Año pasado" stroke="var(--text-muted)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                        <Line type="monotone" dataKey="ventas_mes_anterior" name="Mes anterior" stroke="var(--text-muted)" strokeWidth={1.5} dot={false} />
                        <Line type="monotone" dataKey="plan_prorrateado" name="Plan" stroke="var(--danger)" strokeWidth={2} strokeDasharray="8 4" dot={false} />
                        <Line type="monotone" dataKey="ventas_acumuladas" name="Mes actual" stroke="var(--brand-primary)" strokeWidth={2.5} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Modelo + KPIs row */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Por modelo */}
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ventas por Modelo</h3>
                    <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">Mix completo &mdash; mes actual</p>
                    <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={modelos} layout="vertical" margin={{ right: 32 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                            <YAxis dataKey="modelo" type="category" width={80} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                            <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }} />
                            <Bar dataKey="unidades" name="Unidades" fill="var(--brand-primary)" radius={[0, 4, 4, 0]}>
                                <LabelList dataKey="unidades" position="right" style={{ fontSize: 11, fill: "var(--text-primary)", fontWeight: 600 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* KPIs del mes */}
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">KPIs del Mes</h3>
                    <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">Resumen al d&iacute;a de hoy</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-[var(--border-color)] p-4">
                            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Unidades Vendidas</div>
                            <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-2xl font-bold text-[var(--text-primary)]">{fmtNumber(ventasActual)}</span>
                                <span className="text-sm text-[var(--text-muted)]">/ {fmtNumber(meta)}</span>
                            </div>
                        </div>
                        <div className="rounded-lg border border-[var(--border-color)] p-4">
                            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">% Cumpl. vs Plan Diario</div>
                            <div className={`mt-2 text-2xl font-bold ${cumplDiario == null ? "text-[var(--text-muted)]" : cumplDiario >= 100 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                                {cumplDiario == null ? "—" : `${cumplDiario.toFixed(1)}%`}
                            </div>
                        </div>
                        <div className="rounded-lg border border-[var(--border-color)] p-4">
                            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Var. MoM</div>
                            <div className={`mt-2 text-2xl font-bold ${colorPct(varMoM)}`}>{fmtSigned(varMoM)}</div>
                        </div>
                        <div className="rounded-lg border border-[var(--border-color)] p-4">
                            <div className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Var. YoY</div>
                            <div className={`mt-2 text-2xl font-bold ${colorPct(varYoY)}`}>{fmtSigned(varYoY)}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-[var(--border-color)] pb-1">
                <button onClick={() => setTab("ventas")} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "ventas" ? "bg-[var(--bg-card)] text-[var(--brand-primary)] border-b-2 border-[var(--brand-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
                    Ventas
                </button>
                <button onClick={() => setTab("flujos")} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === "flujos" ? "bg-[var(--bg-card)] text-[var(--brand-primary)] border-b-2 border-[var(--brand-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
                    Flujos de Piso
                </button>
            </div>

            {tab === "ventas" ? (
                <>
                    {/* Detalle table */}
                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Detalle VINs Vendidos</h3>
                            <span className="text-xs text-[var(--text-muted)]">{fmtNumber(detalle.length)} registros</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                        <th className="pb-2 pr-4">Fecha</th>
                                        <th className="pb-2 pr-4">Sucursal</th>
                                        <th className="pb-2 pr-4">Modelo</th>
                                        <th className="pb-2 pr-4">VIN</th>
                                        <th className="pb-2">Tipo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedDetalle.map((d, i) => (
                                        <tr key={`${d.vin}-${i}`} className="border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-card-hover)]">
                                            <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{fmtDate(d.fecha)}</td>
                                            <td className="py-2.5 pr-4 text-[var(--text-primary)]">{d.sucursal}</td>
                                            <td className="py-2.5 pr-4 text-[var(--text-primary)]">{d.modelo}</td>
                                            <td className="py-2.5 pr-4 font-mono text-xs text-[var(--text-secondary)]">{d.vin}</td>
                                            <td className="py-2.5">
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.venta_contado ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--warning)]/10 text-[var(--warning)]"}`}>
                                                    {d.venta_contado ? "Contado" : "Financiamiento"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="mt-4 flex items-center justify-center gap-2">
                                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs disabled:opacity-30">Anterior</button>
                                <span className="text-xs text-[var(--text-muted)]">P\u00e1gina {page + 1} de {totalPages}</span>
                                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs disabled:opacity-30">Siguiente</button>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                /* Flujos de Piso */
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Flujos de Piso — FreshUp vs Internet</h3>
                    <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={flujos}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="fecha" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                            <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }} />
                            <Legend />
                            <Bar dataKey="freshup" name="FreshUp" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="internet" name="Internet" fill="var(--brand-accent)" radius={[4, 4, 0, 0]} />
                            <Line type="monotone" dataKey="total" name="Total" stroke="var(--text-primary)" strokeWidth={2} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </motion.div>
    );
}
