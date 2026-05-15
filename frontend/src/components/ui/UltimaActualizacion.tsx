"use client";

import { useEffect, useState } from "react";
import { getEtlLastRun } from "@/lib/api";

interface EtlRun { etl_name: string; last_run_at: string | null }

export interface UltimaActualizacionProps {
    /** Nombres de ETLs en `dwh.etl_last_run` cuyo mínimo (más viejo) se muestra. */
    etls: string[];
}

function humanizeAgo(d: Date): string {
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "menos de 1 min";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h`;
    const d2 = Math.floor(h / 24);
    return `${d2} d`;
}

function fmtAbsolute(d: Date): string {
    // YYYY-MM-DD HH:mm local
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function UltimaActualizacion({ etls }: UltimaActualizacionProps) {
    const [rows, setRows] = useState<EtlRun[] | null>(null);

    useEffect(() => {
        let alive = true;
        getEtlLastRun()
            .then((data: EtlRun[]) => { if (alive) setRows(data); })
            .catch(() => { if (alive) setRows([]); });
        return () => { alive = false; };
    }, []);

    if (!rows) return null;

    const map = new Map(rows.map(r => [r.etl_name, r.last_run_at]));
    const dates = etls
        .map(e => map.get(e))
        .filter((v): v is string => !!v)
        // Defensa por si llega "YYYY-MM-DD HH:MM:SS+00" del formato anterior
        .map(s => new Date(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")))
        .filter(d => !Number.isNaN(d.getTime()));

    if (dates.length === 0) return null;
    const oldest = new Date(Math.min(...dates.map(d => d.getTime())));

    return (
        <span
            title={`Actualizado: ${fmtAbsolute(oldest)}`}
            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]"
        >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
            Hace {humanizeAgo(oldest)}
        </span>
    );
}
