"""Servicio de consultas: Financiero Honda Motos.

Usa fact_estado_resultados (P&L reales de sicofi) y
fact_ppto_estado_resultados (presupuesto) para calcular UB, UO, absorción.
"""
from datetime import date
from sqlalchemy import text
from sqlalchemy.orm import Session


def _resolve_month(anio_mes: str | None) -> tuple[str, str, str]:
    """Retorna (mes_inicio, mes_fin, anio_mes)."""
    today = date.today()
    if anio_mes is None:
        anio_mes = today.strftime("%Y-%m")
    mes_inicio = f"{anio_mes}-01"
    year, month = int(anio_mes[:4]), int(anio_mes[5:7])
    mes_fin = f"{year + 1}-01-01" if month == 12 else f"{year}-{month + 1:02d}-01"
    return mes_inicio, mes_fin, anio_mes


def get_financials(db: Session, mui: int | None = None, anio_mes: str | None = None) -> dict:
    """KPIs financieros: UB, UO, Absorción, gastos desglosados + ppto."""
    mes_inicio, mes_fin, anio_mes = _resolve_month(anio_mes)
    mui_clause = "AND r.mui = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
        WITH reales AS (
            SELECT
                r.mui,
                COALESCE(SUM(r.monto) FILTER (WHERE r.seccion IN ('INGRESOS', 'COSTOS')), 0)
                    AS utilidad_bruta,
                COALESCE(SUM(r.monto) FILTER (WHERE r.seccion IN ('INGRESOS', 'COSTOS', 'GASTOS')), 0)
                    AS utilidad_operacion,
                -- UB Postventa
                COALESCE(SUM(r.monto) FILTER (
                    WHERE r.seccion IN ('INGRESOS', 'COSTOS')
                      AND r.rama IN ('SERVICIO', 'BONIFICACION_SERVICIO')
                ), 0) AS ub_postventa,
                -- Gastos desglosados
                ABS(COALESCE(SUM(r.monto) FILTER (WHERE r.seccion = 'GASTOS' AND r.rama = 'GASTO'), 0)) AS gastos_fijos,
                ABS(COALESCE(SUM(r.monto) FILTER (WHERE r.seccion = 'GASTOS' AND r.rama = 'VARIABLES'), 0)) AS gastos_variables,
                ABS(COALESCE(SUM(r.monto) FILTER (WHERE r.seccion = 'GASTOS' AND r.rama = 'GASTOS FINANCIEROS'), 0)) AS gastos_financieros,
                ABS(COALESCE(SUM(r.monto) FILTER (WHERE r.seccion = 'GASTOS' AND r.rama = 'OTROS GASTOS'), 0)) AS gastos_otros,
                -- Gastos para absorcion
                ABS(COALESCE(SUM(r.monto) FILTER (WHERE r.seccion = 'GASTOS' AND r.rama = 'GASTO'), 0))
                + ABS(COALESCE(SUM(r.monto) FILTER (WHERE r.seccion = 'GASTOS' AND r.rama = 'VARIABLES'
                      AND r.tipo = 'COMISIONES PERSONAL SERVICIO'), 0))
                + ABS(COALESCE(SUM(r.monto) FILTER (WHERE r.seccion = 'GASTOS' AND r.rama = 'OTROS GASTOS'), 0))
                    AS gastos_absorcion
            FROM dwh.fact_estado_resultados r
            WHERE r.fecha >= CAST(:mes_inicio AS date)
              AND r.fecha < CAST(:mes_fin AS date)
              {mui_clause}
            GROUP BY r.mui
        ),
        ppto AS (
            SELECT
                p.mui,
                COALESCE(SUM(p.monto) FILTER (WHERE p.seccion = 'INGRESOS'), 0)
                  - COALESCE(SUM(p.monto) FILTER (WHERE p.seccion = 'COSTOS'), 0)
                  AS ppto_utilidad_bruta,
                COALESCE(SUM(p.monto) FILTER (WHERE p.seccion = 'INGRESOS'), 0)
                  - COALESCE(SUM(p.monto) FILTER (WHERE p.seccion = 'COSTOS'), 0)
                  - COALESCE(SUM(p.monto) FILTER (WHERE p.seccion = 'GASTOS'), 0)
                  AS ppto_utilidad_operacion,
                -- Ppto Ingresos de Servicio (postventa): ingresos / rama SERVICIO
                COALESCE(SUM(p.monto) FILTER (
                    WHERE p.seccion = 'INGRESOS'
                      AND p.rama IN ('SERVICIO', 'BONIFICACION_SERVICIO')
                ), 0) AS ppto_ingresos_servicio,
                -- Ppto UB Postventa: ingresos servicio - costos servicio
                COALESCE(SUM(p.monto) FILTER (
                    WHERE p.seccion = 'INGRESOS'
                      AND p.rama IN ('SERVICIO', 'BONIFICACION_SERVICIO')
                ), 0)
                - COALESCE(SUM(p.monto) FILTER (
                    WHERE p.seccion = 'COSTOS'
                      AND p.rama IN ('SERVICIO', 'BONIFICACION_SERVICIO')
                ), 0) AS ppto_ub_postventa
            FROM dwh.fact_ppto_estado_resultados p
            WHERE p.fecha >= CAST(:mes_inicio AS date)
              AND p.fecha < CAST(:mes_fin AS date)
              {mui_clause.replace('r.mui', 'p.mui')}
            GROUP BY p.mui
        )
        SELECT
            r.mui,
            s.nombre AS sucursal,
            r.utilidad_bruta,
            r.utilidad_operacion,
            r.ub_postventa,
            r.gastos_fijos,
            r.gastos_variables,
            r.gastos_financieros,
            r.gastos_otros,
            r.gastos_absorcion,
            CASE WHEN r.gastos_absorcion > 0
                 THEN ROUND((r.ub_postventa / r.gastos_absorcion) * 100, 2)
                 ELSE NULL END AS absorcion_pct,
            COALESCE(p.ppto_utilidad_bruta, 0) AS ppto_utilidad_bruta,
            COALESCE(p.ppto_utilidad_operacion, 0) AS ppto_utilidad_operacion,
            COALESCE(p.ppto_ub_postventa, 0) AS ppto_ub_postventa,
            COALESCE(p.ppto_ingresos_servicio, 0) AS ppto_ingresos_servicio
        FROM reales r
        JOIN dwh.dim_sucursales s ON r.mui = s.id_sucursal
        LEFT JOIN ppto p ON p.mui = r.mui
        ORDER BY r.mui
    """)

    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui:
        params["mui"] = mui

    rows = [dict(r) for r in db.execute(sql, params).mappings().all()]

    # EdR detalle (para tabla estado de resultados)
    edr_clause = "AND e.mui = CAST(:mui AS int)" if mui else ""
    sql_edr = text(f"""
        SELECT e.mui, s.nombre AS sucursal, e.seccion, e.rama, e.tipo,
               ROUND(SUM(e.monto), 2) AS monto
        FROM dwh.fact_estado_resultados e
        JOIN dwh.dim_sucursales s ON e.mui = s.id_sucursal
        WHERE e.fecha >= CAST(:mes_inicio AS date)
          AND e.fecha < CAST(:mes_fin AS date)
          {edr_clause}
        GROUP BY e.mui, s.nombre, e.seccion, e.rama, e.tipo
        ORDER BY e.mui, e.seccion, e.rama, e.tipo
    """)
    edr_rows = [dict(r) for r in db.execute(sql_edr, {"mes_inicio": mes_inicio, "mes_fin": mes_fin, **({"mui": mui} if mui else {})}).mappings().all()]

    # Ppto detalle
    ppto_clause = "AND p.mui = CAST(:mui AS int)" if mui else ""
    sql_ppto_det = text(f"""
        SELECT p.mui, s.nombre AS sucursal, p.seccion, p.rama, p.tipo,
               ROUND(SUM(p.monto), 2) AS monto
        FROM dwh.fact_ppto_estado_resultados p
        JOIN dwh.dim_sucursales s ON p.mui = s.id_sucursal
        WHERE p.fecha >= CAST(:mes_inicio AS date)
          AND p.fecha < CAST(:mes_fin AS date)
          {ppto_clause}
        GROUP BY p.mui, s.nombre, p.seccion, p.rama, p.tipo
        ORDER BY p.mui, p.seccion, p.rama, p.tipo
    """)
    ppto_rows = [dict(r) for r in db.execute(sql_ppto_det, {"mes_inicio": mes_inicio, "mes_fin": mes_fin, **({"mui": mui} if mui else {})}).mappings().all()]

    # Acumulado YTD (enero → mes actual)
    year = int(anio_mes[:4]) if anio_mes else date.today().year
    ytd_inicio = f"{year}-01-01"
    ytd_clause = "AND r.mui = CAST(:mui AS int)" if mui else ""
    sql_ytd = text(f"""
        SELECT
            r.mui,
            COALESCE(SUM(r.monto) FILTER (WHERE r.seccion IN ('INGRESOS', 'COSTOS')), 0) AS ytd_ub,
            COALESCE(SUM(r.monto) FILTER (WHERE r.seccion IN ('INGRESOS', 'COSTOS', 'GASTOS')), 0) AS ytd_uo
        FROM dwh.fact_estado_resultados r
        WHERE r.fecha >= CAST(:ytd_inicio AS date)
          AND r.fecha < CAST(:mes_fin AS date)
          {ytd_clause}
        GROUP BY r.mui
    """)
    ytd_params: dict = {"ytd_inicio": ytd_inicio, "mes_fin": mes_fin}
    if mui:
        ytd_params["mui"] = mui
    ytd_map = {r['mui']: r for r in db.execute(sql_ytd, ytd_params).mappings().all()}
    for row in rows:
        ytd = ytd_map.get(row['mui'], {})
        row['ytd_ub'] = ytd.get('ytd_ub', 0)
        row['ytd_uo'] = ytd.get('ytd_uo', 0)

    return {
        "kpis": rows,
        "edr_reales": edr_rows,
        "edr_presupuesto": ppto_rows,
    }
