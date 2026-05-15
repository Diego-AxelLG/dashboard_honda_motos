"use client";

import { useEffect, useRef, useState } from "react";
import type { CompromisoActivo, CompromisoHistorial } from "@/lib/api";
import { fmtDate } from "@/lib/utils";

type Dias = 15 | 30 | 45 | 60;
const DIAS_OPTIONS: Dias[] = [15, 30, 45, 60];

export interface CompromisoSectionProps {
    rowKey: string;
    compromisoActivo: CompromisoActivo | null;
    compromisosVencidos: number;
    onCreate: (comentario: string, dias: Dias) => Promise<void>;
    onEdit: (id: number, comentario: string) => Promise<void>;
    loadHistorial: () => Promise<CompromisoHistorial[]>;
    /** Texto fijo a mostrar en lugar de formulario (ej: facturas empleados). */
    fixedText?: string | null;
}

export default function CompromisoSection({
    rowKey,
    compromisoActivo,
    compromisosVencidos,
    onCreate,
    onEdit,
    loadHistorial,
    fixedText,
}: CompromisoSectionProps) {
    const [comentario, setComentario] = useState("");
    const [dias, setDias] = useState<Dias | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const savingRef = useRef(false);

    const [editing, setEditing] = useState(false);
    const [editComment, setEditComment] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [showHistorial, setShowHistorial] = useState(false);
    const [historial, setHistorial] = useState<CompromisoHistorial[] | null>(null);
    const [loadingHist, setLoadingHist] = useState(false);

    const hasActive = compromisoActivo !== null;
    const commentValid = comentario.trim().length >= 5 && comentario.length <= 1000;
    const canSubmit = commentValid && dias !== null && !saving;

    const handleCreate = async () => {
        if (savingRef.current || !canSubmit || dias === null) return;
        savingRef.current = true;
        setSaving(true);
        setSaveError(null);
        try {
            await onCreate(comentario.trim(), dias);
            setComentario("");
            setDias(null);
        } catch (err) {
            const e = err as { response?: { data?: { detail?: string } } };
            setSaveError(e.response?.data?.detail ?? "Error al guardar el compromiso");
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const handleStartEdit = () => {
        if (!compromisoActivo) return;
        setEditComment(compromisoActivo.comentario);
        setEditError(null);
        setEditing(true);
    };

    const handleSaveEdit = async () => {
        if (!compromisoActivo) return;
        if (editComment.trim().length < 5) {
            setEditError("Minimo 5 caracteres");
            return;
        }
        setEditSaving(true);
        setEditError(null);
        try {
            await onEdit(compromisoActivo.id, editComment.trim());
            setEditing(false);
        } catch (err) {
            const e = err as { response?: { data?: { detail?: string } } };
            setEditError(e.response?.data?.detail ?? "Error al actualizar");
        } finally {
            setEditSaving(false);
        }
    };

    const toggleHistorial = async () => {
        const next = !showHistorial;
        setShowHistorial(next);
        if (next && historial === null) {
            setLoadingHist(true);
            try {
                const data = await loadHistorial();
                setHistorial(data);
            } catch {
                setHistorial([]);
            } finally {
                setLoadingHist(false);
            }
        }
    };

    // Reset cuando cambia la row (drill-down navega a otra factura/OT)
    useEffect(() => {
        setComentario("");
        setDias(null);
        setSaveError(null);
        setEditing(false);
        setShowHistorial(false);
        setHistorial(null);
    }, [rowKey]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    if (fixedText) {
        return (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card-hover)]/40 p-3 text-sm text-[var(--text-muted)] italic">
                {fixedText}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Estado 1: sin compromiso → formulario */}
            {!hasActive && (
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card-hover)]/40 p-3 space-y-2">
                    <div className="text-xs font-medium text-[var(--text-secondary)]">
                        Registrar compromiso
                    </div>
                    <textarea
                        value={comentario}
                        onChange={e => setComentario(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Detalle del compromiso (minimo 5 caracteres)"
                        className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                    {comentario.trim().length > 0 && comentario.trim().length < 5 && (
                        <div className="text-xs text-amber-500">
                            Minimo 5 caracteres ({comentario.trim().length}/5)
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-[var(--text-muted)]">Vence en:</span>
                        {DIAS_OPTIONS.map(d => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDias(d)}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                    dias === d
                                        ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                                        : "border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]/40"
                                }`}
                            >
                                {d}d
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={!canSubmit}
                            className="ml-auto rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? "Guardando..." : "Guardar"}
                        </button>
                    </div>
                    {saveError && <div className="text-xs text-red-500">{saveError}</div>}
                </div>
            )}

            {/* Estado 2/3: compromiso activo */}
            {hasActive && compromisoActivo && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-medium text-blue-400">
                            Compromiso activo
                        </span>
                        <span className="text-[var(--text-muted)]">
                            Vence {fmtDate(compromisoActivo.fecha_compromiso)}
                        </span>
                        {compromisoActivo.dias_restantes !== null && (
                            <span
                                className={`rounded-full px-2 py-0.5 font-medium ${
                                    compromisoActivo.dias_restantes <= 5
                                        ? "bg-amber-500/10 text-amber-400"
                                        : "bg-emerald-500/10 text-emerald-400"
                                }`}
                            >
                                {compromisoActivo.dias_restantes >= 0
                                    ? `${compromisoActivo.dias_restantes}d restantes`
                                    : `Vencido hace ${Math.abs(compromisoActivo.dias_restantes)}d`}
                            </span>
                        )}
                        {!editing && (
                            <button
                                type="button"
                                onClick={handleStartEdit}
                                className="ml-auto text-xs text-[var(--brand-primary)] hover:underline"
                            >
                                Editar
                            </button>
                        )}
                    </div>
                    {!editing ? (
                        <div className="text-sm italic text-[var(--text-primary)]">
                            &ldquo;{compromisoActivo.comentario}&rdquo;
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <textarea
                                value={editComment}
                                onChange={e => setEditComment(e.target.value)}
                                rows={2}
                                maxLength={1000}
                                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                            />
                            {editError && <div className="text-xs text-red-500">{editError}</div>}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditing(false)}
                                    className="rounded-md border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    disabled={editSaving || editComment.trim().length < 5}
                                    className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                >
                                    {editSaving ? "Guardando..." : "Guardar"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Estado 4: historial */}
            {(hasActive || compromisosVencidos > 0) && (
                <div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleHistorial}
                            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
                        >
                            {showHistorial ? "Ocultar" : "Ver"} historial
                        </button>
                        {compromisosVencidos > 0 && (
                            <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    compromisosVencidos >= 3
                                        ? "bg-red-500/10 text-red-400"
                                        : "bg-amber-500/10 text-amber-400"
                                }`}
                            >
                                {compromisosVencidos} vencidos
                            </span>
                        )}
                    </div>
                    {showHistorial && (
                        <div className="mt-2 space-y-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card-hover)]/40 p-2">
                            {loadingHist && (
                                <div className="text-xs text-[var(--text-muted)]">Cargando...</div>
                            )}
                            {!loadingHist && historial && historial.length === 0 && (
                                <div className="text-xs text-[var(--text-muted)]">Sin historial</div>
                            )}
                            {!loadingHist && historial && historial.length > 0 && (
                                <ul className="space-y-1">
                                    {historial.map(h => (
                                        <li
                                            key={h.id}
                                            className="rounded border border-[var(--border-color)] bg-[var(--bg-card)] p-2 text-xs"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className={`rounded-full px-2 py-0.5 font-medium ${
                                                        h.estado === "activo"
                                                            ? "bg-blue-500/10 text-blue-400"
                                                            : h.estado === "vencido"
                                                            ? "bg-red-500/10 text-red-400"
                                                            : "bg-emerald-500/10 text-emerald-400"
                                                    }`}
                                                >
                                                    {h.estado}
                                                </span>
                                                <span className="text-[var(--text-muted)]">
                                                    Vence {fmtDate(h.fecha_compromiso)}
                                                </span>
                                                <span className="ml-auto text-[var(--text-muted)]">
                                                    {h.registrado_por ?? "—"} · {fmtDate(h.fecha_registro)}
                                                </span>
                                            </div>
                                            <div className="mt-1 italic text-[var(--text-primary)]">
                                                &ldquo;{h.comentario}&rdquo;
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
