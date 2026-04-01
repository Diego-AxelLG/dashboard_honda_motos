"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer,
} from "recharts";
import { getInventarioAging, getInventarioDetalle } from "@/lib/api";
import { AGENCIES } from "@/lib/constants";
import { fmtNumber } from "@/lib/utils";
import { KPICard, LoadingState, AgencyPills } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Aging {
    id_sucursal: number;
    sucursal: string;
    rango_0_30: number;
    rango_31_60: number;
    rango_61_90: number;
    rango_90_plus: number;
    total_unidades: number;
    edad_promedio: number;
}

interface Detalle {
    id_sucursal: number;
    sucursal: string;
    modelo: string;
    dias_inventario: number;
    estatus: string;
    fecha_snapshot: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_AGING: Aging[] = [
    { id_sucursal: 6, sucursal: "Honda Motos Tijuana", rango_0_30: 25, rango_31_60: 18, rango_61_90: 12, rango_90_plus: 8, total_unidades: 63, edad_promedio: 35.5 },
    { id_sucursal: 8, sucursal: "Honda Motos Mexicali", rango_0_30: 20, rango_31_60: 15, rango_61_90: 10, rango_90_plus: 12, total_unidades: 57, edad_promedio: 42.3 },
];

const MOCK_DETALLE: Detalle[] = [
    { id_sucursal: 6, sucursal: "Honda Motos Tijuana", modelo: "CB 125R", dias_inventario: 95, estatus: "Disponible", fecha_snapshot: "2026-03-30" },
    { id_sucursal: 6, sucursal: "Honda Motos Tijuana", modelo: "XR 150L", dias_inventario: 45, estatus: "Disponible", fecha_snapshot: "2026-03-30" },
    { id_sucursal: 8, sucursal: "Honda Motos Mexicali", modelo: "CB 190R", dias_inventario: 120, estatus: "Disponible", fecha_snapshot: "2026-03-30" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

function agingColor(dias: number): string {
    if (dias <= 30) return "text-[var(--success)]";
    if (dias <= 60) return "text-[var(--warning)]";
    return "text-[var(--danger)]";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InventarioPage() {
    const [mui, setMui] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);

    const [aging, setAging] = useState<Aging[]>([]);
    const [detalle, setDetalle] = useState<Detalle[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setPage(0);
        const params = mui ? { mui } : {};
        try {
            const [ag, det] = await Promise.all([
                getInventarioAging(params).catch(() => null),
                getInventarioDetalle(params).catch(() => null),
            ]);
            setAging(ag?.length ? ag : MOCK_AGING);
            setDetalle(det?.length ? det : MOCK_DETALLE);
        } catch {
            setAging(MOCK_AGING);
            setDetalle(MOCK_DETALLE);
        } finally {
            setLoading(false);
        }
    }, [mui]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived
    const filtered = mui ? aging.filter(r => r.id_sucursal === mui) : aging;
    const totalUnidades = filtered.reduce((s, r) => s + r.total_unidades, 0);
    const avgEdad = filtered.length ? filtered.reduce((s, r) => s + r.edad_promedio * r.total_unidades, 0) / Math.max(totalUnidades, 1) : 0;
    const unidades90 = filtered.reduce((s, r) => s + r.rango_90_plus, 0);

    const chartData = filtered.map(r => ({
        sucursal: r.sucursal.replace("Honda Motos ", ""),
        "0-30 d\u00edas": r.rango_0_30,
        "31-60 d\u00edas": r.rango_31_60,
        "61-90 d\u00edas": r.rango_61_90,
        "90+ d\u00edas": r.rango_90_plus,
    }));

    const pagedDetalle = detalle.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(detalle.length / PAGE_SIZE);

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={3} columns={3} />
                <LoadingState variant="table" count={8} />
            </div>
        );
    }

    return (
        <motion.div className="space-y-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Inventario</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Aging y detalle por VIN</p>
                </div>
                <AgencyPills options={AGENCIES} selected={mui} onChange={(v) => setMui(v as number | null)} />
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KPICard title="Unidades en Piso" value={totalUnidades} format="number" />
                <KPICard title="Edad Promedio" value={avgEdad} format="number" subtitle="d\u00edas" />
                <KPICard title=">90 D\u00edas" value={unidades90} format="number" className={unidades90 > 0 ? "!border-[var(--danger)]/50" : ""} />
            </div>

            {/* Chart */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Distribuci\u00f3n Aging por Sucursal</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                        <XAxis dataKey="sucursal" tick={{ fontSize: 12 }} stroke="var(--text-muted)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                        <Tooltip contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }} />
                        <Legend />
                        <Bar dataKey="0-30 d\u00edas" stackId="a" fill="var(--success)" />
                        <Bar dataKey="31-60 d\u00edas" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="61-90 d\u00edas" stackId="a" fill="#f59e0b" />
                        <Bar dataKey="90+ d\u00edas" stackId="a" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Detalle table */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Detalle por VIN</h3>
                    <span className="text-xs text-[var(--text-muted)]">{fmtNumber(detalle.length)} unidades</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                <th className="pb-2 pr-4">Sucursal</th>
                                <th className="pb-2 pr-4">Modelo</th>
                                <th className="pb-2 pr-4 text-right">D\u00edas en Piso</th>
                                <th className="pb-2">Estatus</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedDetalle.map((d, i) => (
                                <tr key={i} className="border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-card-hover)]">
                                    <td className="py-2.5 pr-4 text-[var(--text-primary)]">{d.sucursal}</td>
                                    <td className="py-2.5 pr-4 text-[var(--text-primary)]">{d.modelo}</td>
                                    <td className={`py-2.5 pr-4 text-right font-bold ${agingColor(d.dias_inventario)}`}>{d.dias_inventario}</td>
                                    <td className="py-2.5 text-[var(--text-secondary)]">{d.estatus}</td>
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
        </motion.div>
    );
}
