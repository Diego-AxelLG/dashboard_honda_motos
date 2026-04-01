"""Servicio de consultas: Ventas Honda Motos."""
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
               monto_total, meta, pct_cumplimiento, var_pct_mom, var_pct_yoy
        FROM dwh.mv_kpis_mensual
        WHERE anio_mes = :anio_mes {mui_clause}
        ORDER BY id_sucursal
    """)
    params: dict = {"anio_mes": anio_mes}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_tendencia(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """Venta diaria acumulada vs plan prorrateado."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = _mui_filter("fv", mui)

    sql = text(f"""
    WITH dias AS (
        SELECT CAST(generate_series(
            CAST(:mes_inicio AS date),
            CAST(:mes_fin AS date) - interval '1 day',
            interval '1 day'
        ) AS date) AS fecha
    ),
    ventas_dia AS (
        SELECT fv.fecha, COUNT(*) AS unidades
        FROM dwh.fact_ventas fv
        WHERE fv.fecha >= CAST(:mes_inicio AS date)
          AND fv.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        GROUP BY fv.fecha
    ),
    plan_total AS (
        SELECT COALESCE(SUM(plan_ventas), 0) AS total
        FROM dwh.fact_plan fp
        WHERE fp.anio_mes = :anio_mes
          {"AND fp.id_sucursal = CAST(:mui AS int)" if mui else ""}
    )
    SELECT
        CAST(d.fecha AS text) AS fecha,
        CAST(COALESCE(SUM(vd.unidades) OVER (ORDER BY d.fecha), 0) AS int) AS ventas_acumuladas,
        CAST(ROUND(
            CAST((SELECT total FROM plan_total) AS numeric)
            / GREATEST(EXTRACT(DAY FROM CAST(:mes_fin AS date) - interval '1 day'), 1)
            * ROW_NUMBER() OVER (ORDER BY d.fecha)
        ) AS int) AS plan_prorrateado
    FROM dias d
    LEFT JOIN ventas_dia vd ON vd.fecha = d.fecha
    ORDER BY d.fecha
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin, "anio_mes": anio_mes or date.today().strftime("%Y-%m")}
    if mui: params["mui"] = mui
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


def get_detalle(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """Detalle de VINs vendidos."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = _mui_filter("fv", mui)

    sql = text(f"""
        SELECT CAST(fv.fecha AS text) AS fecha, fv.id_sucursal,
               s.nombre AS sucursal, fv.modelo, fv.id_oportunidad AS vin,
               fv.venta_contado
        FROM dwh.fact_ventas fv
        JOIN dwh.dim_sucursales s ON fv.id_sucursal = s.id_sucursal
        WHERE fv.fecha >= CAST(:mes_inicio AS date)
          AND fv.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        ORDER BY fv.fecha DESC
        LIMIT 500
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]
