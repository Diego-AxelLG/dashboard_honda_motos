"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import {
    getVentasResumen, getVentasTendencia, getVentasPorModelo,
    getVentasCumplimientoPacing, getVentasPorAsesorModelo,
} from "@/lib/api";
import { AGENCIES } from "@/lib/constants";
import { fmtNumber, fmtDate } from "@/lib/utils";
import { LoadingState, AgencyPills, MonthPicker, UltimaActualizacion } from "@/components/ui";

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
interface Resumen { anio_mes: string; id_sucursal: number; sucursal: string; total_ventas: number; ventas_nuevos: number; monto_total: number; meta: number; pct_cumplimiento: number; var_pct_yoy: number }
interface AsesorModeloRow {
    id_vendedor: number;
    asesor: string;
    id_sucursal: number;
    sucursal: string;
    modelo: string;
    unidades: number;
    contado: number;
    financiado: number;
}
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VentasPage() {
    const [mes, setMes] = useState(getCurrentMonth());
    const [mui, setMui] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);

    const [resumen, setResumen] = useState<Resumen[]>([]);
    const [tendencia, setTendencia] = useState<Tendencia[]>([]);
    const [modelos, setModelos] = useState<Modelo[]>([]);
    const [pacing, setPacing] = useState<PacingResponse | null>(null);
    const [asesorModelo, setAsesorModelo] = useState<AsesorModeloRow[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(false);
        const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
        try {
            const [res, tend, mod, pac, am] = await Promise.all([
                getVentasResumen(params).catch(() => null),
                getVentasTendencia(params).catch(() => null),
                getVentasPorModelo(params).catch(() => null),
                getVentasCumplimientoPacing(params).catch(() => null),
                getVentasPorAsesorModelo(params).catch(() => null),
            ]);
            const anyFailed = !res && !tend && !mod && !pac;
            if (anyFailed) setFetchError(true);
            setResumen(res ?? []);
            setTendencia(tend ?? []);
            setModelos(mod ?? []);
            setPacing(pac ?? null);
            setAsesorModelo(am ?? []);
        } catch {
            setFetchError(true);
            setResumen([]);
            setTendencia([]);
            setModelos([]);
            setPacing(null);
            setAsesorModelo([]);
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

    // Ranking de asesores: total + % financiadas + breakdown por modelo
    const ranking = useMemo(() => {
        if (asesorModelo.length === 0) return null;

        type ModeloItem = { modelo: string; unidades: number; contado: number; financiado: number; pctFinan: number };
        type AsesorItem = {
            key: string; nombre: string; sucursal: string;
            total: number; contado: number; financiado: number; pctFinan: number;
            modelos: ModeloItem[];
        };

        const map = new Map<string, AsesorItem>();
        for (const r of asesorModelo) {
            const key = `${r.id_vendedor}|${r.asesor}`;
            if (!map.has(key)) {
                map.set(key, {
                    key, nombre: r.asesor, sucursal: r.sucursal,
                    total: 0, contado: 0, financiado: 0, pctFinan: 0, modelos: [],
                });
            }
            const a = map.get(key)!;
            a.total += r.unidades;
            a.contado += r.contado;
            a.financiado += r.financiado;
            a.modelos.push({
                modelo: r.modelo,
                unidades: r.unidades,
                contado: r.contado,
                financiado: r.financiado,
                pctFinan: r.unidades > 0 ? (r.financiado / r.unidades) * 100 : 0,
            });
        }

        const asesores = Array.from(map.values())
            .map(a => ({
                ...a,
                pctFinan: a.total > 0 ? (a.financiado / a.total) * 100 : 0,
                modelos: a.modelos.sort((x, y) => y.unidades - x.unidades),
            }))
            .sort((a, b) => b.total - a.total);

        const gran = asesores.reduce((s, a) => s + a.total, 0);
        return { asesores, gran };
    }, [asesorModelo]);

    const [asesorAbierto, setAsesorAbierto] = useState<string | null>(null);

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
                    <div className="mt-1">
                        <UltimaActualizacion etls={["ventas", "plan_ventas"]} />
                    </div>
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

            {/* Ranking de Asesores */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ranking de Asesores</h3>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Click en un asesor para ver su desglose por modelo &mdash; {mes}</p>
                    </div>
                    {ranking && (
                        <span className="rounded-full bg-[var(--brand-primary)]/10 px-3 py-1 text-xs font-semibold text-[var(--brand-primary)]">
                            {ranking.asesores.length} asesores &middot; {fmtNumber(ranking.gran)} unidades
                        </span>
                    )}
                </div>

                {!ranking || ranking.asesores.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[var(--text-muted)]">Sin ventas registradas para este periodo.</p>
                ) : (
                    <div className="overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                    <th className="w-10 pb-2 pr-2 text-right">#</th>
                                    <th className="pb-2 pr-4 text-left">Asesor</th>
                                    <th className="pb-2 pr-4 text-left">Sucursal</th>
                                    <th className="pb-2 pr-4 text-right">Unidades</th>
                                    <th className="pb-2 pr-4 text-right">% Financ.</th>
                                    <th className="pb-2 pr-2 text-right">% Total</th>
                                    <th className="w-8 pb-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {ranking.asesores.map((a, idx) => {
                                    const open = asesorAbierto === a.key;
                                    const pctTotal = ranking.gran > 0 ? (a.total / ranking.gran) * 100 : 0;
                                    return (
                                        <Fragment key={a.key}>
                                            <tr
                                                onClick={() => setAsesorAbierto(open ? null : a.key)}
                                                className={`cursor-pointer border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-card-hover)] ${open ? "bg-[var(--bg-card-hover)]" : ""}`}
                                            >
                                                <td className="py-2.5 pr-2 text-right text-xs text-[var(--text-muted)]">{idx + 1}</td>
                                                <td className="py-2.5 pr-4 font-medium text-[var(--text-primary)]">{a.nombre}</td>
                                                <td className="py-2.5 pr-4 text-xs text-[var(--text-secondary)]">{a.sucursal}</td>
                                                <td className="py-2.5 pr-4 text-right font-bold text-[var(--text-primary)]">{a.total}</td>
                                                <td className="py-2.5 pr-4 text-right text-[var(--text-secondary)]">
                                                    <span className="font-medium">{a.pctFinan.toFixed(1)}%</span>
                                                    <span className="ml-1 text-[10px] text-[var(--text-muted)]">({a.financiado}/{a.total})</span>
                                                </td>
                                                <td className="py-2.5 pr-2 text-right text-xs text-[var(--text-secondary)]">{pctTotal.toFixed(1)}%</td>
                                                <td className="py-2.5 text-center text-xs text-[var(--text-muted)]" aria-hidden>{open ? "▴" : "▾"}</td>
                                            </tr>
                                            <AnimatePresence initial={false}>
                                                {open && (
                                                    <tr>
                                                        <td colSpan={7} className="bg-[var(--bg-skeleton)]/30 p-0">
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: "auto" }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                transition={{ duration: 0.18 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="px-6 py-4">
                                                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                                                        Desglose por modelo &mdash; {a.modelos.length} modelos
                                                                    </p>
                                                                    <div className="flex flex-col divide-y divide-[var(--border-color)]/40">
                                                                        {a.modelos.map(m => {
                                                                            const barPct = a.total > 0 ? (m.unidades / a.total) * 100 : 0;
                                                                            return (
                                                                                <div key={m.modelo} className="flex items-center gap-4 py-2">
                                                                                    <div className="w-32 shrink-0 text-sm font-medium text-[var(--text-primary)]">{m.modelo}</div>
                                                                                    <div className="flex-1">
                                                                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-skeleton)]">
                                                                                            <div
                                                                                                className="h-full bg-[var(--brand-primary)]"
                                                                                                style={{ width: `${barPct}%` }}
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="w-16 shrink-0 text-right text-sm font-bold text-[var(--text-primary)]">{m.unidades}</div>
                                                                                    <div className="w-28 shrink-0 text-right text-xs text-[var(--text-secondary)]">
                                                                                        {m.pctFinan.toFixed(0)}% finan.
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </AnimatePresence>
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
