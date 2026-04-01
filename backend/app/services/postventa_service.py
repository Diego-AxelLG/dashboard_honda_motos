"""Servicio de consultas: Postventa Honda Motos."""
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


def get_servicio_kpis(db: Session, mui: int | None = None, anio_mes: str | None = None) -> dict:
    """KPIs de servicio: fact_servicio_kpi + dealer_profile P1."""
    mes_inicio, mes_fin = _resolve_month(anio_mes)
    mui_clause = "AND sk.id_sucursal = CAST(:mui AS int)" if mui else ""

    # Agregado mensual de fact_servicio_kpi
    sql_kpi = text(f"""
        SELECT sk.id_sucursal, s.nombre AS sucursal,
               SUM(sk.cantidad_os) AS cantidad_os,
               ROUND(SUM(sk.horas_mo), 2) AS horas_mo,
               ROUND(SUM(sk.venta_mo), 2) AS venta_mo,
               ROUND(SUM(sk.venta_total_sin_iva), 2) AS venta_total
        FROM dwh.fact_servicio_kpi sk
        JOIN dwh.dim_sucursales s ON sk.id_sucursal = s.id_sucursal
        WHERE sk.fecha >= CAST(:mes_inicio AS date)
          AND sk.fecha < CAST(:mes_fin AS date)
          {mui_clause}
        GROUP BY sk.id_sucursal, s.nombre
        ORDER BY sk.id_sucursal
    """)
    params: dict = {"mes_inicio": mes_inicio, "mes_fin": mes_fin}
    if mui: params["mui"] = mui
    kpis = [dict(r) for r in db.execute(sql_kpi, params).mappings().all()]

    # Dealer profile P1 servicio
    dp_clause = "AND dp.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql_dp = text(f"""
        SELECT dp.id_sucursal, dp.dealer_profile_id, dp.nombre, dp.valor, dp.sub_valor
        FROM dwh.fact_dealer_profile dp
        WHERE dp.fecha >= CAST(:mes_inicio AS date)
          AND dp.fecha < CAST(:mes_fin AS date)
          AND dp.prioridad = 1
          AND dp.seccion IN ('Venta servicio', 'UIO')
          {dp_clause}
        ORDER BY dp.id_sucursal, dp.dealer_profile_id
    """)
    dealer = [dict(r) for r in db.execute(sql_dp, params).mappings().all()]

    # Ppto servicio
    ppto_clause = "AND ps.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql_ppto = text(f"""
        SELECT ps.id_sucursal, ps.tipo_ppto, ps.plan_ppto
        FROM dwh.fact_ppto_servicio ps
        WHERE ps.fecha >= CAST(:mes_inicio AS date)
          AND ps.fecha < CAST(:mes_fin AS date)
          {ppto_clause}
    """)
    ppto = [dict(r) for r in db.execute(sql_ppto, params).mappings().all()]

    return {"kpis": kpis, "dealer_profile": dealer, "presupuesto": ppto}


def get_os_abiertas(db: Session, mui: int | None = None) -> dict:
    """OS fuera de SLA — agregado + dealer profile."""
    mui_clause = "AND oa.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT oa.id_sucursal, oa.tipo_orden, oa.cantidad_os, CAST(oa.fecha_snapshot AS text)
        FROM dwh.fact_os_abierta oa
        WHERE oa.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_os_abierta)
          {mui_clause}
        ORDER BY oa.id_sucursal
    """)
    params: dict = {}
    if mui: params["mui"] = mui
    agregado = [dict(r) for r in db.execute(sql, params).mappings().all()]

    # DP OS Abiertas
    dp_clause = "AND dp.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql_dp = text(f"""
        SELECT dp.id_sucursal, dp.dealer_profile_id, dp.nombre, dp.valor
        FROM dwh.fact_dealer_profile dp
        WHERE dp.fecha = (SELECT MAX(fecha) FROM dwh.fact_dealer_profile WHERE prioridad=1)
          AND dp.dealer_profile_id IN (71, 72, 74, 76)
          {dp_clause}
    """)
    dp = [dict(r) for r in db.execute(sql_dp, params).mappings().all()]

    return {"agregado": agregado, "dealer_profile": dp}


def get_os_abiertas_detalle(db: Session, mui: int | None = None) -> list[dict]:
    """Drill-down de OS individuales fuera de SLA."""
    mui_clause = "AND od.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT od.id_sucursal, od.numero_ot, od.vin, od.tipo_orden,
               od.nombre_asesor, od.nombre_cliente,
               CAST(od.fecha_apertura AS text) AS fecha_apertura,
               od.dias_abierta, od.monto_venta, od.situacion, od.taller
        FROM dwh.fact_os_abierta_detalle od
        WHERE od.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_os_abierta_detalle)
          {mui_clause}
        ORDER BY od.dias_abierta DESC
    """)
    params: dict = {}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_refacciones(db: Session, mui: int | None = None) -> list[dict]:
    """Inventario refacciones por categoria."""
    mui_clause = "AND ir.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT ir.id_sucursal, s.nombre AS sucursal,
               ir.movimiento, ir.nuevo, ir.tec_obsoleto, ir.obsoleto,
               (ir.movimiento + ir.nuevo + ir.tec_obsoleto + ir.obsoleto) AS total
        FROM dwh.fact_inv_refacciones ir
        JOIN dwh.dim_sucursales s ON ir.id_sucursal = s.id_sucursal
        WHERE ir.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_inv_refacciones)
          {mui_clause}
    """)
    params: dict = {}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_uio(db: Session, mui: int | None = None) -> list[dict]:
    """Units In Operation por sucursal."""
    mui_clause = "AND u.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT u.id_sucursal, s.nombre AS sucursal, u.uio, u.uio_mp, u.uio_ap
        FROM dwh.fact_uio u
        JOIN dwh.dim_sucursales s ON u.id_sucursal = s.id_sucursal
        WHERE u.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_uio)
          {mui_clause}
    """)
    params: dict = {}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]
