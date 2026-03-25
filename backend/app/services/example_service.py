"""
Ejemplo de servicio con consultas SQL crudas usando SQLAlchemy text().

Demuestra el patron estandar del proyecto:
  - CTEs para organizar la logica
  - Parametros con CAST(:param AS type)
  - Filtros opcionales inyectados como fragmentos SQL
  - Retorno como lista de dicts
"""

from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

# IMPORTANTE: Nunca usar :param::type — SQLAlchemy trata :: como escape.
# Siempre usar CAST(:param AS type)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_month(anio_mes: str | None) -> tuple[str, str]:
    """Convierte YYYY-MM en (mes_inicio, mes_fin) como strings ISO."""
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
    """Retorna fragmento SQL para filtrar por sucursal, o string vacio."""
    if mui is not None:
        return f"AND {alias}.mui = :mui"
    return ""


# ---------------------------------------------------------------------------
# Servicio principal
# ---------------------------------------------------------------------------

def get_daily_sales_trend(
    db: Session,
    mui: int | None = None,
    anio_mes: str | None = None,
) -> list[dict]:
    """
    Tendencia diaria acumulada de ventas vs plan prorrateado.

    Retorna una lista de dicts con:
      - date: fecha (str)
      - ventas_acumuladas: total acumulado al dia
      - plan_prorrateado: plan distribuido linealmente al dia
    """
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = _mui_filter("v", mui)

    # IMPORTANTE: Nunca usar :param::type — SQLAlchemy trata :: como escape.
    # Siempre usar CAST(:param AS type)
    sql = text(f"""
    WITH params AS (
        SELECT
            CAST(:mes_inicio AS date) AS inicio,
            CAST(CAST(:mes_fin AS date) - interval '1 day' AS date) AS fin
    ),
    dias AS (
        SELECT CAST(generate_series(
            (SELECT inicio FROM params),
            (SELECT fin FROM params),
            interval '1 day'
        ) AS date) AS fecha
    ),
    ventas_dia AS (
        SELECT v.fecha, COALESCE(SUM(v.monto), 0) AS total
        FROM dwh.fact_ventas v, params p
        WHERE v.fecha BETWEEN p.inicio AND p.fin
          {mui_clause}
        GROUP BY v.fecha
    ),
    plan_mes AS (
        SELECT COALESCE(SUM(cantidad_objetivo), 0) AS total_plan
        FROM dwh.fact_plan_ventas pv, params p
        WHERE pv.fecha BETWEEN p.inicio AND p.fin
          {_mui_filter("pv", mui)}
    )
    SELECT
        CAST(d.fecha AS text)              AS date,
        CAST(COALESCE(SUM(vd.total) OVER (
            ORDER BY d.fecha
        ), 0) AS int)                      AS ventas_acumuladas,
        CAST(ROUND(
            CAST((SELECT total_plan FROM plan_mes) AS numeric)
            / EXTRACT(DAY FROM (SELECT fin FROM params))
            * ROW_NUMBER() OVER (ORDER BY d.fecha)
        ) AS int)                          AS plan_prorrateado
    FROM dias d
    LEFT JOIN ventas_dia vd ON vd.fecha = d.fecha
    ORDER BY d.fecha
    """)

    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui is not None:
        params["mui"] = mui

    rows = db.execute(sql, params).mappings().all()
    return [dict(r) for r in rows]
