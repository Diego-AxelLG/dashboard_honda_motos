"""Servicio de consultas: Financiero Honda Motos."""
from datetime import date
from sqlalchemy import text
from sqlalchemy.orm import Session


def _resolve_month(anio_mes: str | None) -> tuple[str, str]:
    today = date.today()
    if anio_mes is None:
        anio_mes = today.strftime("%Y-%m")
    mes_inicio = f"{anio_mes}-01"
    year, month = int(anio_mes[:4]), int(anio_mes[5:7])
    mes_fin = f"{year + 1}-01-01" if month == 12 else f"{year}-{month + 1:02d}-01"
    return mes_inicio, mes_fin


def get_edr(db: Session, mui: int | None = None, anio_mes: str | None = None) -> dict:
    """Estado de Resultados presupuestado."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = "AND e.id_sucursal = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
        SELECT e.id_sucursal, s.nombre AS sucursal,
               e.seccion, e.rama, e.tipo,
               ROUND(SUM(e.monto), 2) AS monto
        FROM dwh.fact_ppto_edr e
        JOIN dwh.dim_sucursales s ON e.id_sucursal = s.id_sucursal
        WHERE e.fecha >= CAST(:mes_inicio AS date)
          AND e.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        GROUP BY e.id_sucursal, s.nombre, e.seccion, e.rama, e.tipo
        ORDER BY e.id_sucursal, e.seccion, e.rama, e.tipo
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    rows = [dict(r) for r in db.execute(sql, params).mappings().all()]

    return {"data": rows, "solo_presupuesto": True,
            "nota": "Datos contables reales no disponibles. Mostrando presupuesto."}


def get_dealer_profile_financiero(db: Session, mui: int | None = None, anio_mes: str | None = None) -> dict:
    """KPIs dealer profile P2 (gastos + servicio financiero)."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = "AND dp.id_sucursal = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
        SELECT dp.id_sucursal, dp.dealer_profile_id, dp.nombre, dp.seccion,
               dp.valor, dp.sub_valor
        FROM dwh.fact_dealer_profile dp
        WHERE dp.fecha >= CAST(:mes_inicio AS date)
          AND dp.fecha < CAST(:mes_fin AS date)
          AND dp.prioridad = 2
          {mui_clause}
        ORDER BY dp.id_sucursal, dp.seccion, dp.dealer_profile_id
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    current = [dict(r) for r in db.execute(sql, params).mappings().all()]

    # Mes anterior para delta MoM
    year, month = int(anio_mes[:4]) if anio_mes else date.today().year, int(anio_mes[5:7]) if anio_mes else date.today().month
    if month == 1:
        prev_anio_mes = f"{year - 1}-12"
    else:
        prev_anio_mes = f"{year}-{month - 1:02d}"
    prev_inicio = f"{prev_anio_mes}-01"
    py, pm = int(prev_anio_mes[:4]), int(prev_anio_mes[5:7])
    prev_fin = f"{py + 1}-01-01" if pm == 12 else f"{py}-{pm + 1:02d}-01"

    sql_prev = text(f"""
        SELECT dp.id_sucursal, dp.dealer_profile_id, dp.valor
        FROM dwh.fact_dealer_profile dp
        WHERE dp.fecha >= CAST(:prev_inicio AS date)
          AND dp.fecha < CAST(:prev_fin AS date)
          AND dp.prioridad = 2
          {mui_clause}
    """)
    params_prev: dict = {"prev_inicio": prev_inicio, "prev_fin": prev_fin}
    if mui: params_prev["mui"] = mui
    previous = [dict(r) for r in db.execute(sql_prev, params_prev).mappings().all()]

    return {"current": current, "previous": previous}


def get_ventas_kpis(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """KPIs dealer profile P1 de ventas nuevos (id 1-7)."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = "AND dp.id_sucursal = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
        SELECT dp.id_sucursal, dp.dealer_profile_id, dp.nombre, dp.valor, dp.sub_valor
        FROM dwh.fact_dealer_profile dp
        WHERE dp.fecha >= CAST(:mes_inicio AS date)
          AND dp.fecha < CAST(:mes_fin AS date)
          AND dp.dealer_profile_id IN (1, 2, 3, 4, 5, 6, 7)
          {mui_clause}
        ORDER BY dp.id_sucursal, dp.dealer_profile_id
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]
