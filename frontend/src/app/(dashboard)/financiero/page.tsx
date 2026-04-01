"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { getEdr, getDealerProfileFinanciero, getVentasKpisDP } from "@/lib/api";
import { AGENCIES } from "@/lib/constants";
import { fmtCurrency, fmtNumber, fmtPct } from "@/lib/utils";
import { KPICard, LoadingState, AgencyPills, MonthPicker } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DPRow { id_sucursal: number; dealer_profile_id: number; nombre: string; seccion?: string; valor: number | null; sub_valor: number | null }
interface EdrRow { id_sucursal: number; sucursal: string; seccion: string; rama: string; tipo: string; monto: number }
interface EdrResponse { data: EdrRow[]; solo_presupuesto: boolean; nota: string }

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_FIN: { current: DPRow[]; previous: DPRow[] } = {
    current: [
        { id_sucursal: 6, dealer_profile_id: 65, nombre: "Utilidad Neta", seccion: "Gastos", valor: 580000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 68, nombre: "ROS", seccion: "Gastos", valor: 13.9, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 58, nombre: "Punto de equilibrio", seccion: "Gastos", valor: -19.7, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 60, nombre: "Total gastos", seccion: "Gastos", valor: 3200000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 61, nombre: "Fijos", seccion: "Gastos", valor: 1800000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 62, nombre: "Variables", seccion: "Gastos", valor: 900000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 63, nombre: "Financieros", seccion: "Gastos", valor: 350000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 64, nombre: "Otros", seccion: "Gastos", valor: 150000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 31, nombre: "Utilidad Bruta Servicio", seccion: "Servicio financiero", valor: 720000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 43, nombre: "Inv. refacciones total", seccion: "Servicio financiero", valor: 1000000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 51, nombre: "Inv. nuevo", seccion: "Servicio financiero", valor: null, sub_valor: 8 },
        { id_sucursal: 6, dealer_profile_id: 52, nombre: "Inv. movimiento", seccion: "Servicio financiero", valor: null, sub_valor: 29 },
        { id_sucursal: 6, dealer_profile_id: 53, nombre: "Inv. tec. obsoleto", seccion: "Servicio financiero", valor: null, sub_valor: 32 },
        { id_sucursal: 6, dealer_profile_id: 54, nombre: "Inv. obsoleto", seccion: "Servicio financiero", valor: null, sub_valor: 31 },
        { id_sucursal: 8, dealer_profile_id: 65, nombre: "Utilidad Neta", seccion: "Gastos", valor: 189000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 68, nombre: "ROS", seccion: "Gastos", valor: 10.2, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 58, nombre: "Punto de equilibrio", seccion: "Gastos", valor: 5.1, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 60, nombre: "Total gastos", seccion: "Gastos", valor: 2400000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 61, nombre: "Fijos", seccion: "Gastos", valor: 1400000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 62, nombre: "Variables", seccion: "Gastos", valor: 650000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 63, nombre: "Financieros", seccion: "Gastos", valor: 250000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 64, nombre: "Otros", seccion: "Gastos", valor: 100000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 31, nombre: "Utilidad Bruta Servicio", seccion: "Servicio financiero", valor: 480000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 43, nombre: "Inv. refacciones total", seccion: "Servicio financiero", valor: 900000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 51, nombre: "Inv. nuevo", seccion: "Servicio financiero", valor: null, sub_valor: 7 },
        { id_sucursal: 8, dealer_profile_id: 52, nombre: "Inv. movimiento", seccion: "Servicio financiero", valor: null, sub_valor: 29 },
        { id_sucursal: 8, dealer_profile_id: 53, nombre: "Inv. tec. obsoleto", seccion: "Servicio financiero", valor: null, sub_valor: 33 },
        { id_sucursal: 8, dealer_profile_id: 54, nombre: "Inv. obsoleto", seccion: "Servicio financiero", valor: null, sub_valor: 31 },
    ],
    previous: [
        { id_sucursal: 6, dealer_profile_id: 65, nombre: "Utilidad Neta", valor: 520000, sub_valor: null },
        { id_sucursal: 6, dealer_profile_id: 68, nombre: "ROS", valor: 12.5, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 65, nombre: "Utilidad Neta", valor: 170000, sub_valor: null },
        { id_sucursal: 8, dealer_profile_id: 68, nombre: "ROS", valor: 9.8, sub_valor: null },
    ],
};

const MOCK_EDR: EdrResponse = {
    data: [
        { id_sucursal: 6, sucursal: "Honda Motos Tijuana", seccion: "Ingresos", rama: "Ventas Nuevos", tipo: "Venta", monto: 4500000 },
        { id_sucursal: 6, sucursal: "Honda Motos Tijuana", seccion: "Ingresos", rama: "Servicio", tipo: "MO", monto: 850000 },
        { id_sucursal: 6, sucursal: "Honda Motos Tijuana", seccion: "Costos", rama: "Ventas Nuevos", tipo: "Costo", monto: 3800000 },
        { id_sucursal: 6, sucursal: "Honda Motos Tijuana", seccion: "Gastos", rama: "Operación", tipo: "Fijo", monto: 1800000 },
    ],
    solo_presupuesto: true,
    nota: "Datos contables reales no disponibles. Mostrando presupuesto.",
};

const MOCK_VENTAS_DP: DPRow[] = [
    { id_sucursal: 6, dealer_profile_id: 1, nombre: "Ventas $", valor: 12400000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 2, nombre: "Ventas #", valor: 42, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 3, nombre: "Utilidad bruta", valor: 2100000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 4, nombre: "Precio promedio", valor: 295000, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 5, nombre: "Margen promedio", valor: 16.9, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 6, nombre: "Dias venta prom", valor: 28, sub_valor: null },
    { id_sucursal: 6, dealer_profile_id: 7, nombre: "Inventario disp", valor: 65, sub_valor: null },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIE_COLORS = ["var(--success)", "#3b82f6", "#f59e0b", "var(--danger)"];

const GASTOS_NAMES: Record<number, string> = {
    60: "Total", 61: "Fijos", 62: "Variables", 63: "Financieros", 64: "Otros",
};

const VENTAS_KPI_META: Record<number, { format: "currency" | "number" | "percent"; label: string }> = {
    1: { format: "currency", label: "Ventas $" },
    2: { format: "number", label: "Ventas #" },
    3: { format: "currency", label: "Utilidad Bruta" },
    4: { format: "currency", label: "Precio Prom." },
    5: { format: "percent", label: "Margen Prom." },
    6: { format: "number", label: "D\u00edas Venta" },
    7: { format: "number", label: "Inv. Disponible" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dpVal(rows: DPRow[], suc: number | null, dpId: number): number | null {
    const match = rows.filter(r => r.dealer_profile_id === dpId && (suc == null || r.id_sucursal === suc));
    if (!match.length) return null;
    if (suc == null) return match.reduce((s, r) => s + (r.valor ?? 0), 0);
    return match[0]?.valor ?? null;
}

function dpSubVal(rows: DPRow[], suc: number | null, dpId: number): number | null {
    const match = rows.filter(r => r.dealer_profile_id === dpId && (suc == null || r.id_sucursal === suc));
    if (!match.length) return null;
    return match[0]?.sub_valor ?? null;
}

function deltaMoM(curr: number | null, prev: number | null): number | null {
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
}

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinancieroPage() {
    const [mes, setMes] = useState(getCurrentMonth());
    const [mui, setMui] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    const [dpFin, setDpFin] = useState<{ current: DPRow[]; previous: DPRow[] }>({ current: [], previous: [] });
    const [edr, setEdr] = useState<EdrResponse>({ data: [], solo_presupuesto: true, nota: "" });
    const [ventasDP, setVentasDP] = useState<DPRow[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
        try {
            const [fin, ed, vk] = await Promise.all([
                getDealerProfileFinanciero(params).catch(() => null),
                getEdr(params).catch(() => null),
                getVentasKpisDP(params).catch(() => null),
            ]);
            setDpFin(fin?.current?.length ? fin : MOCK_FIN);
            setEdr(ed?.data?.length ? ed : MOCK_EDR);
            setVentasDP(vk?.length ? vk : MOCK_VENTAS_DP);
        } catch {
            setDpFin(MOCK_FIN);
            setEdr(MOCK_EDR);
            setVentasDP(MOCK_VENTAS_DP);
        } finally {
            setLoading(false);
        }
    }, [mes, mui]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived
    const utilidad = dpVal(dpFin.current, mui, 65);
    const utilidadPrev = dpVal(dpFin.previous, mui, 65);
    const ros = dpVal(dpFin.current, mui, 68);
    const rosPrev = dpVal(dpFin.previous, mui, 68);
    const pe = dpVal(dpFin.current, mui, 58);

    // Gastos breakdown for chart
    const sucursales = mui ? [mui] : [6, 8];
    const gastosChart = sucursales.map(s => {
        const nombre = s === 6 ? "Tijuana" : "Mexicali";
        return {
            sucursal: nombre,
            Fijos: dpVal(dpFin.current, s, 61) ?? 0,
            Variables: dpVal(dpFin.current, s, 62) ?? 0,
            Financieros: dpVal(dpFin.current, s, 63) ?? 0,
            Otros: dpVal(dpFin.current, s, 64) ?? 0,
        };
    });

    // Refacciones pie
    const refPie = [
        { name: "Nuevo", value: dpSubVal(dpFin.current, mui, 51) ?? 0 },
        { name: "Movimiento", value: dpSubVal(dpFin.current, mui, 52) ?? 0 },
        { name: "Tec. Obsoleto", value: dpSubVal(dpFin.current, mui, 53) ?? 0 },
        { name: "Obsoleto", value: dpSubVal(dpFin.current, mui, 54) ?? 0 },
    ];
    const pctObsoleto = (refPie[2].value + refPie[3].value);

    // EdR grouped
    const edrFiltered = mui ? edr.data.filter(r => r.id_sucursal === mui) : edr.data;
    const edrGrouped = edrFiltered.reduce<Record<string, Record<string, number>>>((acc, r) => {
        const key = `${r.seccion} > ${r.rama}`;
        if (!acc[key]) acc[key] = {};
        acc[key][r.tipo] = (acc[key][r.tipo] ?? 0) + r.monto;
        return acc;
    }, {});

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={3} columns={3} />
                <LoadingState variant="cards" count={5} columns={5} />
                <LoadingState variant="table" count={8} />
            </div>
        );
    }

    return (
        <motion.div className="space-y-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Financiero</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Gastos, rentabilidad y estado de resultados</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <MonthPicker value={mes} onChange={setMes} min="2024-01" />
                    <AgencyPills options={AGENCIES} selected={mui} onChange={(v) => setMui(v as number | null)} />
                </div>
            </div>

            {/* Seccion 1: Resumen Ejecutivo */}
            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Resumen Ejecutivo</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <KPICard title="Utilidad Neta" value={utilidad} format="currency" delta={deltaMoM(utilidad, utilidadPrev)} deltaLabel="MoM" />
                    <KPICard title="ROS" value={ros} format="percent" subtitle="Return on Sales" delta={ros != null && rosPrev != null ? ros - rosPrev : null} deltaLabel="MoM" />
                    <KPICard
                        title="Punto de Equilibrio"
                        value={pe}
                        format="percent"
                        subtitle={pe != null && pe < 0 ? "Super\u00e1vit" : "Margen"}
                        invertDelta
                    />
                </div>

                {/* Gastos breakdown chart */}
                <div className="mt-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Desglose de Gastos</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={gastosChart}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="sucursal" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(1)}M`} />
                            <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }} formatter={(v: number) => fmtCurrency(v)} />
                            <Legend />
                            <Bar dataKey="Fijos" stackId="a" fill="var(--brand-primary)" />
                            <Bar dataKey="Variables" stackId="a" fill="var(--brand-accent)" />
                            <Bar dataKey="Financieros" stackId="a" fill="#f59e0b" />
                            <Bar dataKey="Otros" stackId="a" fill="var(--text-muted)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Seccion 2: Rentabilidad Servicio */}
            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Rentabilidad Servicio</h2>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                        <KPICard title="Utilidad Bruta Servicio" value={dpVal(dpFin.current, mui, 31)} format="currency" />
                        <KPICard title="Inv. Refacciones Total" value={dpVal(dpFin.current, mui, 43)} format="currency" />
                    </div>
                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Composici\u00f3n Inventario Refacciones</h3>
                        {pctObsoleto > 60 && (
                            <div className="mb-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-3 py-2 text-xs font-medium text-[var(--danger)]">
                                {fmtPct(pctObsoleto)} del inventario es obsoleto o t\u00e9c. obsoleto
                            </div>
                        )}
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={refPie} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                                    {refPie.map((_, idx) => (
                                        <Cell key={idx} fill={PIE_COLORS[idx]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v: number) => `${v}%`} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Seccion 3: Estado de Resultados Presupuestado */}
            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Estado de Resultados Presupuestado</h2>
                {edr.solo_presupuesto && (
                    <div className="mb-3 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30 px-3 py-2 text-xs font-medium text-[var(--warning)]">
                        {edr.nota || "Datos contables reales no disponibles \u2014 mostrando presupuesto."}
                    </div>
                )}
                <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                <th className="p-3">L\u00ednea</th>
                                <th className="p-3">Tipo</th>
                                <th className="p-3 text-right">Presupuesto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(edrGrouped).map(([line, tipos]) =>
                                Object.entries(tipos).map(([tipo, monto], i) => (
                                    <tr key={`${line}-${tipo}`} className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-card-hover)]">
                                        <td className="p-3 text-[var(--text-primary)]">{i === 0 ? line : ""}</td>
                                        <td className="p-3 text-[var(--text-secondary)]">{tipo}</td>
                                        <td className="p-3 text-right font-medium text-[var(--text-primary)]">{fmtCurrency(monto)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Seccion 4: KPIs Ventas Nuevos (Dealer Profile) */}
            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">KPIs Ventas Nuevos (Dealer Profile)</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
                    {[1, 2, 3, 4, 5, 6, 7].map(id => {
                        const meta = VENTAS_KPI_META[id];
                        const val = dpVal(ventasDP, mui, id);
                        return (
                            <KPICard
                                key={id}
                                title={meta.label}
                                value={val}
                                format={meta.format}
                            />
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
}
