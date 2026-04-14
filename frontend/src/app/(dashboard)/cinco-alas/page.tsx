"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    getCincoAlasEvaluacion,
    getCincoAlasEvaluaciones,
    postCincoAlasEvaluacion,
} from "@/lib/api";
import { LoadingState } from "@/components/ui";
import { fmtNumber } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DetalleKpi {
    kpi_codigo: string;
    area: string;
    nombre: string;
    detalle_kpi: string | null;
    puntos_obtenidos: number;
    puntos_maximo: number;
    penalizacion: number;
    penalizacion_max: number;
    es_automatico: boolean;
    notas: string | null;
    evidencia_url: string | null;
    precalculo?: { explicacion?: string; puntos_sugeridos?: number } | null;
}

interface ResumenArea {
    obtenido: number;
    maximo: number;
    penalizacion: number;
}

interface Resumen {
    anio: number;
    trimestre: number;
    puntos_positivos: number;
    penalizaciones: number;
    puntos_netos: number;
    alas: number;
    pct_incentivo: number;
    por_area: Record<string, ResumenArea>;
}

interface Evaluacion {
    existe: boolean;
    id?: number;
    anio: number;
    trimestre: number;
    capturado_por: string | null;
    fecha_captura: string | null;
    notas: string | null;
    detalle: DetalleKpi[];
    resumen: Resumen;
}

interface HistorialRow {
    id: number;
    anio: number;
    trimestre: number;
    capturado_por: string | null;
    puntos_positivos: number;
    penalizaciones: number;
    puntos_netos: number;
    alas: number;
    pct_incentivo: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AREAS: { key: string; label: string; soloPenalizacion?: boolean }[] = [
    { key: "ventas", label: "Área de Ventas" },
    { key: "servicio", label: "Área de Servicio" },
    { key: "refacciones", label: "Área de Refacciones" },
    { key: "imagen", label: "Imagen Corporativa", soloPenalizacion: true },
];

const TRIMESTRES = [1, 2, 3, 4];

function currentYear(): number {
    return new Date().getFullYear();
}
function currentTrimestre(): number {
    return Math.floor(new Date().getMonth() / 3) + 1;
}

function calcAlas(netos: number): { alas: number; pct: number } {
    if (netos >= 356) return { alas: 5, pct: 6 };
    if (netos >= 333) return { alas: 4, pct: 4 };
    if (netos >= 302) return { alas: 3, pct: 3 };
    if (netos >= 271) return { alas: 2, pct: 2 };
    return { alas: 1, pct: 0 };
}

function barColor(pct: number): string {
    if (pct >= 90) return "bg-[var(--success)]";
    if (pct >= 70) return "bg-[var(--warning)]";
    return "bg-[var(--danger)]";
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

function StarRow({ alas }: { alas: number }) {
    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
                <svg
                    key={i}
                    className={`h-7 w-7 ${i <= alas ? "fill-[var(--brand-primary)] text-[var(--brand-primary)]" : "fill-none text-[var(--text-muted)]"}`}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.724 5.305a1 1 0 00.95.69h5.58c.969 0 1.371 1.24.588 1.81l-4.515 3.28a1 1 0 00-.364 1.118l1.724 5.305c.3.922-.755 1.688-1.54 1.118l-4.515-3.28a1 1 0 00-1.176 0l-4.515 3.28c-.784.57-1.838-.196-1.539-1.118l1.724-5.305a1 1 0 00-.364-1.118L2.098 10.73c-.783-.57-.38-1.81.588-1.81h5.58a1 1 0 00.95-.69l1.724-5.305z" />
                </svg>
            ))}
        </div>
    );
}

function ScoreCard({ resumen }: { resumen: Resumen }) {
    const areas = [
        { key: "ventas", label: "Ventas", data: resumen.por_area.ventas },
        { key: "servicio", label: "Servicio", data: resumen.por_area.servicio },
        { key: "refacciones", label: "Refacciones", data: resumen.por_area.refacciones },
    ];
    const imagen = resumen.por_area.imagen;

    return (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-5">
                    <StarRow alas={resumen.alas} />
                    <div>
                        <p className="text-3xl font-bold text-[var(--text-primary)]">
                            {resumen.alas} {resumen.alas === 1 ? "Ala" : "Alas"}
                        </p>
                        <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                            Q{resumen.trimestre} {resumen.anio}
                        </p>
                    </div>
                </div>
                <div className="flex gap-8">
                    <div>
                        <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Puntos Netos</p>
                        <p className="text-3xl font-bold text-[var(--text-primary)]">
                            {fmtNumber(resumen.puntos_netos)}
                            <span className="ml-1 text-sm font-normal text-[var(--text-muted)]">/ 364</span>
                        </p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Incentivo</p>
                        <p className="text-3xl font-bold text-[var(--brand-primary)]">{resumen.pct_incentivo}%</p>
                    </div>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
                {areas.map((a) => {
                    const pct = a.data?.maximo ? (a.data.obtenido / a.data.maximo) * 100 : 0;
                    const clamped = Math.min(Math.max(pct, 0), 100);
                    return (
                        <div key={a.key}>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-[var(--text-secondary)]">{a.label}</span>
                                <span className="font-semibold text-[var(--text-primary)]">
                                    {fmtNumber(a.data?.obtenido ?? 0)} / {fmtNumber(a.data?.maximo ?? 0)}
                                </span>
                            </div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-skeleton)]">
                                <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${clamped}%` }} />
                            </div>
                        </div>
                    );
                })}
                <div>
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">Imagen (penal.)</span>
                        <span className={`font-semibold ${(imagen?.penalizacion ?? 0) < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                            {fmtNumber(imagen?.penalizacion ?? 0)} / -150
                        </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-skeleton)]">
                        <div
                            className={`h-full rounded-full ${(imagen?.penalizacion ?? 0) < 0 ? "bg-[var(--danger)]" : "bg-[var(--success)]"}`}
                            style={{ width: `${Math.min(Math.abs(imagen?.penalizacion ?? 0) / 150 * 100, 100)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function KpiRow({
    kpi,
    onChange,
    soloPenalizacion,
}: {
    kpi: DetalleKpi;
    onChange: (patch: Partial<DetalleKpi>) => void;
    soloPenalizacion: boolean;
}) {
    const [showNotes, setShowNotes] = useState(false);
    const max = kpi.puntos_maximo;
    const penMax = kpi.penalizacion_max;

    return (
        <div className="border-b border-[var(--border-color)]/60 py-3">
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="rounded bg-[var(--bg-skeleton)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)]">
                            {kpi.kpi_codigo}
                        </span>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{kpi.nombre}</p>
                        {kpi.es_automatico && (
                            <span
                                title="Precalculado del DWH — puedes ajustar"
                                className="rounded bg-[var(--brand-primary)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-primary)]"
                            >
                                Auto
                            </span>
                        )}
                    </div>
                    {kpi.detalle_kpi && (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{kpi.detalle_kpi}</p>
                    )}
                    {kpi.precalculo?.explicacion && (
                        <p className="mt-0.5 text-xs italic text-[var(--brand-primary)]">
                            Sugerido: {kpi.precalculo.explicacion}
                        </p>
                    )}
                </div>

                {!soloPenalizacion && max > 0 && (
                    <div className="flex shrink-0 flex-col items-end">
                        <label className="text-[10px] uppercase text-[var(--text-muted)]">
                            Puntos / {fmtNumber(max)}
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={max}
                            step={0.5}
                            value={kpi.puntos_obtenidos}
                            onChange={(e) => {
                                const v = Math.min(Math.max(parseFloat(e.target.value) || 0, 0), max);
                                onChange({ puntos_obtenidos: v });
                            }}
                            className="w-20 rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-right text-sm text-[var(--text-primary)]"
                        />
                    </div>
                )}

                {penMax < 0 && (
                    <div className="flex shrink-0 flex-col items-end">
                        <label className="text-[10px] uppercase text-[var(--text-muted)]">
                            Penal. / {fmtNumber(penMax)}
                        </label>
                        <input
                            type="number"
                            min={penMax}
                            max={0}
                            step={1}
                            value={kpi.penalizacion}
                            onChange={(e) => {
                                const raw = parseFloat(e.target.value) || 0;
                                const v = Math.min(Math.max(raw, penMax), 0);
                                onChange({ penalizacion: v });
                            }}
                            className="w-20 rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-right text-sm text-[var(--danger)]"
                        />
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setShowNotes((v) => !v)}
                    className="shrink-0 rounded border border-[var(--border-color)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]"
                >
                    {showNotes ? "− Notas" : "+ Notas"}
                </button>
            </div>

            {showNotes && (
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_320px]">
                    <textarea
                        value={kpi.notas ?? ""}
                        onChange={(e) => onChange({ notas: e.target.value })}
                        placeholder="Notas del gerente sobre este KPI..."
                        rows={2}
                        className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
                    />
                    <div className="flex items-center gap-2">
                        <input
                            type="url"
                            value={kpi.evidencia_url ?? ""}
                            onChange={(e) => onChange({ evidencia_url: e.target.value })}
                            placeholder="https://drive.google.com/..."
                            className="flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-primary)]"
                        />
                        {kpi.evidencia_url && (
                            <a
                                href={kpi.evidencia_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--brand-primary)] hover:bg-[var(--bg-card-hover)]"
                                title="Abrir evidencia"
                            >
                                ↗
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CincoAlasPage() {
    const [anio, setAnio] = useState(currentYear());
    const [trimestre, setTrimestre] = useState(currentTrimestre());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fetchError, setFetchError] = useState(false);
    const [eval_, setEval] = useState<Evaluacion | null>(null);
    const [historial, setHistorial] = useState<HistorialRow[]>([]);
    const [capturadoPor, setCapturadoPor] = useState("");
    const [notasGenerales, setNotasGenerales] = useState("");

    const fetchData = useCallback(async () => {
        setLoading(true);
        setFetchError(false);
        try {
            const [ev, hist] = await Promise.all([
                getCincoAlasEvaluacion(anio, trimestre).catch(() => null),
                getCincoAlasEvaluaciones().catch(() => []),
            ]);
            if (!ev) setFetchError(true);
            setEval(ev ?? null);
            setHistorial(hist ?? []);
            setCapturadoPor(ev?.capturado_por ?? "");
            setNotasGenerales(ev?.notas ?? "");
        } finally {
            setLoading(false);
        }
    }, [anio, trimestre]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Recalculamos el resumen en vivo con los cambios del form (antes de guardar)
    const resumenLive: Resumen | null = useMemo(() => {
        if (!eval_) return null;
        const porArea: Record<string, ResumenArea> = {
            ventas: { obtenido: 0, maximo: 0, penalizacion: 0 },
            servicio: { obtenido: 0, maximo: 0, penalizacion: 0 },
            refacciones: { obtenido: 0, maximo: 0, penalizacion: 0 },
            imagen: { obtenido: 0, maximo: 0, penalizacion: 0 },
        };
        let pts = 0;
        let pen = 0;
        for (const d of eval_.detalle) {
            const a = porArea[d.area];
            if (a) {
                a.obtenido += d.puntos_obtenidos || 0;
                a.maximo += d.puntos_maximo || 0;
                a.penalizacion += d.penalizacion || 0;
            }
            pts += d.puntos_obtenidos || 0;
            pen += d.penalizacion || 0;
        }
        const netos = pts + pen;
        const { alas, pct } = calcAlas(netos);
        return {
            anio,
            trimestre,
            puntos_positivos: Math.round(pts * 10) / 10,
            penalizaciones: Math.round(pen * 10) / 10,
            puntos_netos: Math.round(netos * 10) / 10,
            alas,
            pct_incentivo: pct,
            por_area: porArea,
        };
    }, [eval_, anio, trimestre]);

    const updateKpi = (codigo: string, patch: Partial<DetalleKpi>) => {
        if (!eval_) return;
        setEval({
            ...eval_,
            detalle: eval_.detalle.map((d) => (d.kpi_codigo === codigo ? { ...d, ...patch } : d)),
        });
    };

    const handleGuardar = async () => {
        if (!eval_) return;
        if (eval_.existe) {
            const ok = window.confirm(`¿Sobrescribir la evaluación Q${trimestre} ${anio}?`);
            if (!ok) return;
        }
        setSaving(true);
        try {
            const payload = {
                anio,
                trimestre,
                capturado_por: capturadoPor || null,
                notas: notasGenerales || null,
                detalle: eval_.detalle.map((d) => ({
                    kpi_codigo: d.kpi_codigo,
                    puntos_obtenidos: d.puntos_obtenidos,
                    penalizacion: d.penalizacion,
                    notas: d.notas,
                    evidencia_url: d.evidencia_url,
                })),
            };
            const updated = await postCincoAlasEvaluacion(payload);
            setEval(updated);
            const hist = await getCincoAlasEvaluaciones().catch(() => []);
            setHistorial(hist ?? []);
        } catch {
            setFetchError(true);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <LoadingState variant="cards" count={1} columns={1} />
                <LoadingState variant="table" count={8} />
            </div>
        );
    }

    return (
        <motion.div className="space-y-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">Evaluación 5 Alas</h1>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        Programa trimestral de evaluación Honda de México &mdash; por grupo
                    </p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={anio}
                        onChange={(e) => setAnio(parseInt(e.target.value))}
                        className="rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                    >
                        {[currentYear() - 1, currentYear(), currentYear() + 1].map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <select
                        value={trimestre}
                        onChange={(e) => setTrimestre(parseInt(e.target.value))}
                        className="rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
                    >
                        {TRIMESTRES.map((t) => (
                            <option key={t} value={t}>Q{t}</option>
                        ))}
                    </select>
                </div>
            </div>

            {fetchError && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
                    No se pudo conectar con el backend. Verifica que esté corriendo en el puerto 8001.
                </div>
            )}

            {/* Score Card */}
            {resumenLive && <ScoreCard resumen={resumenLive} />}

            {/* Formulario */}
            {eval_ && (
                <div className="space-y-6">
                    {AREAS.map((area) => {
                        const kpis = eval_.detalle.filter((d) => d.area === area.key);
                        const areaTotal = resumenLive?.por_area[area.key];
                        return (
                            <div key={area.key} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{area.label}</h3>
                                    <span className="text-xs text-[var(--text-muted)]">
                                        {area.soloPenalizacion
                                            ? `Penalización: ${fmtNumber(areaTotal?.penalizacion ?? 0)}`
                                            : `${fmtNumber(areaTotal?.obtenido ?? 0)} / ${fmtNumber(areaTotal?.maximo ?? 0)} pts`}
                                    </span>
                                </div>
                                <div>
                                    {kpis.map((k) => (
                                        <KpiRow
                                            key={k.kpi_codigo}
                                            kpi={k}
                                            soloPenalizacion={!!area.soloPenalizacion}
                                            onChange={(patch) => updateKpi(k.kpi_codigo, patch)}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {/* Notas generales + Guardar */}
                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr_auto] md:items-end">
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Capturado por</label>
                                <input
                                    type="text"
                                    value={capturadoPor}
                                    onChange={(e) => setCapturadoPor(e.target.value)}
                                    placeholder="Nombre del gerente"
                                    className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Notas generales del trimestre</label>
                                <textarea
                                    value={notasGenerales}
                                    onChange={(e) => setNotasGenerales(e.target.value)}
                                    rows={2}
                                    className="mt-1 w-full rounded border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
                                />
                            </div>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={handleGuardar}
                                className="rounded-lg bg-[var(--brand-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-accent)] disabled:opacity-50"
                            >
                                {saving ? "Guardando..." : eval_.existe ? "Actualizar" : "Guardar evaluación"}
                            </button>
                        </div>
                        {eval_.existe && eval_.fecha_captura && (
                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                                Última captura: {new Date(eval_.fecha_captura).toLocaleString("es-MX")}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Historial */}
            {historial.length > 0 && (
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Historial</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                    <th className="pb-2 pr-4">Periodo</th>
                                    <th className="pb-2 pr-4">Capturado por</th>
                                    <th className="pb-2 pr-4 text-right">Positivos</th>
                                    <th className="pb-2 pr-4 text-right">Penaliz.</th>
                                    <th className="pb-2 pr-4 text-right">Netos</th>
                                    <th className="pb-2 pr-4 text-right">Alas</th>
                                    <th className="pb-2 text-right">Incentivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historial.map((h) => {
                                    const selected = h.anio === anio && h.trimestre === trimestre;
                                    return (
                                        <tr
                                            key={h.id}
                                            className={`cursor-pointer border-b border-[var(--border-color)]/50 transition-colors hover:bg-[var(--bg-card-hover)] ${
                                                selected ? "bg-[var(--brand-primary)]/5" : ""
                                            }`}
                                            onClick={() => {
                                                setAnio(h.anio);
                                                setTrimestre(h.trimestre);
                                            }}
                                        >
                                            <td className="py-2.5 pr-4 font-medium text-[var(--text-primary)]">Q{h.trimestre} {h.anio}</td>
                                            <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{h.capturado_por ?? "—"}</td>
                                            <td className="py-2.5 pr-4 text-right text-[var(--text-secondary)]">{fmtNumber(h.puntos_positivos)}</td>
                                            <td className="py-2.5 pr-4 text-right text-[var(--danger)]">{fmtNumber(h.penalizaciones)}</td>
                                            <td className="py-2.5 pr-4 text-right font-semibold text-[var(--text-primary)]">{fmtNumber(h.puntos_netos)}</td>
                                            <td className="py-2.5 pr-4 text-right text-[var(--brand-primary)]">{h.alas}★</td>
                                            <td className="py-2.5 text-right font-semibold text-[var(--text-primary)]">{h.pct_incentivo}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
