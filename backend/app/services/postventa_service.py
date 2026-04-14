"""Servicio de consultas: Postventa Honda Motos.

Usa fact_postventa_kpis (OTs/horas), fact_contable_servicio (venta contable),
fact_ticket_promedio, fact_ppto_estado_resultados (plan servicio).
"""
from calendar import monthrange
from datetime import date
from sqlalchemy import text
from sqlalchemy.orm import Session


def _resolve_month(anio_mes: str | None) -> tuple[str, str, str]:
    today = date.today()
    if anio_mes is None:
        anio_mes = today.strftime("%Y-%m")
    mes_inicio = f"{anio_mes}-01"
    year, month = int(anio_mes[:4]), int(anio_mes[5:7])
    mes_fin = f"{year + 1}-01-01" if month == 12 else f"{year}-{month + 1:02d}-01"
    return mes_inicio, mes_fin, anio_mes


def get_summary(db: Session, mui: int | None = None, anio_mes: str | None = None) -> dict:
    """KPIs resumen postventa del mes."""
    mes_inicio, mes_fin, _ = _resolve_month(anio_mes)
    mui_clause = "AND k.mui = CAST(:mui AS int)" if mui else ""

    # OTs + Horas MO
    sql_kpis = text(f"""
        SELECT k.mui, s.nombre AS sucursal,
               SUM(k.cantidad) AS ots,
               ROUND(SUM(k.horas_mo), 2) AS horas_mo
        FROM dwh.fact_postventa_kpis k
        JOIN dwh.dim_sucursales s ON k.mui = s.id_sucursal
        WHERE k.fecha >= CAST(:mes_inicio AS date)
          AND k.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        GROUP BY k.mui, s.nombre
        ORDER BY k.mui
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui:
        params["mui"] = mui
    kpis = [dict(r) for r in db.execute(sql_kpis, params).mappings().all()]

    # Venta Total + MO (contable)
    cs_clause = "AND c.mui = CAST(:mui AS int)" if mui else ""
    sql_contable = text(f"""
        SELECT c.mui,
               SUM(CASE WHEN c.tipo = 'Ingreso' THEN c.monto ELSE 0 END) AS venta_total,
               SUM(CASE WHEN c.tipo = 'MO' THEN c.monto ELSE 0 END) AS venta_mo
        FROM dwh.fact_contable_servicio c
        WHERE c.fecha >= CAST(:mes_inicio AS date)
          AND c.fecha < CAST(:mes_fin AS date)
          {cs_clause}
        GROUP BY c.mui
    """)
    contable = {r['mui']: r for r in db.execute(sql_contable, params).mappings().all()}

    # Ticket promedio (último disponible por sucursal)
    tp_clause = "AND t.mui = CAST(:mui AS int)" if mui else ""
    sql_ticket = text(f"""
        SELECT DISTINCT ON (t.mui) t.mui, t.ticket_promedio, t.fecha
        FROM dwh.fact_ticket_promedio t
        WHERE t.fecha <= CAST(:mes_fin AS date)
          {tp_clause}
        ORDER BY t.mui, t.fecha DESC
    """)
    tickets = {r['mui']: r for r in db.execute(sql_ticket, params).mappings().all()}

    # Plan servicio (de ppto estado resultados)
    plan_clause = "AND p.mui = CAST(:mui AS int)" if mui else ""
    sql_plan = text(f"""
        SELECT p.mui,
               SUM(CASE WHEN p.rama = 'SERVICIO' AND p.seccion = 'INGRESOS'
                   THEN p.monto ELSE 0 END) AS plan_servicio,
               SUM(CASE WHEN p.tipo = 'MO' AND p.seccion = 'INGRESOS'
                   THEN p.monto ELSE 0 END) AS plan_mo
        FROM dwh.fact_ppto_estado_resultados p
        WHERE p.fecha >= CAST(:mes_inicio AS date)
          AND p.fecha < CAST(:mes_fin AS date)
          {plan_clause}
        GROUP BY p.mui
    """)
    planes = {r['mui']: r for r in db.execute(sql_plan, params).mappings().all()}

    # Merge
    for row in kpis:
        m = row['mui']
        c = contable.get(m, {})
        row['venta_total'] = c.get('venta_total', 0)
        row['venta_mo'] = c.get('venta_mo', 0)
        t = tickets.get(m)
        row['ticket_promedio'] = t['ticket_promedio'] if t else None
        p = planes.get(m, {})
        row['plan_servicio'] = p.get('plan_servicio', 0)
        row['plan_mo'] = p.get('plan_mo', 0)

    return kpis


def get_trend(db: Session, mui: int | None = None, anio_mes: str | None = None) -> list[dict]:
    """Rolling 12 meses de KPIs postventa."""
    _, mes_fin, anio_mes = _resolve_month(anio_mes)
    year, month = int(anio_mes[:4]), int(anio_mes[5:7])
    if month == 1:
        start = f"{year - 1}-02-01"
    else:
        start = f"{year - 1}-{month + 1:02d}-01" if month < 12 else f"{year}-01-01"
    mui_clause = "AND k.mui = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
        SELECT
            TO_CHAR(k.fecha, 'YYYY-MM') AS anio_mes,
            k.mui,
            SUM(k.cantidad) AS ots,
            ROUND(SUM(k.horas_mo), 2) AS horas_mo,
            COALESCE(cs.venta_total, 0) AS venta_total,
            COALESCE(cs.venta_mo, 0) AS venta_mo
        FROM dwh.fact_postventa_kpis k
        LEFT JOIN LATERAL (
            SELECT
                SUM(CASE WHEN c.tipo='Ingreso' THEN c.monto ELSE 0 END) AS venta_total,
                SUM(CASE WHEN c.tipo='MO' THEN c.monto ELSE 0 END) AS venta_mo
            FROM dwh.fact_contable_servicio c
            WHERE c.mui = k.mui
              AND TO_CHAR(c.fecha, 'YYYY-MM') = TO_CHAR(k.fecha, 'YYYY-MM')
        ) cs ON TRUE
        WHERE k.fecha >= CAST(:start AS date)
          AND k.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        GROUP BY TO_CHAR(k.fecha, 'YYYY-MM'), k.mui, cs.venta_total, cs.venta_mo
        ORDER BY anio_mes, k.mui
    """)
    params: dict = {"start": start, "mes_fin": mes_fin}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_ots_tendencia(db: Session, mui: int | None = None, anio_mes: str | None = None) -> dict:
    """OTs diarias acumuladas: mes actual + mes anterior + anio anterior.

    Retorna {
        puntos: [{fecha, ots_acumuladas, ots_mes_anterior, ots_anio_anterior}],
        totales: {ots_actual, ots_mes_anterior, ots_anio_anterior, var_mom_pct, var_yoy_pct},
        cutoff_day, dias_mes
    }
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
        return {"puntos": [], "totales": None, "cutoff_day": 0, "dias_mes": dias_mes}

    mes_inicio, mes_fin, _ = _resolve_month(anio_mes)
    mui_v = "AND k.mui = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
    WITH dias AS (
        SELECT generate_series(1, CAST(:cutoff_day AS int)) AS dom
    ),
    vc AS (
        SELECT EXTRACT(DAY FROM k.fecha)::int AS dom, SUM(k.cantidad)::int AS n
        FROM dwh.fact_postventa_kpis k
        WHERE k.fecha >= CAST(:mes_inicio AS date)
          AND k.fecha <  CAST(:mes_fin AS date)
          {mui_v}
        GROUP BY 1
    ),
    vp AS (
        SELECT EXTRACT(DAY FROM k.fecha)::int AS dom, SUM(k.cantidad)::int AS n
        FROM dwh.fact_postventa_kpis k
        WHERE k.fecha >= (CAST(:mes_inicio AS date) - INTERVAL '1 month')::date
          AND k.fecha <  CAST(:mes_inicio AS date)
          {mui_v}
        GROUP BY 1
    ),
    va AS (
        SELECT EXTRACT(DAY FROM k.fecha)::int AS dom, SUM(k.cantidad)::int AS n
        FROM dwh.fact_postventa_kpis k
        WHERE k.fecha >= (CAST(:mes_inicio AS date) - INTERVAL '1 year')::date
          AND k.fecha <  (CAST(:mes_fin AS date)    - INTERVAL '1 year')::date
          {mui_v}
        GROUP BY 1
    )
    SELECT
        CAST((CAST(:mes_inicio AS date) + (d.dom - 1) * INTERVAL '1 day')::date AS text) AS fecha,
        CAST(COALESCE(SUM(vc.n) OVER (ORDER BY d.dom), 0) AS int) AS ots_acumuladas,
        CAST(COALESCE(SUM(vp.n) OVER (ORDER BY d.dom), 0) AS int) AS ots_mes_anterior,
        CAST(COALESCE(SUM(va.n) OVER (ORDER BY d.dom), 0) AS int) AS ots_anio_anterior
    FROM dias d
    LEFT JOIN vc ON vc.dom = d.dom
    LEFT JOIN vp ON vp.dom = d.dom
    LEFT JOIN va ON va.dom = d.dom
    ORDER BY d.dom
    """)
    params: dict = {
        "mes_inicio": mes_inicio,
        "mes_fin": mes_fin,
        "cutoff_day": cutoff_day,
    }
    if mui:
        params["mui"] = mui

    puntos = [dict(r) for r in db.execute(sql, params).mappings().all()]

    def pct(curr: int, base: int) -> float | None:
        if base == 0:
            return None
        return round((curr / base - 1) * 100, 1)

    if puntos:
        last = puntos[-1]
        ots_actual = int(last["ots_acumuladas"] or 0)
        # Para comparables: mes anterior y anio anterior al mismo "dia del mes"
        ots_mes_ant = int(last["ots_mes_anterior"] or 0)
        ots_anio_ant = int(last["ots_anio_anterior"] or 0)
        totales = {
            "ots_actual": ots_actual,
            "ots_mes_anterior": ots_mes_ant,
            "ots_anio_anterior": ots_anio_ant,
            "var_mom_pct": pct(ots_actual, ots_mes_ant),
            "var_yoy_pct": pct(ots_actual, ots_anio_ant),
        }
    else:
        totales = None

    return {
        "puntos": puntos,
        "totales": totales,
        "cutoff_day": cutoff_day,
        "dias_mes": dias_mes,
    }


def get_os_abiertas(db: Session, mui: int | None = None) -> dict:
    """OS fuera de SLA — agregado."""
    mui_clause = "AND oa.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT oa.id_sucursal AS mui, oa.tipo_orden, oa.cantidad_os,
               CAST(oa.fecha_snapshot AS text) AS fecha_snapshot
        FROM dwh.fact_os_abierta oa
        WHERE oa.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_os_abierta)
          {mui_clause}
        ORDER BY oa.id_sucursal
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    agregado = [dict(r) for r in db.execute(sql, params).mappings().all()]
    return {"agregado": agregado}


def get_os_abiertas_detalle(db: Session, mui: int | None = None) -> list[dict]:
    """Drill-down de OS individuales fuera de SLA."""
    mui_clause = "AND od.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT od.id_sucursal AS mui, od.numero_ot, od.vin, od.tipo_orden,
               od.nombre_asesor, od.nombre_cliente,
               CAST(od.fecha_apertura AS text) AS fecha_apertura,
               od.dias_abierta, od.monto_venta, od.situacion, od.taller
        FROM dwh.fact_os_abierta_detalle od
        WHERE od.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_os_abierta_detalle)
          {mui_clause}
        ORDER BY od.dias_abierta DESC
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_refacciones(db: Session, mui: int | None = None) -> list[dict]:
    """Inventario refacciones por categoria."""
    mui_clause = "AND ir.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT ir.id_sucursal AS mui, s.nombre AS sucursal,
               ir.movimiento, ir.nuevo, ir.tec_obsoleto, ir.obsoleto,
               (ir.movimiento + ir.nuevo + ir.tec_obsoleto + ir.obsoleto) AS total
        FROM dwh.fact_inv_refacciones ir
        JOIN dwh.dim_sucursales s ON ir.id_sucursal = s.id_sucursal
        WHERE ir.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_inv_refacciones)
          {mui_clause}
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_uio(db: Session, mui: int | None = None) -> list[dict]:
    """Units In Operation por sucursal."""
    mui_clause = "AND u.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT u.id_sucursal AS mui, s.nombre AS sucursal, u.uio, u.uio_mp, u.uio_ap
        FROM dwh.fact_uio u
        JOIN dwh.dim_sucursales s ON u.id_sucursal = s.id_sucursal
        WHERE u.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_uio)
          {mui_clause}
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]
