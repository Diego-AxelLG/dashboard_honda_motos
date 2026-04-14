"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import {
    getPostventaSummary, getOsAbiertas, getOsAbiertasDetalle,
    getRefacciones, getUio, getPostventaOtsTendencia,
} from "@/lib/api";
import { AGENCIES } from "@/lib/constants";
import { fmtCurrency, fmtNumber, fmtPct, fmtDate } from "@/lib/utils";
import { KPICard, LoadingState, AgencyPills, MonthPicker } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PVSummary {
    mui: number; sucursal: string;
    ots: number; horas_mo: number;
    venta_total: number; venta_mo: number;
    ticket_promedio: number | null;
    plan_servicio: number; plan_mo: number;
}
interface OsAgregado { mui: number; tipo_orden: string; cantidad_os: number; fecha_snapshot: string }
interface OsDetalle { mui: number; numero_ot: string; vin: string; tipo_orden: string; nombre_asesor: string; nombre_cliente: string; fecha_apertura: string; dias_abierta: number; monto_venta: number; situacion: string; taller: string }
interface Refaccion { mui: number; sucursal: string; movimiento: number; nuevo: number; tec_obsoleto: number; obsoleto: number; total: number }
interface UioRow { mui: number; sucursal: string; uio: number; uio_mp: number; uio_ap: number }
interface OtsPunto { fecha: string; ots_acumuladas: number; ots_mes_anterior: number; ots_anio_anterior: number }
interface OtsTendencia {
    puntos: OtsPunto[];
    totales: { ots_actual: number; ots_mes_anterior: number; ots_anio_anterior: number; var_mom_pct: number | null; var_yoy_pct: number | null } | null;
    cutoff_day: number;
    dias_mes: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIE_COLORS = ["var(--success)", "#3b82f6", "#f59e0b", "var(--danger)"];
const OS_SLA: Record<string, number> = { "Publico con +3 dias": 3, "Garantia con +45 dias": 45, "Interno con +31 dias": 31 };

function getCurrentMonth(): string { return new Date().toISOString().slice(0, 7); }

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PostventaPage() {
    const [mes, setMes] = useState(getCurrentMonth());
    const [mui, setMui] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const [showOsDetalle, setShowOsDetalle] = useState(false);

    const [summary, setSummary] = useState<PVSummary[]>([]);
    const [osAgregado, setOsAgregado] = useState<OsAgregado[]>([]);
    const [osDetalle, setOsDetalle] = useState<OsDetalle[]>([]);
    const [refacciones, setRefacciones] = useState<Refaccion[]>([]);
    const [uio, setUio] = useState<UioRow[]>([]);
    const [otsTend, setOtsTend] = useState<OtsTendencia | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(false);
        const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
        const muiOnly = mui ? { mui } : {};
        try {
            const [pv, os, osDet, ref, u, ots] = await Promise.all([
                getPostventaSummary(params).catch(() => null),
                getOsAbiertas(muiOnly).catch(() => null),
                getOsAbiertasDetalle(muiOnly).catch(() => null),
                getRefacciones(muiOnly).catch(() => null),
                getUio(muiOnly).catch(() => null),
                getPostventaOtsTendencia(params).catch(() => null),
            ]);
            if (!pv && !os && !osDet && !ref && !u && !ots) setFetchError(true);
            setSummary(pv ?? []);
            setOsAgregado(os?.agregado ?? []);
            setOsDetalle(osDet ?? []);
            setRefacciones(ref ?? []);
            setUio(u ?? []);
            setOtsTend(ots ?? null);
        } catch {
            setFetchError(true);
            setSummary([]);
            setOsAgregado([]);
            setOsDetalle([]);
            setRefacciones([]);
            setUio([]);
            setOtsTend(null);
        } finally {
            setLoading(false);
        }
    }, [mes, mui]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived
    const filteredSummary = mui ? summary.filter(s => s.mui === mui) : summary;
    const totalOts = filteredSummary.reduce((s, r) => s + r.ots, 0);
    const totalHoras = filteredSummary.reduce((s, r) => s + r.horas_mo, 0);
    const totalVenta = filteredSummary.reduce((s, r) => s + r.venta_total, 0);
    const totalMO = filteredSummary.reduce((s, r) => s + r.venta_mo, 0);
    const totalPlanServicio = filteredSummary.reduce((s, r) => s + r.plan_servicio, 0);
    const cumplServicio = totalPlanServicio > 0 ? (totalVenta / totalPlanServicio) * 100 : null;
    const ticketProm = totalOts > 0 ? totalVenta / totalOts : null;
    const ticketHrs = totalOts > 0 ? totalHoras / totalOts : null;
    const moXos = totalOts > 0 ? totalMO / totalOts : null;

    // OS agrupadas por tipo
    const filteredOs = mui ? osAgregado.filter(o => o.mui === mui) : osAgregado;
    const osByTipo = filteredOs.reduce<Record<string, number>>((acc, o) => {
        acc[o.tipo_orden] = (acc[o.tipo_orden] ?? 0) + o.cantidad_os;
        return acc;
    }, {});
    const totalOs = Object.values(osByTipo).reduce((s, v) => s + v, 0);

    const filteredRef = mui ? refacciones.filter(r => r.mui === mui) : refacciones;
    const filteredUio = mui ? uio.filter(r => r.mui === mui) : uio;

    // Refacciones pie
    const refTotals = filteredRef.reduce(
        (acc, r) => ({ movimiento: acc.movimiento + r.movimiento, nuevo: acc.nuevo + r.nuevo, tec_obsoleto: acc.tec_obsoleto + r.tec_obsoleto, obsoleto: acc.obsoleto + r.obsoleto }),
        { movimiento: 0, nuevo: 0, tec_obsoleto: 0, obsoleto: 0 },
    );
    const refTotal = refTotals.movimiento + refTotals.nuevo + refTotals.tec_obsoleto + refTotals.obsoleto;
    const pieData = [
        { name: "Movimiento", value: refTotals.movimiento },
        { name: "Nuevo", value: refTotals.nuevo },
        { name: "Tec. Obsoleto", value: refTotals.tec_obsoleto },
        { name: "Obsoleto", value: refTotals.obsoleto },
    ];
    const pctObsoleto = refTotal > 0 ? ((refTotals.tec_obsoleto + refTotals.obsoleto) / refTotal) * 100 : 0;

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={8} columns={4} />
                <LoadingState variant="cards" count={4} columns={4} />
                <LoadingState variant="table" count={6} />
            </div>
        );
    }

    return (
        <motion.div className="space-y-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Postventa</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Servicio, OS abiertas, refacciones y UIO</p>
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

            {/* KPI Row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
                <KPICard title="Venta Total" value={totalVenta || null} format="currency" subtitle={cumplServicio != null ? `${fmtPct(cumplServicio)} vs plan` : undefined} />
                <KPICard title="Venta MO" value={totalMO || null} format="currency" />
                <KPICard title="OTs" value={totalOts || null} format="number" />
                <KPICard title="Horas MO" value={totalHoras || null} format="number" />
                <KPICard title="Ticket Prom $" value={ticketProm} format="currency" />
                <KPICard title="Ticket Prom Hrs" value={ticketHrs} format="number" />
                <KPICard title="MO x O/S" value={moXos} format="currency" />
                <KPICard title="Plan Servicio" value={totalPlanServicio || null} format="currency" subtitle="presupuesto mes" />
            </div>

            {/* OTs — tendencia diaria */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Evoluci&oacute;n Diaria de OTs</h3>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">Acumulado del mes actual vs mes anterior vs a&ntilde;o pasado</p>
                    </div>
                    {otsTend?.totales && (
                        <div className="flex flex-wrap gap-2">
                            {otsTend.totales.var_mom_pct != null && (
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${otsTend.totales.var_mom_pct >= 0 ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
                                    {otsTend.totales.var_mom_pct > 0 ? "+" : ""}{otsTend.totales.var_mom_pct.toFixed(1)}% MoM
                                </span>
                            )}
                            {otsTend.totales.var_yoy_pct != null && (
                                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${otsTend.totales.var_yoy_pct >= 0 ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--danger)]/10 text-[var(--danger)]"}`}>
                                    {otsTend.totales.var_yoy_pct > 0 ? "+" : ""}{otsTend.totales.var_yoy_pct.toFixed(1)}% YoY
                                </span>
                            )}
                        </div>
                    )}
                </div>
                {otsTend && otsTend.puntos.length > 0 ? (
                    <ResponsiveContainer width="100%" height={350}>
                        <LineChart data={otsTend.puntos}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="fecha" tickFormatter={(v: string) => v.slice(8)} tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                            <Tooltip
                                contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }}
                                labelFormatter={(v: string) => fmtDate(v)}
                                formatter={(v: number) => fmtNumber(v)}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Line type="monotone" dataKey="ots_anio_anterior" name="Año pasado" stroke="var(--text-muted)" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                            <Line type="monotone" dataKey="ots_mes_anterior" name="Mes anterior" stroke="var(--text-muted)" strokeWidth={1.5} dot={false} />
                            <Line type="monotone" dataKey="ots_acumuladas" name="Mes actual" stroke="var(--brand-primary)" strokeWidth={2.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="py-8 text-center text-sm text-[var(--text-muted)]">Sin datos de OTs para este mes</p>
                )}
            </div>

            {/* OS Abiertas */}
            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">OS Abiertas Fuera de SLA</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className={`rounded-xl border p-4 ${totalOs > 0 ? "border-[var(--danger)]/50 bg-[var(--danger)]/5" : "border-[var(--border-color)] bg-[var(--bg-card)]"}`}>
                        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Total</p>
                        <p className={`mt-1 text-2xl font-bold ${totalOs > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{totalOs}</p>
                    </div>
                    {Object.entries(osByTipo).map(([tipo, cant]) => (
                        <div key={tipo} className={`rounded-xl border p-4 ${cant > 0 ? "border-[var(--danger)]/50 bg-[var(--danger)]/5" : "border-[var(--border-color)] bg-[var(--bg-card)]"}`}>
                            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{tipo}</p>
                            <p className={`mt-1 text-2xl font-bold ${cant > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{cant}</p>
                            {OS_SLA[tipo] && <p className="text-[10px] text-[var(--text-muted)]">SLA: {OS_SLA[tipo]} d&iacute;as</p>}
                        </div>
                    ))}
                </div>
                {osDetalle.length > 0 && (
                    <>
                        <button onClick={() => setShowOsDetalle(!showOsDetalle)} className="mt-3 text-xs font-medium text-[var(--brand-primary)] hover:underline">
                            {showOsDetalle ? "Ocultar detalle" : "Ver detalle de OS abiertas"}
                        </button>
                        {showOsDetalle && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                            <th className="p-3">OT</th><th className="p-3">VIN</th><th className="p-3">Tipo</th><th className="p-3">Cliente</th><th className="p-3">Asesor</th><th className="p-3">Apertura</th><th className="p-3 text-right">D&iacute;as</th><th className="p-3 text-right">Monto</th><th className="p-3">Situaci&oacute;n</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {osDetalle.map((d) => (
                                            <tr key={d.numero_ot} className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-card-hover)]">
                                                <td className="p-3 font-mono text-xs">{d.numero_ot}</td>
                                                <td className="p-3 font-mono text-xs">{d.vin}</td>
                                                <td className="p-3">{d.tipo_orden}</td>
                                                <td className="p-3">{d.nombre_cliente}</td>
                                                <td className="p-3">{d.nombre_asesor}</td>
                                                <td className="p-3 text-[var(--text-secondary)]">{fmtDate(d.fecha_apertura)}</td>
                                                <td className="p-3 text-right font-bold text-[var(--danger)]">{d.dias_abierta}</td>
                                                <td className="p-3 text-right">{fmtCurrency(d.monto_venta)}</td>
                                                <td className="p-3">{d.situacion}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </motion.div>
                        )}
                    </>
                )}
            </div>

            {/* Bottom row: UIO + Refacciones */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* UIO */}
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Units In Operation (UIO)</h3>
                    <div className="space-y-3">
                        {filteredUio.map(u => (
                            <div key={u.mui} className="rounded-lg border border-[var(--border-color)] p-4">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{u.sucursal}</p>
                                <div className="mt-2 grid grid-cols-3 gap-4 text-center">
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)]">UIO Total</p>
                                        <p className="text-xl font-bold text-[var(--text-primary)]">{fmtNumber(u.uio)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)]">Mantenimiento</p>
                                        <p className="text-xl font-bold text-[var(--success)]">{fmtNumber(u.uio_mp)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)]">No Activos</p>
                                        <p className="text-xl font-bold text-[var(--warning)]">{fmtNumber(u.uio_ap)}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Refacciones */}
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Inventario Refacciones</h3>
                    {pctObsoleto > 60 && (
                        <div className="mb-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-3 py-2 text-xs font-medium text-[var(--danger)]">
                            {fmtPct(pctObsoleto)} del inventario es obsoleto o t&eacute;c. obsoleto
                        </div>
                    )}
                    {refTotal > 0 ? (
                        <>
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                        {pieData.map((_, idx) => (
                                            <Cell key={idx} fill={PIE_COLORS[idx]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: number) => fmtNumber(v)} />
                                </PieChart>
                            </ResponsiveContainer>
                            <p className="mt-2 text-center text-xs text-[var(--text-muted)]">Total: {fmtNumber(refTotal)} items</p>
                        </>
                    ) : (
                        <p className="py-8 text-center text-sm text-[var(--text-muted)]">Sin datos de refacciones</p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
