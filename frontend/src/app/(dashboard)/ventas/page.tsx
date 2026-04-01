"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, ComposedChart, Area,
} from "recharts";
import {
    getVentasResumen, getVentasTendencia, getVentasPorModelo,
    getVentasFlujos, getVentasDetalle, getVentasKpisDP,
} from "@/lib/api";
import { AGENCIES } from "@/lib/constants";
import { fmtCurrency, fmtNumber, fmtPct, fmtDate } from "@/lib/utils";
import { KPICard, LoadingState, AgencyPills, MonthPicker } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tendencia { fecha: string; ventas_acumuladas: number; plan_prorrateado: number }
interface Modelo { modelo: string; unidades: number; contado: number; financiamiento: number }
interface Flujo { fecha: string; id_sucursal: number; freshup: number; internet: number; total: number }
interface VentaDetalle { fecha: string; id_sucursal: number; sucursal: string; modelo: string; vin: string; venta_contado: boolean }
interface Resumen { anio_mes: string; id_sucursal: number; sucursal: string; total_ventas: number; ventas_nuevos: number; monto_total: number; meta: number; pct_cumplimiento: number; var_pct_mom: number; var_pct_yoy: number }
interface DPRow { id_sucursal: number; dealer_profile_id: number; nombre: string; valor: number | null; sub_valor: number | null }

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TENDENCIA: Tendencia[] = Array.from({ length: 20 }, (_, i) => ({
    fecha: `2026-03-${String(i + 1).padStart(2, "0")}`,
    ventas_acumuladas: Math.round((i + 1) * 3.8),
    plan_prorrateado: Math.round((i + 1) * 3.1),
}));

const MOCK_MODELOS: Modelo[] = [
    { modelo: "CB 125R", unidades: 25, contado: 18, financiamiento: 7 },
    { modelo: "CB 190R", unidades: 18, contado: 12, financiamiento: 6 },
    { modelo: "XR 150L", unidades: 15, contado: 10, financiamiento: 5 },
    { modelo: "CGL 125", unidades: 12, contado: 9, financiamiento: 3 },
    { modelo: "NX 125", unidades: 8, contado: 5, financiamiento: 3 },
];

const MOCK_FLUJOS: Flujo[] = Array.from({ length: 15 }, (_, i) => ({
    fecha: `2026-03-${String(i + 1).padStart(2, "0")}`,
    id_sucursal: 6,
    freshup: Math.round(Math.random() * 8 + 2),
    internet: Math.round(Math.random() * 5 + 1),
    total: 0,
})).map(f => ({ ...f, total: f.freshup + f.internet }));

const MOCK_DETALLE: VentaDetalle[] = [
    { fecha: "2026-03-22", id_sucursal: 6, sucursal: "Honda Motos Tijuana", modelo: "CB 125R", vin: "LHJCJ1234M0001", venta_contado: true },
    { fecha: "2026-03-21", id_sucursal: 8, sucursal: "Honda Motos Mexicali", modelo: "XR 150L", vin: "LHJCJ5678M0002", venta_contado: false },
];

const MOCK_RESUMEN: Resumen[] = [
    { anio_mes: "2026-03", id_sucursal: 6, sucursal: "Honda Motos Tijuana", total_ventas: 45, ventas_nuevos: 42, monto_total: 12_400_000, meta: 50, pct_cumplimiento: 84, var_pct_mom: 5.2, var_pct_yoy: -2.1 },
    { anio_mes: "2026-03", id_sucursal: 8, sucursal: "Honda Motos Mexicali", total_ventas: 38, ventas_nuevos: 35, monto_total: 8_900_000, meta: 45, pct_cumplimiento: 78, var_pct_mom: -3.8, var_pct_yoy: 1.5 },
];

const MOCK_DP: DPRow[] = [
    { id_sucursal: 6, dealer_profile_id: 1, nombre: "Ventas $", valor: 12_400_000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 2, nombre: "Ventas #", valor: 42, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 3, nombre: "Utilidad bruta", valor: 2_100_000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 4, nombre: "Precio promedio", valor: 295_000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 5, nombre: "Margen promedio", valor: 16.9, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 6, nombre: "Dias venta prom", valor: 28, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 7, nombre: "Inventario disp", valor: 65, sub_valor: null },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dpVal(rows: DPRow[], dpId: number): number | null {
    const match = rows.find(r => r.dealer_profile_id === dpId);
    return match?.valor ?? null;
}

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
    const [tab, setTab] = useState<"ventas" | "flujos">("ventas");
    const [page, setPage] = useState(0);

    const [resumen, setResumen] = useState<Resumen[]>([]);
    const [dpKpis, setDpKpis] = useState<DPRow[]>([]);
    const [tendencia, setTendencia] = useState<Tendencia[]>([]);
    const [modelos, setModelos] = useState<Modelo[]>([]);
    const [flujos, setFlujos] = useState<Flujo[]>([]);
    const [detalle, setDetalle] = useState<VentaDetalle[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setPage(0);
        const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
        try {
            const [res, dp, tend, mod, flu, det] = await Promise.all([
                getVentasResumen(params).catch(() => null),
                getVentasKpisDP(params).catch(() => null),
                getVentasTendencia(params).catch(() => null),
                getVentasPorModelo(params).catch(() => null),
                getVentasFlujos(params).catch(() => null),
                getVentasDetalle(params).catch(() => null),
            ]);
            setResumen(res?.length ? res : MOCK_RESUMEN);
            setDpKpis(dp?.length ? dp : MOCK_DP);
            setTendencia(tend?.length ? tend : MOCK_TENDENCIA);
            setModelos(mod?.length ? mod : MOCK_MODELOS);
            setFlujos(flu?.length ? flu : MOCK_FLUJOS);
            setDetalle(det?.length ? det : MOCK_DETALLE);
        } catch {
            setResumen(MOCK_RESUMEN);
            setDpKpis(MOCK_DP);
            setTendencia(MOCK_TENDENCIA);
            setModelos(MOCK_MODELOS);
            setFlujos(MOCK_FLUJOS);
            setDetalle(MOCK_DETALLE);
        } finally {
            setLoading(false);
        }
    }, [mes, mui]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived
    const filtered = mui ? resumen.filter(r => r.id_sucursal === mui) : resumen;
    const totalVentas = filtered.reduce((s, r) => s + r.total_ventas, 0);
    const totalMeta = filtered.reduce((s, r) => s + r.meta, 0);
    const cumpl = totalMeta > 0 ? (totalVentas / totalMeta) * 100 : 0;
    const avgMom = filtered.length ? filtered.reduce((s, r) => s + r.var_pct_mom, 0) / filtered.length : 0;

    const pagedDetalle = detalle.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(detalle.length / PAGE_SIZE);

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
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Tendencia, modelos y detalle</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <MonthPicker value={mes} onChange={setMes} min="2024-01" />
                    <AgencyPills options={AGENCIES} selected={mui} onChange={(v) => setMui(v as number | null)} />
                </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
                <KPICard title="Ventas #" value={totalVentas} format="number" delta={avgMom} deltaLabel="MoM" />
                <KPICard title="Cumplimiento" value={cumpl} format="percent" subtitle={`meta: ${totalMeta}`} />
                <KPICard title="Ventas $" value={dpVal(dpKpis, 1)} format="currency" />
                <KPICard title="Utilidad Bruta" value={dpVal(dpKpis, 3)} format="currency" />
                <KPICard title="Precio Prom." value={dpVal(dpKpis, 4)} format="currency" />
                <KPICard title="Margen Prom." value={dpVal(dpKpis, 5)} format="percent" />
                <KPICard title="D\u00edas Venta" value={dpVal(dpKpis, 6)} format="number" />
                <KPICard title="Inv. Disponible" value={dpVal(dpKpis, 7)} format="number" />
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
                    {/* Charts row */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {/* Tendencia acumulada */}
                        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                            <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Venta Acumulada vs Plan</h3>
                            <ResponsiveContainer width="100%" height={280}>
                                <LineChart data={tendencia}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                    <XAxis dataKey="fecha" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                                    <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                                    <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }} />
                                    <Legend />
                                    <Line type="monotone" dataKey="ventas_acumuladas" name="Ventas" stroke="var(--brand-primary)" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="plan_prorrateado" name="Plan" stroke="var(--text-muted)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Por modelo */}
                        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                            <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Ventas por Modelo</h3>
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={modelos} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                                    <YAxis dataKey="modelo" type="category" width={80} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                                    <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }} />
                                    <Legend />
                                    <Bar dataKey="contado" name="Contado" stackId="a" fill="var(--brand-primary)" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="financiamiento" name="Financiamiento" stackId="a" fill="var(--brand-accent)" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

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
