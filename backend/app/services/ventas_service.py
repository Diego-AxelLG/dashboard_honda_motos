"""Servicio de consultas: Ventas Honda Motos."""
from calendar import monthrange
from datetime import date
from sqlalchemy import text
from sqlalchemy.orm import Session


def _resolve_month(anio_mes: str | None) -> tuple[str, str]:
    today = date.today()
    if anio_mes is None:
        anio_mes = today.strftime("%Y-%m")
    mes_inicio = f"{anio_mes}-01"
    year, month = int(anio_mes[:4]), int(anio_mes[5:7])
    if month == 12:
        mes_fin = f"{year + 1}-01-01"
    else:
        mes_fin = f"{year}-{month + 1:02d}-01"
    return mes_inicio, mes_fin


def _mui_filter(alias: str, mui: int | None) -> str:
    return f"AND {alias}.id_sucursal = CAST(:mui AS int)" if mui else ""


def get_resumen(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """KPIs mensuales de ventas desde mv_kpis_mensual."""
    if anio_mes is None:
        anio_mes = date.today().strftime("%Y-%m")
    mui_clause = "AND id_sucursal = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
        SELECT anio_mes, id_sucursal, sucursal, total_ventas, ventas_nuevos,
               monto_total, meta, pct_cumplimiento, var_pct_yoy
        FROM dwh.mv_kpis_mensual
        WHERE anio_mes = :anio_mes {mui_clause}
        ORDER BY id_sucursal
    """)
    params: dict = {"anio_mes": anio_mes}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_tendencia(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """Venta diaria acumulada vs plan prorrateado + mes anterior + anio anterior.

    Solo devuelve puntos hasta el dia actual (para el mes en curso).
    Para meses pasados devuelve el mes completo.
    """
    today = date.today()
    if anio_mes is None:
        anio_mes = today.strftime("%Y-%m")
    year, month = int(anio_mes[:4]), int(anio_mes[5:7])
    dias_mes = monthrange(year, month)[1]
    if (year, month) == (today.year, today.month):
        cutoff_day = min(today.day, dias_mes)
    elif (year, month) > (today.year, today.month):
        cutoff_day = 0
    else:
        cutoff_day = dias_mes

    if cutoff_day == 0:
        return []

    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_v = "AND fv.id_sucursal = CAST(:mui AS int)" if mui else ""
    mui_p = "AND fp.id_sucursal = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
    WITH dias AS (
        SELECT generate_series(1, CAST(:cutoff_day AS int)) AS dom
    ),
    vc AS (
        SELECT EXTRACT(DAY FROM fv.fecha)::int AS dom, COUNT(*)::int AS n
        FROM dwh.fact_ventas fv
        WHERE fv.fecha >= CAST(:mes_inicio AS date)
          AND fv.fecha <  CAST(:mes_fin AS date)
          {mui_v}
        GROUP BY 1
    ),
    vp AS (
        SELECT EXTRACT(DAY FROM fv.fecha)::int AS dom, COUNT(*)::int AS n
        FROM dwh.fact_ventas fv
        WHERE fv.fecha >= (CAST(:mes_inicio AS date) - INTERVAL '1 month')::date
          AND fv.fecha <  CAST(:mes_inicio AS date)
          {mui_v}
        GROUP BY 1
    ),
    va AS (
        SELECT EXTRACT(DAY FROM fv.fecha)::int AS dom, COUNT(*)::int AS n
        FROM dwh.fact_ventas fv
        WHERE fv.fecha >= (CAST(:mes_inicio AS date) - INTERVAL '1 year')::date
          AND fv.fecha <  (CAST(:mes_fin AS date)    - INTERVAL '1 year')::date
          {mui_v}
        GROUP BY 1
    ),
    plan_total AS (
        SELECT COALESCE(SUM(plan_ventas), 0) AS total
        FROM dwh.fact_plan fp
        WHERE fp.anio_mes = :anio_mes
          {mui_p}
    )
    SELECT
        CAST((CAST(:mes_inicio AS date) + (d.dom - 1) * INTERVAL '1 day')::date AS text) AS fecha,
        CAST(COALESCE(SUM(vc.n) OVER (ORDER BY d.dom), 0) AS int) AS ventas_acumuladas,
        CAST(ROUND(
            (SELECT total FROM plan_total)::numeric
            / GREATEST(CAST(:dias_mes AS int), 1)
            * d.dom
        ) AS int) AS plan_prorrateado,
        CAST(COALESCE(SUM(vp.n) OVER (ORDER BY d.dom), 0) AS int) AS ventas_mes_anterior,
        CAST(COALESCE(SUM(va.n) OVER (ORDER BY d.dom), 0) AS int) AS ventas_anio_anterior
    FROM dias d
    LEFT JOIN vc ON vc.dom = d.dom
    LEFT JOIN vp ON vp.dom = d.dom
    LEFT JOIN va ON va.dom = d.dom
    ORDER BY d.dom
    """)
    params: dict = {
        "mes_inicio": mes_inicio,
        "mes_fin": mes_fin,
        "anio_mes": anio_mes,
        "cutoff_day": cutoff_day,
        "dias_mes": dias_mes,
    }
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_por_modelo(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """Ranking de modelos por unidades vendidas."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = _mui_filter("fv", mui)

    sql = text(f"""
        SELECT fv.modelo, COUNT(*) AS unidades,
               SUM(CASE WHEN fv.venta_contado THEN 1 ELSE 0 END) AS contado,
               SUM(CASE WHEN NOT fv.venta_contado THEN 1 ELSE 0 END) AS financiamiento
        FROM dwh.fact_ventas fv
        WHERE fv.fecha >= CAST(:mes_inicio AS date)
          AND fv.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        GROUP BY fv.modelo
        ORDER BY unidades DESC
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_flujos(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """Flujos de piso diarios."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = _mui_filter("f", mui)

    sql = text(f"""
        SELECT CAST(f.fecha AS text) AS fecha, f.id_sucursal, f.freshup, f.internet,
               (f.freshup + f.internet) AS total
        FROM dwh.fact_flujos_piso f
        WHERE f.fecha >= CAST(:mes_inicio AS date)
          AND f.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        ORDER BY f.fecha
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_cumplimiento_pacing(db: Session, mui: int | None = None, anio_mes: str | None = None) -> dict:
    """Pacing de cumplimiento por sucursal + total: ventas al 'mismo dia' del mes
    seleccionado vs plan prorrateado, mes anterior y anio anterior.

    Retorna { anio_mes, cutoff_day, dias_mes, total: {...}, sucursales: [{...}] }.
    Cuando se pasa `mui`, `sucursales` trae solo esa sucursal y `total` = esa fila.
    """
    today = date.today()
    if anio_mes is None:
        anio_mes = today.strftime("%Y-%m")
    year, month = int(anio_mes[:4]), int(anio_mes[5:7])
    dias_mes = monthrange(year, month)[1]

    if (year, month) == (today.year, today.month):
        cutoff_day = min(today.day, dias_mes)
    elif (year, month) > (today.year, today.month):
        cutoff_day = 0
    else:
        cutoff_day = dias_mes

    mes_inicio = date(year, month, 1).isoformat()
    mui_v = "AND fv.id_sucursal = CAST(:mui AS int)" if mui else ""
    mui_p = "AND fp.id_sucursal = CAST(:mui AS int)" if mui else ""
    mui_s = "AND s.id_sucursal = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
        WITH params AS (
            SELECT CAST(:mes_inicio AS date) AS mi,
                   CAST(:cutoff_day AS int) AS cd
        ),
        ventas AS (
            SELECT fv.id_sucursal,
                COUNT(*) FILTER (
                    WHERE p.cd > 0
                      AND fv.fecha >= p.mi
                      AND fv.fecha <= (p.mi + (p.cd - 1) * INTERVAL '1 day')::date
                )::int AS ventas_actual,
                COUNT(*) FILTER (
                    WHERE p.cd > 0
                      AND fv.fecha >= (p.mi - INTERVAL '1 month')::date
                      AND fv.fecha <= LEAST(
                          (p.mi - INTERVAL '1 day')::date,
                          ((p.mi - INTERVAL '1 month')::date + (p.cd - 1) * INTERVAL '1 day')::date
                      )
                )::int AS ventas_mes_ant,
                COUNT(*) FILTER (
                    WHERE p.cd > 0
                      AND fv.fecha >= (p.mi - INTERVAL '1 year')::date
                      AND fv.fecha <= LEAST(
                          ((p.mi - INTERVAL '1 year')::date + INTERVAL '1 month' - INTERVAL '1 day')::date,
                          ((p.mi - INTERVAL '1 year')::date + (p.cd - 1) * INTERVAL '1 day')::date
                      )
                )::int AS ventas_anio_ant
            FROM dwh.fact_ventas fv
            CROSS JOIN params p
            WHERE fv.fecha >= (p.mi - INTERVAL '1 year')::date
              AND fv.fecha <  (p.mi + INTERVAL '1 month')::date
              {mui_v}
            GROUP BY fv.id_sucursal
        ),
        plan_s AS (
            SELECT fp.id_sucursal, COALESCE(SUM(fp.plan_ventas), 0)::int AS total
            FROM dwh.fact_plan fp
            WHERE fp.anio_mes = :anio_mes
              {mui_p}
            GROUP BY fp.id_sucursal
        )
        SELECT s.id_sucursal,
               s.nombre AS sucursal,
               COALESCE(v.ventas_actual, 0)   AS ventas_actual,
               COALESCE(v.ventas_mes_ant, 0)  AS ventas_mes_anterior,
               COALESCE(v.ventas_anio_ant, 0) AS ventas_anio_anterior,
               COALESCE(pl.total, 0)          AS plan_total
        FROM dwh.dim_sucursales s
        LEFT JOIN ventas v  ON v.id_sucursal  = s.id_sucursal
        LEFT JOIN plan_s pl ON pl.id_sucursal = s.id_sucursal
        WHERE s.activa = TRUE AND s.marca = 'Honda Motos'
          {mui_s}
        ORDER BY s.id_sucursal
    """)
    params: dict = {
        "mes_inicio": mes_inicio,
        "cutoff_day": cutoff_day,
        "anio_mes": anio_mes,
    }
    if mui:
        params["mui"] = mui

    rows = [dict(r) for r in db.execute(sql, params).mappings().all()]

    def pct(curr: int, base: int) -> float | None:
        if base == 0:
            return None
        return round((curr / base - 1) * 100, 1)

    def make_row(ventas_actual: int, ventas_mes_ant: int, ventas_anio_ant: int,
                 plan_total: int, mui_val: int | None = None, sucursal: str | None = None) -> dict:
        plan_pro = round(plan_total * cutoff_day / dias_mes) if dias_mes else 0
        cumpl = round((ventas_actual / plan_pro) * 100, 1) if plan_pro else None
        out = {
            "ventas_actual": ventas_actual,
            "plan_total": plan_total,
            "plan_prorrateado": plan_pro,
            "cumplimiento_vs_plan_pct": cumpl,
            "ventas_mes_anterior": ventas_mes_ant,
            "var_vs_mes_anterior_pct": pct(ventas_actual, ventas_mes_ant),
            "ventas_anio_anterior": ventas_anio_ant,
            "var_vs_anio_anterior_pct": pct(ventas_actual, ventas_anio_ant),
        }
        if mui_val is not None:
            out = {"mui": mui_val, "sucursal": sucursal, **out}
        return out

    sucursales = [
        make_row(
            int(r["ventas_actual"] or 0),
            int(r["ventas_mes_anterior"] or 0),
            int(r["ventas_anio_anterior"] or 0),
            int(r["plan_total"] or 0),
            mui_val=int(r["id_sucursal"]),
            sucursal=r["sucursal"],
        )
        for r in rows
    ]

    total = make_row(
        sum(s["ventas_actual"] for s in sucursales),
        sum(s["ventas_mes_anterior"] for s in sucursales),
        sum(s["ventas_anio_anterior"] for s in sucursales),
        sum(s["plan_total"] for s in sucursales),
    )

    return {
        "anio_mes": anio_mes,
        "cutoff_day": cutoff_day,
        "dias_mes": dias_mes,
        "total": total,
        "sucursales": sucursales,
    }


def get_detalle(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """Detalle de VINs vendidos."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = _mui_filter("fv", mui)

    sql = text(f"""
        SELECT CAST(fv.fecha AS text) AS fecha, fv.id_sucursal,
               s.nombre AS sucursal, fv.modelo, fv.id_oportunidad AS vin,
               fv.venta_contado, v.nombre AS asesor
        FROM dwh.fact_ventas fv
        JOIN dwh.dim_sucursales s ON fv.id_sucursal = s.id_sucursal
        LEFT JOIN dwh.dim_vendedores v ON fv.id_vendedor = v.id_vendedor
        WHERE fv.fecha >= CAST(:mes_inicio AS date)
          AND fv.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        ORDER BY fv.fecha DESC
        LIMIT 500
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_por_asesor_modelo(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """Agregado de unidades por asesor x modelo en el mes."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = _mui_filter("fv", mui)

    sql = text(f"""
        SELECT COALESCE(fv.id_vendedor, 0) AS id_vendedor,
               COALESCE(v.nombre, 'Sin asignar') AS asesor,
               fv.id_sucursal,
               s.nombre AS sucursal,
               fv.modelo,
               COUNT(*) AS unidades,
               SUM(CASE WHEN fv.venta_contado THEN 1 ELSE 0 END)::int AS contado,
               SUM(CASE WHEN fv.venta_contado THEN 0 ELSE 1 END)::int AS financiado
        FROM dwh.fact_ventas fv
        JOIN dwh.dim_sucursales s ON fv.id_sucursal = s.id_sucursal
        LEFT JOIN dwh.dim_vendedores v ON fv.id_vendedor = v.id_vendedor
        WHERE fv.fecha >= CAST(:mes_inicio AS date)
          AND fv.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        GROUP BY fv.id_vendedor, v.nombre, fv.id_sucursal, s.nombre, fv.modelo
        ORDER BY asesor, modelo
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]
