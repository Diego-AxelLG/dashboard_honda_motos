"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    getVentasResumen,
    getDealerProfileFinanciero,
    getVentasKpisDP,
} from "@/lib/api";
import { CLIENT_NAME, AGENCIES } from "@/lib/constants";
import { fmtCurrency, fmtNumber, fmtPct } from "@/lib/utils";
import { KPICard, DataGrid, LoadingState, AgencyPills, MonthPicker } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResumenRow {
    anio_mes: string;
    id_sucursal: number;
    sucursal: string;
    total_ventas: number;
    ventas_nuevos: number;
    monto_total: number;
    meta: number;
    pct_cumplimiento: number;
    var_pct_mom: number;
    var_pct_yoy: number;
}

interface DPRow {
    id_sucursal: number;
    dealer_profile_id: number;
    nombre: string;
    valor: number | null;
    sub_valor: number | null;
    seccion?: string;
}

interface BranchCard {
    id: number;
    nombre: string;
    ventas: number;
    monto: number;
    cumplimiento: number;
    meta: number;
    servicio: number | null;
    utilidad: number | null;
    absorcion: number | null;
    var_mom: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_RESUMEN: ResumenRow[] = [
    { anio_mes: "2026-03", id_sucursal: 6, sucursal: "Honda Motos Tijuana", total_ventas: 45, ventas_nuevos: 42, monto_total: 12_400_000, meta: 50, pct_cumplimiento: 84, var_pct_mom: 5.2, var_pct_yoy: -2.1 },
    { anio_mes: "2026-03", id_sucursal: 8, sucursal: "Honda Motos Mexicali", total_ventas: 38, ventas_nuevos: 35, monto_total: 8_900_000, meta: 45, pct_cumplimiento: 78, var_pct_mom: -3.8, var_pct_yoy: 1.5 },
];

const MOCK_DP_FIN: { current: DPRow[]; previous: DPRow[] } = {
    current: [
        { id_sucursal: 6, dealer_profile_id: 65, nombre: "Utilidad Neta", valor: 580000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 68, nombre: "ROS", valor: 13.9, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 65, nombre: "Utilidad Neta", valor: 189000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 68, nombre: "ROS", valor: 10.2, sub_valor: null },
    ],
    previous: [
        { id_sucursal: 6, dealer_profile_id: 65, nombre: "Utilidad Neta", valor: 520000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 68, nombre: "ROS", valor: 12.5, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 65, nombre: "Utilidad Neta", valor: 170000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 68, nombre: "ROS", valor: 9.8, sub_valor: null },
    ],
};

const MOCK_DP_VENTAS: DPRow[] = [
    { id_sucursal: 6, dealer_profile_id: 2, nombre: "Ventas #", valor: 42, sub_valor: null },
    { id_sucursal: 8, dealer_profile_id: 2, nombre: "Ventas #", valor: 35, sub_valor: null },
];

const MOCK_DP_SVC: { current: DPRow[]; previous: DPRow[] } = {
    current: [
        { id_sucursal: 6, dealer_profile_id: 29, nombre: "Servicio $", valor: 1_850_000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 38, nombre: "Tasa de absorción", valor: 105.2, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 29, nombre: "Servicio $", valor: 1_200_000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 38, nombre: "Tasa de absorción", valor: 92.1, sub_valor: null },
    ],
    previous: [
        { id_sucursal: 6, dealer_profile_id: 29, nombre: "Servicio $", valor: 1_720_000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 38, nombre: "Tasa de absorción", valor: 102.3, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 29, nombre: "Servicio $", valor: 1_150_000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 38, nombre: "Tasa de absorción", valor: 89.5, sub_valor: null },
    ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dpVal(rows: DPRow[], suc: number | null, dpId: number): number | null {
    const match = rows.filter(r => r.dealer_profile_id === dpId && (suc == null || r.id_sucursal === suc));
    if (match.length === 0) return null;
    if (suc == null) return match.reduce((s, r) => s + (r.valor ?? 0), 0);
    return match[0]?.valor ?? null;
}

function deltaMoM(curr: number | null, prev: number | null): number | null {
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
}

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BranchCardView({ branch }: { branch: BranchCard }) {
    const cumplColor = branch.cumplimiento >= 100 ? "text-[var(--success)]" : branch.cumplimiento >= 80 ? "text-[var(--warning)]" : "text-[var(--danger)]";
    const barPct = Math.min(branch.cumplimiento, 120);
    const barColor = branch.cumplimiento >= 100 ? "bg-[var(--success)]" : branch.cumplimiento >= 80 ? "bg-[var(--warning)]" : "bg-[var(--danger)]";
    const absColor = (branch.absorcion ?? 0) >= 100 ? "text-[var(--success)]" : "text-[var(--danger)]";

    return (
        <div>
            <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{branch.nombre}</p>
                <span className={`text-xs font-medium ${branch.var_mom >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                    {branch.var_mom >= 0 ? "\u2191" : "\u2193"} {Math.abs(branch.var_mom).toFixed(1)}%
                </span>
            </div>

            <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">{branch.ventas}</p>
            <p className="text-xs text-[var(--text-muted)]">unidades vendidas</p>

            <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Cumplimiento</span>
                    <span className={`font-semibold ${cumplColor}`}>{fmtPct(branch.cumplimiento)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-skeleton)]">
                    <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${(barPct / 120) * 100}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">Meta: {branch.meta}</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border-color)] pt-3 text-xs">
                <div>
                    <span className="text-[var(--text-muted)]">Ventas $</span>
                    <p className="font-medium text-[var(--text-primary)]">{fmtCurrency(branch.monto)}</p>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Servicio $</span>
                    <p className="font-medium text-[var(--text-primary)]">{branch.servicio != null ? fmtCurrency(branch.servicio) : "\u2014"}</p>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Utilidad Neta</span>
                    <p className="font-medium text-[var(--text-primary)]">{branch.utilidad != null ? fmtCurrency(branch.utilidad) : "\u2014"}</p>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Tasa Absorci&oacute;n</span>
                    <p className={`font-medium ${absColor}`}>{branch.absorcion != null ? fmtPct(branch.absorcion) : "\u2014"}</p>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResumenPage() {
    const [mes, setMes] = useState(getCurrentMonth());
    const [mui, setMui] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const [resumen, setResumen] = useState<ResumenRow[]>([]);
    const [dpFin, setDpFin] = useState<{ current: DPRow[]; previous: DPRow[] }>({ current: [], previous: [] });
    const [dpSvc, setDpSvc] = useState<{ current: DPRow[]; previous: DPRow[] }>({ current: [], previous: [] });
    const [dpVentas, setDpVentas] = useState<DPRow[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
        try {
            const [res, fin, vkpis] = await Promise.all([
                getVentasResumen(params).catch(() => null),
                getDealerProfileFinanciero(params).catch(() => null),
                getVentasKpisDP(params).catch(() => null),
            ]);
            setResumen(res?.length ? res : MOCK_RESUMEN);
            setDpFin(fin?.current?.length ? fin : MOCK_DP_FIN);
            setDpVentas(vkpis?.length ? vkpis : MOCK_DP_VENTAS);
            // Servicio DP comes from financiero endpoint (P2 includes id 29, 38)
            // We reuse the fin data or mock for service KPIs
            setDpSvc(fin?.current?.length ? fin : MOCK_DP_SVC);
        } catch {
            setResumen(MOCK_RESUMEN);
            setDpFin(MOCK_DP_FIN);
            setDpVentas(MOCK_DP_VENTAS);
            setDpSvc(MOCK_DP_SVC);
        } finally {
            setLoading(false);
        }
    }, [mes, mui]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived KPIs
    const filtered = mui ? resumen.filter(r => r.id_sucursal === mui) : resumen;
    const totalVentas = filtered.reduce((s, r) => s + r.total_ventas, 0);
    const totalMeta = filtered.reduce((s, r) => s + r.meta, 0);
    const cumplimiento = totalMeta > 0 ? (totalVentas / totalMeta) * 100 : 0;
    const avgMom = filtered.length > 0 ? filtered.reduce((s, r) => s + r.var_pct_mom, 0) / filtered.length : 0;

    const utilidadNeta = dpVal(dpFin.current, mui, 65);
    const utilidadPrev = dpVal(dpFin.previous, mui, 65);
    const ros = dpVal(dpFin.current, mui, 68);
    const rosPrev = dpVal(dpFin.previous, mui, 68);
    const servicio = dpVal(dpSvc.current, mui, 29);
    const servicioPrev = dpVal(dpSvc.previous, mui, 29);
    const absorcion = dpVal(dpSvc.current, mui, 38);
    const absorcionPrev = dpVal(dpSvc.previous, mui, 38);

    // Branch cards
    const branches: BranchCard[] = resumen.map(r => ({
        id: r.id_sucursal,
        nombre: r.sucursal,
        ventas: r.total_ventas,
        monto: r.monto_total,
        cumplimiento: r.pct_cumplimiento,
        meta: r.meta,
        servicio: dpVal(dpSvc.current, r.id_sucursal, 29),
        utilidad: dpVal(dpFin.current, r.id_sucursal, 65),
        absorcion: dpVal(dpSvc.current, r.id_sucursal, 38),
        var_mom: r.var_pct_mom,
    }));

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={6} columns={3} />
                <LoadingState variant="cards" count={2} columns={2} />
            </div>
        );
    }

    return (
        <motion.div
            className="space-y-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Header + Filters */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Resumen Ejecutivo</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Vista consolidada — {CLIENT_NAME}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <MonthPicker value={mes} onChange={setMes} min="2024-01" />
                    <AgencyPills options={AGENCIES} selected={mui} onChange={(v) => setMui(v as number | null)} />
                </div>
            </div>

            {/* KPI Cards — 6 cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <KPICard
                    title="Ventas #"
                    value={totalVentas}
                    format="number"
                    subtitle="unidades del mes"
                    delta={avgMom}
                    deltaLabel="MoM"
                />
                <KPICard
                    title="Cumplimiento"
                    value={cumplimiento}
                    format="percent"
                    subtitle={`meta: ${totalMeta}`}
                    delta={cumplimiento - 100}
                    deltaLabel="vs meta"
                />
                <KPICard
                    title="Utilidad Neta"
                    value={utilidadNeta}
                    format="currency"
                    delta={deltaMoM(utilidadNeta, utilidadPrev)}
                    deltaLabel="MoM"
                />
                <KPICard
                    title="Servicio $"
                    value={servicio}
                    format="currency"
                    delta={deltaMoM(servicio, servicioPrev)}
                    deltaLabel="MoM"
                />
                <KPICard
                    title="Tasa Absorci\u00f3n"
                    value={absorcion}
                    format="percent"
                    delta={absorcion != null && absorcionPrev != null ? absorcion - absorcionPrev : null}
                    deltaLabel="MoM"
                />
                <KPICard
                    title="ROS"
                    value={ros}
                    format="percent"
                    subtitle="Return on Sales"
                    delta={ros != null && rosPrev != null ? ros - rosPrev : null}
                    deltaLabel="MoM"
                />
            </div>

            {/* Branch grid */}
            <div>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Por Sucursal</h2>
                <DataGrid<BranchCard>
                    items={branches}
                    getId={(b) => b.id}
                    selectedId={selectedId}
                    onSelect={(b) => setSelectedId(selectedId === b.id ? null : b.id)}
                    columns="grid-cols-1 sm:grid-cols-2"
                    renderCard={(b) => <BranchCardView branch={b} />}
                    renderDetail={(b) => (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                            <div>
                                <span className="text-[var(--text-muted)]">Ventas $</span>
                                <p className="text-lg font-bold text-[var(--text-primary)]">{fmtCurrency(b.monto)}</p>
                            </div>
                            <div>
                                <span className="text-[var(--text-muted)]">Cumplimiento</span>
                                <p className="text-lg font-bold text-[var(--text-primary)]">{fmtPct(b.cumplimiento)}</p>
                            </div>
                            <div>
                                <span className="text-[var(--text-muted)]">Servicio $</span>
                                <p className="text-lg font-bold text-[var(--text-primary)]">{b.servicio != null ? fmtCurrency(b.servicio) : "\u2014"}</p>
                            </div>
                            <div>
                                <span className="text-[var(--text-muted)]">Utilidad Neta</span>
                                <p className="text-lg font-bold text-[var(--text-primary)]">{b.utilidad != null ? fmtCurrency(b.utilidad) : "\u2014"}</p>
                            </div>
                        </div>
                    )}
                />
            </div>
        </motion.div>
    );
}
