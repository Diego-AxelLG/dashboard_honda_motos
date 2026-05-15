"use client";

import { useEffect, useMemo, useState } from "react";
import { getCobranzaOsSummary, type OSAbiertaSummaryRow } from "@/lib/api";
import { fmtNumber } from "@/lib/utils";
import { LoadingState } from "@/components/ui";
import OSAbiertasDetailPanel from "./OSAbiertasDetailPanel";

export interface OSAbiertasTableProps {
    mui: number | null;
}

interface AgencyKey {
    mui: number;
    sucursal: string;
}

export default function OSAbiertasTable({ mui }: OSAbiertasTableProps) {
    const [data, setData] = useState<OSAbiertaSummaryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [selected, setSelected] = useState<AgencyKey | null>(null);

    useEffect(() => {
        setSelected(null);
    }, [mui]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        getCobranzaOsSummary(mui ?? undefined)
            .then(rows => {
                if (!cancelled) setData(rows);
            })
            .catch(() => {
                if (!cancelled) setError(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [mui]);

    const { agencies, tipos, matrix } = useMemo(() => {
        const agMap = new Map<string, AgencyKey>();
        const tipoSet = new Set<string>();
        const mat = new Map<string, Map<string, number>>();
        for (const r of data) {
            const key = `${r.mui}`;
            if (!agMap.has(key)) agMap.set(key, { mui: r.mui, sucursal: r.sucursal });
            tipoSet.add(r.tipo_orden);
            if (!mat.has(key)) mat.set(key, new Map());
            mat.get(key)!.set(r.tipo_orden, r.cantidad_os);
        }
        return {
            agencies: Array.from(agMap.values()).sort((a, b) => a.sucursal.localeCompare(b.sucursal)),
            tipos: Array.from(tipoSet).sort(),
            matrix: mat,
        };
    }, [data]);

    if (loading) return <LoadingState variant="table" count={4} />;

    if (error) {
        return (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
                Error al cargar OS abiertas. Reintenta en un momento.
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-muted)]">
                Sin OTs fuera de SLA
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
                <table className="w-full text-sm">
                    <thead className="bg-[var(--bg-card-hover)]/50 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                        <tr>
                            <th className="px-4 py-3 text-left">Sucursal</th>
                            {tipos.map(t => (
                                <th key={t} className="px-4 py-3 text-center">{t}</th>
                            ))}
                            <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {agencies.map(a => {
                            const row = matrix.get(`${a.mui}`);
                            const total = tipos.reduce((s, t) => s + (row?.get(t) ?? 0), 0);
                            const isSelected = selected?.mui === a.mui;
                            return (
                                <tr
                                    key={a.mui}
                                    onClick={() =>
                                        setSelected(prev =>
                                            prev?.mui === a.mui ? null : { mui: a.mui, sucursal: a.sucursal }
                                        )
                                    }
                                    className={`cursor-pointer border-t border-[var(--border-color)] transition-colors ${
                                        isSelected
                                            ? "bg-[var(--brand-primary)]/5 ring-1 ring-inset ring-[var(--brand-primary)]/30"
                                            : "hover:bg-[var(--bg-card-hover)]"
                                    }`}
                                >
                                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                                        {a.sucursal}
                                    </td>
                                    {tipos.map(t => {
                                        const v = row?.get(t) ?? 0;
                                        return (
                                            <td key={t} className="px-4 py-3 text-center">
                                                {v > 0 ? (
                                                    <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                                                        {fmtNumber(v)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">0</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                                        {fmtNumber(total)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {selected && (
                <OSAbiertasDetailPanel
                    mui={selected.mui}
                    sucursal={selected.sucursal}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
