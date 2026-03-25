// TEMPLATE: Esta página demuestra el patrón estándar.
// Para un nuevo cliente: 1) Ajustar los KPIs, 2) Cambiar las consultas SQL
// en el backend, 3) Adaptar los nombres de las métricas.

"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { CLIENT_NAME } from "@/lib/constants";
import { fmtCurrency, fmtNumber, fmtPct } from "@/lib/utils";
import { KPICard, DataGrid, LoadingState } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BranchKPI {
    id: number;
    nombre: string;
    ventas: number;
    ingresos: number;
    ticket_promedio: number;
    cumplimiento: number;
    meta: number;
    delta_mom: number;
}

interface SummaryKPIs {
    ventas: number;
    ingresos: number;
    ticket_promedio: number;
    cumplimiento: number;
    delta_ventas: number;
    delta_ingresos: number;
    delta_ticket: number;
    delta_cumplimiento: number;
}

interface SaleDetail {
    id: number;
    fecha: string;
    cliente: string;
    modelo: string;
    monto: number;
    vendedor: string;
}

// ---------------------------------------------------------------------------
// Mock data — fallback cuando la API no responde
// ---------------------------------------------------------------------------

const MOCK_BRANCHES: BranchKPI[] = [
    { id: 1, nombre: "Sucursal Norte",   ventas: 48, ingresos: 12_400_000, ticket_promedio: 258_333, cumplimiento: 92, meta: 52, delta_mom: 5.2 },
    { id: 2, nombre: "Sucursal Centro",  ventas: 63, ingresos: 18_700_000, ticket_promedio: 296_825, cumplimiento: 105, meta: 60, delta_mom: 12.1 },
    { id: 3, nombre: "Sucursal Sur",     ventas: 35, ingresos: 8_900_000,  ticket_promedio: 254_286, cumplimiento: 78, meta: 45, delta_mom: -3.8 },
    { id: 4, nombre: "Sucursal Oriente", ventas: 41, ingresos: 10_200_000, ticket_promedio: 248_780, cumplimiento: 85, meta: 48, delta_mom: 1.5 },
];

const MOCK_DETAILS: Record<number, SaleDetail[]> = {
    1: [
        { id: 101, fecha: "2026-03-22", cliente: "María López",    modelo: "Sedán LX",     monto: 385_000, vendedor: "Carlos R." },
        { id: 102, fecha: "2026-03-21", cliente: "Juan Pérez",     modelo: "SUV Sport",     monto: 520_000, vendedor: "Ana M." },
        { id: 103, fecha: "2026-03-20", cliente: "Roberto García", modelo: "Hatchback EV",  monto: 298_000, vendedor: "Carlos R." },
    ],
    2: [
        { id: 201, fecha: "2026-03-23", cliente: "Laura Torres",   modelo: "Pickup 4x4",   monto: 610_000, vendedor: "Pedro S." },
        { id: 202, fecha: "2026-03-22", cliente: "Diego Ruiz",     modelo: "Sedán Premium",  monto: 445_000, vendedor: "Lucía F." },
    ],
    3: [
        { id: 301, fecha: "2026-03-21", cliente: "Ana Martínez",   modelo: "Crossover HR",  monto: 375_000, vendedor: "Miguel A." },
    ],
    4: [
        { id: 401, fecha: "2026-03-23", cliente: "Fernando Díaz",  modelo: "SUV Sport",     monto: 520_000, vendedor: "Sandra L." },
        { id: 402, fecha: "2026-03-22", cliente: "Patricia Reyes", modelo: "Sedán LX",      monto: 385_000, vendedor: "Sandra L." },
    ],
};

function deriveSummary(branches: BranchKPI[]): SummaryKPIs {
    const ventas = branches.reduce((s, b) => s + b.ventas, 0);
    const ingresos = branches.reduce((s, b) => s + b.ingresos, 0);
    const ticket_promedio = ventas > 0 ? Math.round(ingresos / ventas) : 0;
    const metas = branches.reduce((s, b) => s + b.meta, 0);
    const cumplimiento = metas > 0 ? Math.round((ventas / metas) * 100) : 0;

    return {
        ventas,
        ingresos,
        ticket_promedio,
        cumplimiento,
        delta_ventas: 6.3,
        delta_ingresos: 8.1,
        delta_ticket: 1.7,
        delta_cumplimiento: 4.2,
    };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BranchCard({ branch }: { branch: BranchKPI; isSelected: boolean }) {
    const cumplColor =
        branch.cumplimiento >= 100
            ? "text-[var(--success)]"
            : branch.cumplimiento >= 80
              ? "text-[var(--warning)]"
              : "text-[var(--danger)]";

    const barPct = Math.min(branch.cumplimiento, 120);
    const barColor =
        branch.cumplimiento >= 100
            ? "bg-[var(--success)]"
            : branch.cumplimiento >= 80
              ? "bg-[var(--warning)]"
              : "bg-[var(--danger)]";

    return (
        <div>
            {/* Header */}
            <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {branch.nombre}
                </p>
                <span
                    className={`text-xs font-medium ${
                        branch.delta_mom >= 0
                            ? "text-[var(--success)]"
                            : "text-[var(--danger)]"
                    }`}
                >
                    {branch.delta_mom >= 0 ? "↑" : "↓"}{" "}
                    {Math.abs(branch.delta_mom).toFixed(1)}%
                </span>
            </div>

            {/* Main KPI */}
            <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                {branch.ventas}
            </p>
            <p className="text-xs text-[var(--text-muted)]">unidades vendidas</p>

            {/* Cumplimiento bar */}
            <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Cumplimiento</span>
                    <span className={`font-semibold ${cumplColor}`}>
                        {branch.cumplimiento}%
                    </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-skeleton)]">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${(barPct / 120) * 100}%` }}
                    />
                </div>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    Meta: {branch.meta}
                </p>
            </div>

            {/* Secondary metrics */}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--border-color)] pt-3 text-xs">
                <div>
                    <span className="text-[var(--text-muted)]">Ingresos</span>
                    <p className="font-medium text-[var(--text-primary)]">
                        {fmtCurrency(branch.ingresos)}
                    </p>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Ticket Prom.</span>
                    <p className="font-medium text-[var(--text-primary)]">
                        {fmtCurrency(branch.ticket_promedio)}
                    </p>
                </div>
            </div>
        </div>
    );
}

function DetailPanel({ branch }: { branch: BranchKPI }) {
    const details = MOCK_DETAILS[branch.id] ?? [];

    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Detalle — {branch.nombre}
                </h3>
                <span className="text-xs text-[var(--text-muted)]">
                    {details.length} operaciones recientes
                </span>
            </div>

            {details.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                    Sin operaciones para mostrar.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                <th className="pb-2 pr-4">Fecha</th>
                                <th className="pb-2 pr-4">Cliente</th>
                                <th className="pb-2 pr-4">Modelo</th>
                                <th className="pb-2 pr-4">Vendedor</th>
                                <th className="pb-2 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {details.map((d) => (
                                <tr
                                    key={d.id}
                                    className="border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-card-hover)]"
                                >
                                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                                        {d.fecha}
                                    </td>
                                    <td className="py-2.5 pr-4 text-[var(--text-primary)]">
                                        {d.cliente}
                                    </td>
                                    <td className="py-2.5 pr-4 text-[var(--text-primary)]">
                                        {d.modelo}
                                    </td>
                                    <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                                        {d.vendedor}
                                    </td>
                                    <td className="py-2.5 text-right font-medium text-[var(--text-primary)]">
                                        {fmtCurrency(d.monto)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResumenPage() {
    const [branches, setBranches] = useState<BranchKPI[]>([]);
    const [summary, setSummary] = useState<SummaryKPIs | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    // ── Fetch data ────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        async function fetchData() {
            setLoading(true);
            try {
                const { data } = await api.get<BranchKPI[]>(
                    "/api/v1/kpis/monthly",
                );
                if (!cancelled && data?.length) {
                    setBranches(data);
                    setSummary(deriveSummary(data));
                } else {
                    throw new Error("empty");
                }
            } catch {
                // API unavailable — use mock data
                if (!cancelled) {
                    setBranches(MOCK_BRANCHES);
                    setSummary(deriveSummary(MOCK_BRANCHES));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchData();
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Loading state ─────────────────────────────────────────
    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={4} columns={4} />
                <LoadingState variant="cards" count={4} columns={4} />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Page header */}
            <div>
                <h1 className="text-lg font-bold text-[var(--text-primary)]">
                    Resumen Ejecutivo
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Vista consolidada — {CLIENT_NAME}
                </p>
            </div>

            {/* KPI summary cards */}
            {summary && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KPICard
                        title="Ventas Totales"
                        value={summary.ventas}
                        format="number"
                        subtitle="unidades del mes"
                        delta={summary.delta_ventas}
                        deltaLabel="vs mes anterior"
                    />
                    <KPICard
                        title="Ingresos"
                        value={summary.ingresos}
                        format="currency"
                        delta={summary.delta_ingresos}
                        deltaLabel="vs mes anterior"
                    />
                    <KPICard
                        title="Ticket Promedio"
                        value={summary.ticket_promedio}
                        format="currency"
                        delta={summary.delta_ticket}
                        deltaLabel="vs mes anterior"
                    />
                    <KPICard
                        title="Cumplimiento"
                        value={summary.cumplimiento}
                        format="percent"
                        delta={summary.delta_cumplimiento}
                        deltaLabel="vs mes anterior"
                    />
                </div>
            )}

            {/* Branch grid + detail panel */}
            <div>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Por Sucursal
                </h2>
                <DataGrid<BranchKPI>
                    items={branches}
                    getId={(b) => b.id}
                    selectedId={selectedId}
                    onSelect={(b) =>
                        setSelectedId(selectedId === b.id ? null : b.id)
                    }
                    renderCard={(b, isSelected) => (
                        <BranchCard branch={b} isSelected={isSelected} />
                    )}
                    renderDetail={(b) => <DetailPanel branch={b} />}
                />
            </div>
        </div>
    );
}
