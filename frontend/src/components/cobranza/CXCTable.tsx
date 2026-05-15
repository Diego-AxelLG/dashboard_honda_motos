"use client";

import { useEffect, useMemo, useState } from "react";
import { getCobranzaCxcSummary, type CXCSummaryRow } from "@/lib/api";
import { fmtCurrency, fmtNumber } from "@/lib/utils";
import { LoadingState } from "@/components/ui";
import CXCDetailPanel from "./CXCDetailPanel";

export interface CXCTableProps {
    mui: number | null;
}

interface AgencyKey {
    mui: number;
    sucursal: string;
}

// Categorias excluidas del cálculo de "Saldo total" (mostradas pero no sumadas).
// Convencion del negocio: facturas a empleados no son cobranza real (descuento via nomina).
const EXCLUDE_FROM_SALDO = new Set(["Facturas empleados"]);

export default function CXCTable({ mui }: CXCTableProps) {
    const [data, setData] = useState<CXCSummaryRow[]>([]);
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
        getCobranzaCxcSummary(mui ?? undefined)
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

    const { agencies, categorias, matrix } = useMemo(() => {
        const agMap = new Map<string, AgencyKey>();
        const cats = new Set<string>();
        const mat = new Map<string, Map<string, { cantidad: number; saldo: number }>>();
        for (const row of data) {
            const key = `${row.mui}`;
            if (!agMap.has(key)) agMap.set(key, { mui: row.mui, sucursal: row.sucursal });
            cats.add(row.categoria);
            if (!mat.has(key)) mat.set(key, new Map());
            mat.get(key)!.set(row.categoria, {
                cantidad: row.cantidad_cxc,
                saldo: row.saldo_total,
            });
        }
        return {
            agencies: Array.from(agMap.values()).sort((a, b) => a.sucursal.localeCompare(b.sucursal)),
            categorias: Array.from(cats).sort(),
            matrix: mat,
        };
    }, [data]);

    if (loading) return <LoadingState variant="table" count={4} />;

    if (error) {
        return (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
                Error al cargar CxC. Reintenta en un momento.
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-muted)]">
                Sin facturas vencidas registradas
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
                            {categorias.map(c => (
                                <th key={c} className="px-4 py-3 text-center">{c}</th>
                            ))}
                            <th className="px-4 py-3 text-right">Total</th>
                            <th className="px-4 py-3 text-right">Saldo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {agencies.map(a => {
                            const row = matrix.get(`${a.mui}`);
                            const totalCantidad = categorias.reduce(
                                (s, c) => s + (row?.get(c)?.cantidad ?? 0),
                                0
                            );
                            const totalSaldo = categorias.reduce((s, c) => {
                                if (EXCLUDE_FROM_SALDO.has(c)) return s;
                                return s + (row?.get(c)?.saldo ?? 0);
                            }, 0);
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
                                    {categorias.map(c => {
                                        const cell = row?.get(c);
                                        const cantidad = cell?.cantidad ?? 0;
                                        return (
                                            <td key={c} className="px-4 py-3 text-center">
                                                {cantidad > 0 ? (
                                                    <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                                                        {fmtNumber(cantidad)}
                                                    </span>
                                                ) : (
                                                    <span className="text-[var(--text-muted)]">0</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-3 text-right font-semibold text-[var(--text-primary)]">
                                        {fmtNumber(totalCantidad)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-sm text-red-400">
                                        {fmtCurrency(totalSaldo)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {selected && (
                <CXCDetailPanel
                    mui={selected.mui}
                    sucursal={selected.sucursal}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
