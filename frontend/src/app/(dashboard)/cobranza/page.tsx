"use client";

import { useState } from "react";
import { AgencyPills, UltimaActualizacion } from "@/components/ui";
import { AGENCIES } from "@/lib/constants";
import CXCTable from "@/components/cobranza/CXCTable";
import OSAbiertasTable from "@/components/cobranza/OSAbiertasTable";

export default function CobranzaPage() {
    const [mui, setMui] = useState<number | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                        CxC y OS
                    </h1>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Facturas vencidas y ordenes de servicio fuera de SLA. Operacion sobre el ultimo snapshot.
                    </p>
                </div>
                <UltimaActualizacion etls={["cobranza", "os_abierta"]} />
            </div>

            <AgencyPills
                options={AGENCIES}
                selected={mui}
                onChange={v => setMui(v === null ? null : Number(v))}
            />

            <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    Cuentas por cobrar
                </h2>
                <CXCTable mui={mui} />
            </section>

            <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    OS fuera de SLA
                </h2>
                <OSAbiertasTable mui={mui} />
            </section>
        </div>
    );
}
