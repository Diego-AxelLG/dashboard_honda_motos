"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
    getVentasResumen,
    getVentasCumplimientoPacing,
    getVentasDetalle,
    getFinancials,
    getPostventaSummary,
    getCincoAlasResumenActual,
} from "@/lib/api";
import { CLIENT_NAME, AGENCIES } from "@/lib/constants";
import { fmtCurrency, fmtNumber, fmtPct, fmtDate } from "@/lib/utils";
import { LoadingState, AgencyPills, MonthPicker, UltimaActualizacion } from "@/components/ui";

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
    var_pct_yoy: number;
}

interface FinKPI {
    mui: number;
    sucursal: string;
    utilidad_bruta: number;
    utilidad_operacion: number;
    ub_postventa: number;
    gastos_absorcion: number;
    absorcion_pct: number | null;
    ytd_ub: number;
    ytd_uo: number;
    ppto_utilidad_bruta: number;
    ppto_utilidad_operacion: number;
    ppto_ub_postventa: number;
    ppto_ingresos_servicio: number;
}

interface PacingRow {
    mui?: number;
    sucursal?: string;
    ventas_actual: number;
    plan_total: number;
    plan_prorrateado: number;
    cumplimiento_vs_plan_pct: number | null;
    ventas_mes_anterior: number;
    var_vs_mes_anterior_pct: number | null;
    ventas_anio_anterior: number;
    var_vs_anio_anterior_pct: number | null;
}

interface CumplimientoPacing {
    anio_mes: string;
    cutoff_day: number;
    dias_mes: number;
    total: PacingRow;
    sucursales: PacingRow[];
}

interface PVSummary {
    mui: number;
    sucursal: string;
    ots: number;
    horas_mo: number;
    venta_total: number;
    venta_mo: number;
}

interface VentaDetalle {
    fecha: string;
    id_sucursal: number;
    sucursal: string;
    modelo: string;
    vin: string;
    venta_contado: boolean;
    asesor: string | null;
}

interface CincoAlasArea { obtenido: number; maximo: number; penalizacion: number }
interface CincoAlasResumen {
    existe: boolean;
    anio: number;
    trimestre: number;
    puntos_positivos: number;
    penalizaciones: number;
    puntos_netos: number;
    alas: number;
    pct_incentivo: number;
    por_area: Record<string, CincoAlasArea>;
}

interface SucursalVM {
    key: string;
    mui: number | null;
    titulo: string;
    unidades: number;
    meta: number;
    pctCumplimiento: number;
    ritmoVsPlanPct: number | null;
    planProrrateado: number;
    varVsMes: number | null;
    varVsAnio: number | null;
    utilidadBruta: number;
    utilidadOperacion: number;
    utilidadServRef: number;
    absorcionPct: number | null;
    servicio: number;
    pptoUtilidadBruta: number;
    pptoUtilidadOperacion: number;
    pptoUtilidadServRef: number;
    pptoServicio: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

function VarBadge({ value, label }: { value: number | null; label: string }) {
    const isNull = value == null;
    const valueColor = isNull || value === 0
        ? "text-[var(--text-muted)]"
        : value > 0
            ? "text-[var(--success)]"
            : "text-[var(--danger)]";
    const arrow = isNull || value === 0 ? "" : value > 0 ? "\u2191" : "\u2193";
    return (
        <div className="flex min-w-[110px] flex-col items-end rounded-lg bg-[var(--bg-skeleton)]/40 px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</span>
            <span className={`text-base font-bold leading-tight ${valueColor}`}>
                {isNull ? "\u2014" : <>{arrow} {Math.abs(value).toFixed(1)}%</>}
            </span>
        </div>
    );
}

function ProgressBar({ pct, label }: { pct: number | null; label: string }) {
    const value = pct ?? 0;
    const clamped = Math.min(Math.max(value, 0), 120);
    const color = value >= 100 ? "bg-[var(--success)]" : value >= 80 ? "bg-[var(--warning)]" : "bg-[var(--danger)]";
    const textColor = value >= 100 ? "text-[var(--success)]" : value >= 80 ? "text-[var(--warning)]" : "text-[var(--danger)]";
    return (
        <div>
            <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">{label}</span>
                <span className={`font-semibold ${textColor}`}>{pct != null ? fmtPct(value) : "\u2014"}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-skeleton)]">
                <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${(clamped / 120) * 100}%` }} />
            </div>
        </div>
    );
}

function PptoLine({ real, ppto }: { real: number; ppto: number }) {
    if (!ppto) return null;
    const avance = (real / ppto) * 100;
    const color = avance >= 100 ? "text-[var(--success)]"
        : avance >= 80 ? "text-[var(--warning)]"
        : "text-[var(--danger)]";
    return (
        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            ppto {fmtCurrency(ppto)} <span className={`ml-0.5 font-semibold ${color}`}>&middot; {avance.toFixed(1)}%</span>
        </p>
    );
}

function SucursalCard({ vm, expanded, onToggle }: { vm: SucursalVM; expanded: boolean; onToggle: () => void }) {
    const absColor = (vm.absorcionPct ?? 0) < 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]";
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className={`w-full text-left rounded-lg border bg-[var(--bg-card)] p-5 shadow-sm transition-colors cursor-pointer hover:bg-[var(--bg-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40 ${expanded ? "border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]/40" : "border-[var(--border-color)]"}`}
        >

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">{vm.titulo}</p>
                <div className="flex flex-col items-end gap-1.5">
                    <VarBadge value={vm.varVsMes} label="vs mes ant." />
                    <VarBadge value={vm.varVsAnio} label="vs a&ntilde;o ant." />
                </div>
            </div>

            {/* Main number */}
            <p className="mt-3 text-4xl font-bold tracking-tight text-[var(--text-primary)]">{vm.unidades}</p>
            <p className="text-xs text-[var(--text-muted)]">unidades vendidas</p>

            {/* Progress bars */}
            <div className="mt-4 space-y-3">
                <ProgressBar pct={vm.pctCumplimiento} label="Cumplimiento mensual" />
                <ProgressBar pct={vm.ritmoVsPlanPct} label={`Ritmo vs plan (prorrateado: ${vm.planProrrateado})`} />
            </div>

            {/* Meta / Operaciones */}
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--border-color)] pt-3 text-xs">
                <div>
                    <span className="text-[var(--text-muted)]">Meta</span>
                    <p className="text-lg font-semibold text-[var(--text-primary)]">{vm.meta}</p>
                </div>
                <div>
                    <span className="text-[var(--text-muted)]">Operaciones</span>
                    <p className="text-lg font-semibold text-[var(--text-primary)]">{vm.unidades}</p>
                </div>
            </div>

            {/* FINANCIEROS */}
            <div className="mt-4 border-t border-[var(--border-color)] pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Financieros</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div>
                        <span className="text-[var(--text-muted)]">Utilidad Bruta</span>
                        <p className={`text-base font-semibold ${vm.utilidadBruta < 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{fmtCurrency(vm.utilidadBruta)}</p>
                        <PptoLine real={vm.utilidadBruta} ppto={vm.pptoUtilidadBruta} />
                    </div>
                    <div>
                        <span className="text-[var(--text-muted)]">Utilidad Operaci&oacute;n</span>
                        <p className={`text-base font-semibold ${vm.utilidadOperacion < 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{fmtCurrency(vm.utilidadOperacion)}</p>
                    </div>
                    <div>
                        <span className="text-[var(--text-muted)]">Ingresos de Servicio</span>
                        <p className="text-base font-semibold text-[var(--text-primary)]">{fmtCurrency(vm.servicio)}</p>
                        <PptoLine real={vm.servicio} ppto={vm.pptoServicio} />
                    </div>
                    <div>
                        <span className="text-[var(--text-muted)]">Util. Serv. y Refacc.</span>
                        <p className={`text-base font-semibold ${vm.utilidadServRef < 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{fmtCurrency(vm.utilidadServRef)}</p>
                        <PptoLine real={vm.utilidadServRef} ppto={vm.pptoUtilidadServRef} />
                    </div>
                    {vm.key !== "total" && (
                        <div className="col-start-2">
                            <span className="text-[var(--text-muted)]">Tasa Absorci&oacute;n</span>
                            <p className={`text-base font-semibold ${absColor}`}>{vm.absorcionPct != null ? fmtPct(vm.absorcionPct) : "\u2014"}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Click affordance */}
            <div className={`mt-4 flex items-center justify-end gap-1 border-t border-[var(--border-color)] pt-3 text-xs font-medium ${expanded ? "text-[var(--brand-primary)]" : "text-[var(--text-muted)]"}`}>
                <span>{expanded ? "Ocultar detalle" : "Ver detalle de ventas"}</span>
                <span aria-hidden>{expanded ? "\u25b4" : "\u25be"}</span>
            </div>
        </button>
    );
}

function CincoAlasCard({ data }: { data: CincoAlasResumen | null }) {
    if (!data || !data.existe) {
        return (
            <a
                href="/cinco-alas"
                className="block rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-center transition-colors hover:bg-[var(--bg-card-hover)]"
            >
                <p className="text-sm font-semibold text-[var(--text-primary)]">5 Alas &mdash; Sin evaluar</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Captura la evaluación del trimestre actual &rarr;</p>
            </a>
        );
    }
    const v = data.por_area.ventas?.obtenido ?? 0;
    const s = data.por_area.servicio?.obtenido ?? 0;
    const r = data.por_area.refacciones?.obtenido ?? 0;
    const i = data.por_area.imagen?.penalizacion ?? 0;
    return (
        <a
            href="/cinco-alas"
            className="block rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-colors hover:bg-[var(--bg-card-hover)]"
        >
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">5 Alas &mdash; Q{data.trimestre} {data.anio}</p>
                    <div className="mt-1 flex items-center gap-3">
                        <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <svg
                                    key={n}
                                    className={`h-5 w-5 ${n <= data.alas ? "fill-[var(--brand-primary)] text-[var(--brand-primary)]" : "fill-none text-[var(--text-muted)]"}`}
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={1.5}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.724 5.305a1 1 0 00.95.69h5.58c.969 0 1.371 1.24.588 1.81l-4.515 3.28a1 1 0 00-.364 1.118l1.724 5.305c.3.922-.755 1.688-1.54 1.118l-4.515-3.28a1 1 0 00-1.176 0l-4.515 3.28c-.784.57-1.838-.196-1.539-1.118l1.724-5.305a1 1 0 00-.364-1.118L2.098 10.73c-.783-.57-.38-1.81.588-1.81h5.58a1 1 0 00.95-.69l1.724-5.305z" />
                                </svg>
                            ))}
                        </div>
                        <span className="text-2xl font-bold text-[var(--text-primary)]">{data.puntos_netos}</span>
                        <span className="text-xs text-[var(--text-muted)]">pts</span>
                        <span className="ml-1 rounded-full bg-[var(--brand-primary)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--brand-primary)]">
                            {data.pct_incentivo}% incentivo
                        </span>
                    </div>
                </div>
                <div className="flex gap-5 text-xs">
                    <div>
                        <span className="text-[var(--text-muted)]">V: </span>
                        <span className="font-semibold text-[var(--text-primary)]">{v}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-muted)]">S: </span>
                        <span className="font-semibold text-[var(--text-primary)]">{s}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-muted)]">R: </span>
                        <span className="font-semibold text-[var(--text-primary)]">{r}</span>
                    </div>
                    <div>
                        <span className="text-[var(--text-muted)]">I: </span>
                        <span className={`font-semibold ${i < 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{i}</span>
                    </div>
                </div>
            </div>
        </a>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResumenPage() {
    const [mes, setMes] = useState(getCurrentMonth());
    const [mui, setMui] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);

    const [resumen, setResumen] = useState<ResumenRow[]>([]);
    const [pacing, setPacing] = useState<CumplimientoPacing | null>(null);
    const [finKpis, setFinKpis] = useState<FinKPI[]>([]);
    const [pvSummary, setPvSummary] = useState<PVSummary[]>([]);
    const [cincoAlas, setCincoAlas] = useState<CincoAlasResumen | null>(null);
    const [detalle, setDetalle] = useState<VentaDetalle[]>([]);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [detallePage, setDetallePage] = useState(0);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(false);
        setExpandedKey(null);
        setDetallePage(0);
        // Siempre pedir data consolidada (sin filtro mui) para poder construir
        // Total + Tijuana + Mexicali sin re-fetch al cambiar el AgencyPill.
        const params = { anio_mes: mes };
        try {
            const [res, pac, fin, pv, ca, det] = await Promise.all([
                getVentasResumen(params).catch(() => null),
                getVentasCumplimientoPacing(params).catch(() => null),
                getFinancials(params).catch(() => null),
                getPostventaSummary(params).catch(() => null),
                getCincoAlasResumenActual().catch(() => null),
                getVentasDetalle(params).catch(() => null),
            ]);
            if (!res && !fin && !pv && !pac) setFetchError(true);
            setResumen(res ?? []);
            setPacing(pac ?? null);
            setFinKpis(fin?.kpis ?? []);
            setPvSummary(pv ?? []);
            setCincoAlas(ca ?? null);
            setDetalle(det ?? []);
        } catch {
            setFetchError(true);
            setResumen([]);
            setPacing(null);
            setFinKpis([]);
            setPvSummary([]);
            setCincoAlas(null);
            setDetalle([]);
        } finally {
            setLoading(false);
        }
    }, [mes]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ----- Build viewmodels -----

    const ytdFin = mui ? finKpis.filter(f => f.mui === mui) : finKpis;
    const ytdUb = ytdFin.reduce((s, f) => s + (f.ytd_ub ?? 0), 0);
    const ytdUo = ytdFin.reduce((s, f) => s + (f.ytd_uo ?? 0), 0);
    const ytdScope = mui == null
        ? `Total ${CLIENT_NAME}`
        : (ytdFin[0]?.sucursal ?? (mui === 6 ? "Honda Motos Tijuana" : "Honda Motos Mexicali"));

    function buildVM(
        key: string,
        muiId: number | null,
        titulo: string,
        pacingRow: PacingRow | undefined,
    ): SucursalVM {
        const resumenRows = muiId == null ? resumen : resumen.filter(r => r.id_sucursal === muiId);
        const finRows = muiId == null ? finKpis : finKpis.filter(f => f.mui === muiId);
        const pvRows = muiId == null ? pvSummary : pvSummary.filter(p => p.mui === muiId);

        const unidades = resumenRows.reduce((s, r) => s + r.total_ventas, 0);
        const meta = resumenRows.reduce((s, r) => s + r.meta, 0);
        const pctCumplimiento = meta > 0 ? (unidades / meta) * 100 : 0;

        const utilidadBruta = finRows.reduce((s, f) => s + (f.utilidad_bruta ?? 0), 0);
        const utilidadOperacion = finRows.reduce((s, f) => s + (f.utilidad_operacion ?? 0), 0);
        const ubPostventaSum = finRows.reduce((s, f) => s + (f.ub_postventa ?? 0), 0);
        const gastosAbsorcionSum = finRows.reduce((s, f) => s + (f.gastos_absorcion ?? 0), 0);
        const absorcionPct = gastosAbsorcionSum > 0
            ? (ubPostventaSum / gastosAbsorcionSum) * 100
            : null;

        const servicio = pvRows.reduce((s, p) => s + p.venta_total, 0);

        const pptoUtilidadBruta = finRows.reduce((s, f) => s + (f.ppto_utilidad_bruta ?? 0), 0);
        const pptoUtilidadOperacion = finRows.reduce((s, f) => s + (f.ppto_utilidad_operacion ?? 0), 0);
        const pptoUtilidadServRef = finRows.reduce((s, f) => s + (f.ppto_ub_postventa ?? 0), 0);
        const pptoServicio = finRows.reduce((s, f) => s + (f.ppto_ingresos_servicio ?? 0), 0);

        return {
            key,
            mui: muiId,
            titulo,
            unidades,
            meta,
            pctCumplimiento,
            ritmoVsPlanPct: pacingRow?.cumplimiento_vs_plan_pct ?? null,
            planProrrateado: pacingRow?.plan_prorrateado ?? 0,
            varVsMes: pacingRow?.var_vs_mes_anterior_pct ?? null,
            varVsAnio: pacingRow?.var_vs_anio_anterior_pct ?? null,
            utilidadBruta,
            utilidadOperacion,
            utilidadServRef: ubPostventaSum,
            absorcionPct,
            servicio,
            pptoUtilidadBruta,
            pptoUtilidadOperacion,
            pptoUtilidadServRef,
            pptoServicio,
        };
    }

    const totalVM = buildVM("total", null, `Total ${CLIENT_NAME}`, pacing?.total);
    const tjVM = buildVM("tj", 6, "Honda Motos Tijuana", pacing?.sucursales.find(s => s.mui === 6));
    const mxVM = buildVM("mx", 8, "Honda Motos Mexicali", pacing?.sucursales.find(s => s.mui === 8));

    const visibleCards: SucursalVM[] = mui == null
        ? [totalVM, tjVM, mxVM]
        : mui === 6 ? [tjVM] : mui === 8 ? [mxVM] : [totalVM];

    // ----- Detalle expandible -----
    const expandedVM = expandedKey ? visibleCards.find(v => v.key === expandedKey) ?? null : null;
    const detalleFiltrado = expandedVM == null
        ? []
        : expandedVM.mui == null
            ? detalle
            : detalle.filter(d => d.id_sucursal === expandedVM.mui);
    const DETALLE_PAGE_SIZE = 50;
    const detalleTotalPages = Math.ceil(detalleFiltrado.length / DETALLE_PAGE_SIZE);
    const detallePaginado = detalleFiltrado.slice(
        detallePage * DETALLE_PAGE_SIZE,
        (detallePage + 1) * DETALLE_PAGE_SIZE,
    );

    const onToggleCard = (key: string) => {
        setExpandedKey(prev => prev === key ? null : key);
        setDetallePage(0);
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={3} columns={3} />
            </div>
        );
    }

    return (
        <motion.div className="space-y-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            {/* Header + Filters */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Resumen Ejecutivo</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Vista consolidada &mdash; {CLIENT_NAME}</p>
                    <div className="mt-1">
                        <UltimaActualizacion etls={["ventas", "plan_ventas", "postventa_financiero"]} />
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <MonthPicker value={mes} onChange={setMes} min="2026-01" />
                    <AgencyPills options={AGENCIES} selected={mui} onChange={(v) => setMui(v as number | null)} />
                </div>
            </div>

            {fetchError && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
                    No se pudieron cargar datos del servidor. Verifica que el backend est&eacute; corriendo en el puerto 8001.
                </div>
            )}

            {/* Cards por sucursal */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {visibleCards.map(vm => (
                    <SucursalCard
                        key={vm.key}
                        vm={vm}
                        expanded={expandedKey === vm.key}
                        onToggle={() => onToggleCard(vm.key)}
                    />
                ))}
            </div>

            {/* Panel detalle de ventas (expandible) */}
            {expandedVM && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.2 }}
                    className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
                >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                                Detalle de Ventas &mdash; {expandedVM.titulo}
                            </h3>
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">VINs vendidos en {mes}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-[var(--text-muted)]">{fmtNumber(detalleFiltrado.length)} registros</span>
                            <button
                                type="button"
                                onClick={() => setExpandedKey(null)}
                                className="rounded-lg border border-[var(--border-color)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                                aria-label="Cerrar detalle"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                    <th className="pb-2 pr-4">Fecha</th>
                                    <th className="pb-2 pr-4">Sucursal</th>
                                    <th className="pb-2 pr-4">Modelo</th>
                                    <th className="pb-2 pr-4">VIN</th>
                                    <th className="pb-2 pr-4">Tipo</th>
                                    <th className="pb-2">Asesor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {detallePaginado.map((d, i) => (
                                    <tr key={`${d.vin}-${i}`} className="border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-card-hover)]">
                                        <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{fmtDate(d.fecha)}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text-primary)]">{d.sucursal}</td>
                                        <td className="py-2.5 pr-4 text-[var(--text-primary)]">{d.modelo}</td>
                                        <td className="py-2.5 pr-4 font-mono text-xs text-[var(--text-secondary)]">{d.vin}</td>
                                        <td className="py-2.5 pr-4">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.venta_contado ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-[var(--warning)]/10 text-[var(--warning)]"}`}>
                                                {d.venta_contado ? "Contado" : "Financiamiento"}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-[var(--text-primary)]">{d.asesor ?? <span className="text-[var(--text-muted)]">&mdash;</span>}</td>
                                    </tr>
                                ))}
                                {detalleFiltrado.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-6 text-center text-xs text-[var(--text-muted)]">
                                            Sin ventas registradas para esta sucursal en {mes}.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {detalleTotalPages > 1 && (
                        <div className="mt-4 flex items-center justify-center gap-2">
                            <button disabled={detallePage === 0} onClick={() => setDetallePage(p => p - 1)} className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs disabled:opacity-30">Anterior</button>
                            <span className="text-xs text-[var(--text-muted)]">P&aacute;gina {detallePage + 1} de {detalleTotalPages}</span>
                            <button disabled={detallePage >= detalleTotalPages - 1} onClick={() => setDetallePage(p => p + 1)} className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs disabled:opacity-30">Siguiente</button>
                        </div>
                    )}
                </motion.div>
            )}

            {/* Acumulado YTD */}
            {(ytdUb !== 0 || ytdUo !== 0) && (
                <div className="flex flex-wrap gap-6 text-xs text-[var(--text-muted)]">
                    <span>Acumulado {new Date().getFullYear()} &mdash; <strong className="text-[var(--text-secondary)]">{ytdScope}</strong>:</span>
                    <span><strong className={ytdUb < 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}>UB {fmtCurrency(ytdUb)}</strong></span>
                    <span><strong className={ytdUo < 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}>UO {fmtCurrency(ytdUo)}</strong></span>
                </div>
            )}

            {/* 5 Alas — card compacto */}
            <CincoAlasCard data={cincoAlas} />
        </motion.div>
    );
}
