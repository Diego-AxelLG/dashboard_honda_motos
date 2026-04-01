"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
    getServicioKpis, getOsAbiertas, getOsAbiertasDetalle,
    getRefacciones, getUio,
} from "@/lib/api";
import { AGENCIES } from "@/lib/constants";
import { fmtCurrency, fmtNumber, fmtPct, fmtDate } from "@/lib/utils";
import { KPICard, LoadingState, AgencyPills, MonthPicker } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServicioKPI { id_sucursal: number; sucursal: string; cantidad_os: number; horas_mo: number; venta_mo: number; venta_total: number }
interface DPRow { id_sucursal: number; dealer_profile_id: number; nombre: string; valor: number | null; sub_valor: number | null }
interface PptoRow { id_sucursal: number; tipo_ppto: string; plan_ppto: number }
interface OsAgregado { id_sucursal: number; tipo_orden: string; cantidad_os: number; fecha_snapshot: string }
interface OsDetalle { id_sucursal: number; numero_ot: string; vin: string; tipo_orden: string; nombre_asesor: string; nombre_cliente: string; fecha_apertura: string; dias_abierta: number; monto_venta: number; situacion: string; taller: string }
interface Refaccion { id_sucursal: number; sucursal: string; movimiento: number; nuevo: number; tec_obsoleto: number; obsoleto: number; total: number }
interface UioRow { id_sucursal: number; sucursal: string; uio: number; uio_mp: number; uio_ap: number }

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_SVC_KPIS: ServicioKPI[] = [
    { id_sucursal: 6, sucursal: "Honda Motos Tijuana", cantidad_os: 320, horas_mo: 1280, venta_mo: 850000, venta_total: 1850000 },
    { id_sucursal: 8, sucursal: "Honda Motos Mexicali", cantidad_os: 240, horas_mo: 960, venta_mo: 620000, venta_total: 1200000 },
];

const MOCK_DP: DPRow[] = [
    { id_sucursal: 6, dealer_profile_id: 29, nombre: "Servicio $", valor: 1850000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 30, nombre: "Cantidad O/S", valor: 320, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 33, nombre: "Facturación MO", valor: 850000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 34, nombre: "Facturación Ref", valor: 680000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 38, nombre: "Tasa absorción", valor: 105.2, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 49, nombre: "Ticket prom $", valor: 5781, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 69, nombre: "Ticket prom hrs", valor: 4.0, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 36, nombre: "MO x O/S", valor: 2656, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 37, nombre: "REF x O/S", valor: 2125, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 41, nombre: "TEMOC", valor: 85.3, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 47, nombre: "Técnicos", valor: 8, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 44, nombre: "Productividad", valor: 72.5, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 48, nombre: "Total Horas MO", valor: 1280, sub_valor: null },
];

const MOCK_OS_DP: DPRow[] = [
    { id_sucursal: 6, dealer_profile_id: 76, nombre: "Total", valor: 15, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 71, nombre: "Público", valor: 8, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 72, nombre: "Garantía", valor: 4, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 74, nombre: "Interno", valor: 3, sub_valor: null },
];

const MOCK_OS_DET: OsDetalle[] = [
    { id_sucursal: 6, numero_ot: "OT2026001", vin: "LHJCJ1234M0001", tipo_orden: "Público", nombre_asesor: "Carlos R.", nombre_cliente: "Juan P.", fecha_apertura: "2026-03-10", dias_abierta: 21, monto_venta: 3500, situacion: "En Taller", taller: "Taller 1" },
];

const MOCK_REF: Refaccion[] = [
    { id_sucursal: 6, sucursal: "Honda Motos Tijuana", movimiento: 250, nuevo: 80, tec_obsoleto: 320, obsoleto: 350, total: 1000 },
    { id_sucursal: 8, sucursal: "Honda Motos Mexicali", movimiento: 200, nuevo: 70, tec_obsoleto: 290, obsoleto: 340, total: 900 },
];

const MOCK_UIO: UioRow[] = [
    { id_sucursal: 6, sucursal: "Honda Motos Tijuana", uio: 5200, uio_mp: 3400, uio_ap: 1800 },
    { id_sucursal: 8, sucursal: "Honda Motos Mexicali", uio: 3800, uio_mp: 2500, uio_ap: 1300 },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIE_COLORS = ["var(--success)", "#3b82f6", "#f59e0b", "var(--danger)"];
const OS_SLA: Record<string, number> = { "Público": 3, "Garantía": 45, "Interno": 31 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dpVal(rows: DPRow[], suc: number | null, dpId: number): number | null {
    const match = rows.filter(r => r.dealer_profile_id === dpId && (suc == null || r.id_sucursal === suc));
    if (!match.length) return null;
    if (suc == null) return match.reduce((s, r) => s + (r.valor ?? 0), 0);
    return match[0]?.valor ?? null;
}

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PostventaPage() {
    const [mes, setMes] = useState(getCurrentMonth());
    const [mui, setMui] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [showOsDetalle, setShowOsDetalle] = useState(false);

    const [svcKpis, setSvcKpis] = useState<ServicioKPI[]>([]);
    const [dp, setDp] = useState<DPRow[]>([]);
    const [ppto, setPpto] = useState<PptoRow[]>([]);
    const [osDp, setOsDp] = useState<DPRow[]>([]);
    const [osDetalle, setOsDetalle] = useState<OsDetalle[]>([]);
    const [refacciones, setRefacciones] = useState<Refaccion[]>([]);
    const [uio, setUio] = useState<UioRow[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
        const muiOnly = mui ? { mui } : {};
        try {
            const [svc, os, osDet, ref, u] = await Promise.all([
                getServicioKpis(params).catch(() => null),
                getOsAbiertas(muiOnly).catch(() => null),
                getOsAbiertasDetalle(muiOnly).catch(() => null),
                getRefacciones(muiOnly).catch(() => null),
                getUio(muiOnly).catch(() => null),
            ]);
            setSvcKpis(svc?.kpis?.length ? svc.kpis : MOCK_SVC_KPIS);
            setDp(svc?.dealer_profile?.length ? svc.dealer_profile : MOCK_DP);
            setPpto(svc?.presupuesto ?? []);
            setOsDp(os?.dealer_profile?.length ? os.dealer_profile : MOCK_OS_DP);
            setOsDetalle(osDet?.length ? osDet : MOCK_OS_DET);
            setRefacciones(ref?.length ? ref : MOCK_REF);
            setUio(u?.length ? u : MOCK_UIO);
        } catch {
            setSvcKpis(MOCK_SVC_KPIS);
            setDp(MOCK_DP);
            setOsDp(MOCK_OS_DP);
            setOsDetalle(MOCK_OS_DET);
            setRefacciones(MOCK_REF);
            setUio(MOCK_UIO);
        } finally {
            setLoading(false);
        }
    }, [mes, mui]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived
    const filteredRef = mui ? refacciones.filter(r => r.id_sucursal === mui) : refacciones;
    const filteredUio = mui ? uio.filter(r => r.id_sucursal === mui) : uio;

    // Refacciones pie data
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

            {/* KPI Row — Principal */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
                <KPICard title="Servicio $" value={dpVal(dp, mui, 29)} format="currency" />
                <KPICard title="Cantidad O/S" value={dpVal(dp, mui, 30)} format="number" />
                <KPICard title="Facturaci\u00f3n MO" value={dpVal(dp, mui, 33)} format="currency" />
                <KPICard title="Facturaci\u00f3n Ref" value={dpVal(dp, mui, 34)} format="currency" />
                <KPICard title="Ticket Prom $" value={dpVal(dp, mui, 49)} format="currency" />
                <KPICard title="Ticket Prom Hrs" value={dpVal(dp, mui, 69)} format="number" />
                <KPICard title="Tasa Absorci\u00f3n" value={dpVal(dp, mui, 38)} format="percent" subtitle={(dpVal(dp, mui, 38) ?? 0) >= 100 ? "Sano" : "Bajo meta"} />
                {ppto.length > 0 && (
                    <KPICard title="Ppto Servicio" value={ppto.reduce((s, p) => s + p.plan_ppto, 0)} format="currency" subtitle="presupuesto mes" />
                )}
            </div>

            {/* Metricas operativas */}
            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">M\u00e9tricas Operativas</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    <KPICard title="MO x O/S" value={dpVal(dp, mui, 36)} format="currency" />
                    <KPICard title="REF x O/S" value={dpVal(dp, mui, 37)} format="currency" />
                    <KPICard title="TEMOC" value={dpVal(dp, mui, 41)} format="percent" />
                    <KPICard title="Total Hrs MO" value={dpVal(dp, mui, 48)} format="number" />
                    <KPICard title="T\u00e9cnicos" value={dpVal(dp, mui, 47)} format="number" />
                    <KPICard title="Productividad" value={dpVal(dp, mui, 44)} format="percent" />
                </div>
            </div>

            {/* OS Abiertas Semaforo */}
            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">OS Abiertas Fuera de SLA</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                        { id: 76, label: "Total", sla: null },
                        { id: 71, label: "P\u00fablico", sla: OS_SLA["Público"] },
                        { id: 72, label: "Garant\u00eda", sla: OS_SLA["Garantía"] },
                        { id: 74, label: "Interno", sla: OS_SLA["Interno"] },
                    ].map(({ id, label, sla }) => {
                        const val = dpVal(osDp, mui, id);
                        const isAlert = val != null && val > 0;
                        return (
                            <div key={id} className={`rounded-xl border p-4 ${isAlert ? "border-[var(--danger)]/50 bg-[var(--danger)]/5" : "border-[var(--border-color)] bg-[var(--bg-card)]"}`}>
                                <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
                                <p className={`mt-1 text-2xl font-bold ${isAlert ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{val ?? 0}</p>
                                {sla && <p className="text-[10px] text-[var(--text-muted)]">SLA: {sla} d\u00edas</p>}
                            </div>
                        );
                    })}
                </div>
                <button onClick={() => setShowOsDetalle(!showOsDetalle)} className="mt-3 text-xs font-medium text-[var(--brand-primary)] hover:underline">
                    {showOsDetalle ? "Ocultar detalle" : "Ver detalle de OS abiertas"}
                </button>
                {showOsDetalle && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                    <th className="p-3">OT</th><th className="p-3">VIN</th><th className="p-3">Tipo</th><th className="p-3">Cliente</th><th className="p-3">Asesor</th><th className="p-3">Apertura</th><th className="p-3 text-right">D\u00edas</th><th className="p-3 text-right">Monto</th><th className="p-3">Situaci\u00f3n</th>
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
                                        <td className={`p-3 text-right font-bold ${d.dias_abierta > (OS_SLA[d.tipo_orden] ?? 30) ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{d.dias_abierta}</td>
                                        <td className="p-3 text-right">{fmtCurrency(d.monto_venta)}</td>
                                        <td className="p-3">{d.situacion}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </motion.div>
                )}
            </div>

            {/* Bottom row: UIO + Refacciones */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* UIO */}
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Units In Operation (UIO)</h3>
                    <div className="space-y-3">
                        {filteredUio.map(u => (
                            <div key={u.id_sucursal} className="rounded-lg border border-[var(--border-color)] p-4">
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
                            {fmtPct(pctObsoleto)} del inventario es obsoleto o t\u00e9c. obsoleto
                        </div>
                    )}
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
                </div>
            </div>
        </motion.div>
    );
}
