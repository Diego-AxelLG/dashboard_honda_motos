"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer,
} from "recharts";
import { getFinancials } from "@/lib/api";
import { AGENCIES } from "@/lib/constants";
import { fmtCurrency } from "@/lib/utils";
import { KPICard, LoadingState, AgencyPills, MonthPicker, UltimaActualizacion } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinKPI {
    mui: number;
    sucursal: string;
    utilidad_bruta: number;
    utilidad_operacion: number;
    ub_postventa: number;
    gastos_fijos: number;
    gastos_variables: number;
    gastos_financieros: number;
    gastos_otros: number;
    absorcion_pct: number | null;
    ppto_utilidad_bruta: number;
    ppto_utilidad_operacion: number;
}

interface EdrRow {
    mui: number;
    sucursal: string;
    seccion: string;
    rama: string;
    tipo: string;
    monto: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    const [fetchError, setFetchError] = useState(false);

    const [kpis, setKpis] = useState<FinKPI[]>([]);
    const [edrReales, setEdrReales] = useState<EdrRow[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(false);
        const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
        try {
            const data = await getFinancials(params).catch(() => null);
            if (!data) {
                setFetchError(true);
                setKpis([]);
                setEdrReales([]);
            } else {
                setKpis(data.kpis ?? []);
                setEdrReales(data.edr_reales ?? []);
            }
        } catch {
            setFetchError(true);
            setKpis([]);
            setEdrReales([]);
        } finally {
            setLoading(false);
        }
    }, [mes, mui]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived
    const filtered = mui ? kpis.filter(k => k.mui === mui) : kpis;
    const uo = filtered.reduce((s, k) => s + k.utilidad_operacion, 0);
    const ub = filtered.reduce((s, k) => s + k.utilidad_bruta, 0);
    const absorcion = filtered.length === 1 ? filtered[0].absorcion_pct : null;

    // Gastos chart
    const gastosChart = kpis.map(k => ({
        sucursal: k.sucursal.replace("Honda Motos ", ""),
        Fijos: k.gastos_fijos,
        Variables: k.gastos_variables,
        Financieros: k.gastos_financieros,
        Otros: k.gastos_otros,
    }));

    // EdR grouped (reales)
    const edrFiltered = mui ? edrReales.filter(r => r.mui === mui) : edrReales;
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
                    <div className="mt-1">
                        <UltimaActualizacion etls={["postventa_financiero"]} />
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

            {/* Resumen Ejecutivo */}
            <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Resumen Ejecutivo</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <KPICard title="Utilidad Bruta" value={ub || null} format="currency" />
                    <KPICard title="Utilidad Operaci\u00f3n" value={uo || null} format="currency" />
                    <KPICard title="Tasa Absorci\u00f3n" value={absorcion} format="percent" subtitle={(absorcion ?? 0) >= 100 ? "Sano" : "Bajo meta"} />
                </div>

                {/* Gastos chart */}
                {gastosChart.length > 0 && (
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
                )}
            </div>

            {/* Presupuesto vs Real por sucursal */}
            {kpis.length > 0 && (
                <div>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Real vs Presupuesto</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {filtered.map(k => (
                            <div key={k.mui} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{k.sucursal}</p>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <span className="text-[var(--text-muted)]">UB Real</span>
                                        <p className="font-medium text-[var(--text-primary)]">{fmtCurrency(k.utilidad_bruta)}</p>
                                    </div>
                                    <div>
                                        <span className="text-[var(--text-muted)]">UB Ppto</span>
                                        <p className="font-medium text-[var(--text-secondary)]">{fmtCurrency(k.ppto_utilidad_bruta)}</p>
                                    </div>
                                    <div>
                                        <span className="text-[var(--text-muted)]">UO Real</span>
                                        <p className="font-medium text-[var(--text-primary)]">{fmtCurrency(k.utilidad_operacion)}</p>
                                    </div>
                                    <div>
                                        <span className="text-[var(--text-muted)]">UO Ppto</span>
                                        <p className="font-medium text-[var(--text-secondary)]">{fmtCurrency(k.ppto_utilidad_operacion)}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Estado de Resultados detalle */}
            {Object.keys(edrGrouped).length > 0 && (
                <div>
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">Estado de Resultados</h2>
                    <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                    <th className="p-3">L&iacute;nea</th>
                                    <th className="p-3">Tipo</th>
                                    <th className="p-3 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(edrGrouped).map(([line, tipos]) =>
                                    Object.entries(tipos).map(([tipo, monto], i) => (
                                        <tr key={`${line}-${tipo}`} className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-card-hover)]">
                                            <td className="p-3 text-[var(--text-primary)]">{i === 0 ? line : ""}</td>
                                            <td className="p-3 text-[var(--text-secondary)]">{tipo}</td>
                                            <td className={`p-3 text-right font-medium ${monto < 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{fmtCurrency(monto)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
