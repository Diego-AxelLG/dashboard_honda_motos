"""Servicio de consultas: Inventario Honda Motos."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_aging(db: Session, mui: int | None = None) -> list[dict]:
    """Distribucion de aging por sucursal (snapshot mas reciente)."""
    mui_clause = "AND fi.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT fi.id_sucursal, s.nombre AS sucursal,
               SUM(CASE WHEN fi.dias_inventario BETWEEN 0 AND 30 THEN 1 ELSE 0 END) AS rango_0_30,
               SUM(CASE WHEN fi.dias_inventario BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS rango_31_60,
               SUM(CASE WHEN fi.dias_inventario BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS rango_61_90,
               SUM(CASE WHEN fi.dias_inventario > 90 THEN 1 ELSE 0 END) AS rango_90_plus,
               COUNT(*) AS total_unidades,
               ROUND(AVG(fi.dias_inventario), 1) AS edad_promedio
        FROM dwh.fact_inventario fi
        JOIN dwh.dim_sucursales s ON fi.id_sucursal = s.id_sucursal
        WHERE fi.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_inventario)
          {mui_clause}
        GROUP BY fi.id_sucursal, s.nombre
        ORDER BY fi.id_sucursal
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_resumen_stock(db: Session, mui: int | None = None) -> dict:
    """Resumen stock por sucursal + breakdown por modelo con meses de inventario.

    Estructura:
      { fecha_snapshot, sucursales: [{ mui, sucursal, total_stock, disponible,
        apartado, facturado, unidades_90_plus, pct_90_plus, edad_promedio,
        modelos: [{ modelo, disponible, apartado, facturado, total, meses_inventario }]
      }], total: {..} }
    """
    mui_clause_fi = "AND fi.id_sucursal = CAST(:mui AS int)" if mui else ""
    mui_clause_fv = "AND fv.id_sucursal = CAST(:mui AS int)" if mui else ""

    sql = text(f"""
        WITH snap AS (
            SELECT MAX(fecha_snapshot) AS d FROM dwh.fact_inventario
        ),
        ventas_avg AS (
            -- promedio mensual de ventas por (sucursal, modelo) ultimos 3 meses
            SELECT fv.id_sucursal, fv.modelo,
                   ROUND(COUNT(*)::numeric / 3.0, 2) AS vta_3m
            FROM dwh.fact_ventas fv
            WHERE fv.fecha >= (CURRENT_DATE - INTERVAL '3 months')
              AND fv.fecha <  CURRENT_DATE
              {mui_clause_fv}
            GROUP BY fv.id_sucursal, fv.modelo
        )
        SELECT fi.id_sucursal AS mui,
               s.nombre        AS sucursal,
               fi.modelo,
               SUM(CASE WHEN fi.estatus = 'Disponible' THEN 1 ELSE 0 END)::int AS disponible,
               SUM(CASE WHEN fi.estatus = 'Apartado'   THEN 1 ELSE 0 END)::int AS apartado,
               SUM(CASE WHEN fi.estatus = 'Facturado'  THEN 1 ELSE 0 END)::int AS facturado,
               COUNT(*)::int AS total,
               SUM(CASE WHEN fi.dias_inventario > 90 THEN 1 ELSE 0 END)::int AS n_90_plus,
               ROUND(AVG(fi.dias_inventario), 1) AS edad_promedio,
               va.vta_3m,
               CASE
                   WHEN va.vta_3m IS NULL OR va.vta_3m = 0 THEN NULL
                   ELSE ROUND(COUNT(*)::numeric / va.vta_3m, 1)
               END AS meses_inventario
        FROM dwh.fact_inventario fi
        JOIN dwh.dim_sucursales s ON fi.id_sucursal = s.id_sucursal
        JOIN snap                 ON fi.fecha_snapshot = snap.d
        LEFT JOIN ventas_avg va   ON va.id_sucursal = fi.id_sucursal
                                 AND va.modelo      = fi.modelo
        WHERE 1=1 {mui_clause_fi}
        GROUP BY fi.id_sucursal, s.nombre, fi.modelo, va.vta_3m
        ORDER BY fi.id_sucursal, total DESC, fi.modelo
    """)
    snap_sql = text("SELECT CAST(MAX(fecha_snapshot) AS text) AS d FROM dwh.fact_inventario")

    params: dict = {}
    if mui:
        params["mui"] = mui

    rows = [dict(r) for r in db.execute(sql, params).mappings().all()]
    fecha_snapshot = db.execute(snap_sql).scalar()

    # Agrupar por sucursal
    suc_map: dict[int, dict] = {}
    for r in rows:
        m = int(r["mui"])
        if m not in suc_map:
            suc_map[m] = {
                "mui": m,
                "sucursal": r["sucursal"],
                "total_stock": 0,
                "disponible": 0,
                "apartado": 0,
                "facturado": 0,
                "unidades_90_plus": 0,
                "edad_promedio": 0.0,
                "_edad_sum": 0.0,
                "_sum_vta_3m": 0.0,
                "modelos": [],
            }
        s = suc_map[m]
        s["total_stock"] += r["total"]
        s["disponible"] += r["disponible"]
        s["apartado"] += r["apartado"]
        s["facturado"] += r["facturado"]
        s["unidades_90_plus"] += r["n_90_plus"]
        s["_edad_sum"] += float(r["edad_promedio"] or 0) * r["total"]
        if r["vta_3m"] is not None:
            s["_sum_vta_3m"] += float(r["vta_3m"])
        s["modelos"].append({
            "modelo": r["modelo"],
            "disponible": r["disponible"],
            "apartado": r["apartado"],
            "facturado": r["facturado"],
            "total": r["total"],
            "vta_3m": float(r["vta_3m"]) if r["vta_3m"] is not None else None,
            "meses_inventario": float(r["meses_inventario"]) if r["meses_inventario"] is not None else None,
        })

    sucursales = []
    for s in suc_map.values():
        total = s["total_stock"]
        s["edad_promedio"] = round(s.pop("_edad_sum") / total, 1) if total else 0
        s["pct_90_plus"] = round((s["unidades_90_plus"] / total) * 100, 1) if total else 0.0
        vta_3m = s.pop("_sum_vta_3m")
        s["vta_3m_total"] = round(vta_3m, 2) if vta_3m > 0 else None
        s["meses_inventario_total"] = round(total / vta_3m, 1) if vta_3m > 0 and total else None
        s["_vta_3m_total"] = vta_3m  # se usa abajo para el agregado
        sucursales.append(s)
    sucursales.sort(key=lambda x: x["mui"])

    # Total agregado Honda Motos
    total_agg = {
        "mui": None,
        "sucursal": "Honda Motos",
        "total_stock": sum(s["total_stock"] for s in sucursales),
        "disponible": sum(s["disponible"] for s in sucursales),
        "apartado": sum(s["apartado"] for s in sucursales),
        "facturado": sum(s["facturado"] for s in sucursales),
        "unidades_90_plus": sum(s["unidades_90_plus"] for s in sucursales),
    }
    tot = total_agg["total_stock"]
    total_agg["pct_90_plus"] = round((total_agg["unidades_90_plus"] / tot) * 100, 1) if tot else 0.0
    total_agg["edad_promedio"] = round(
        sum(s["edad_promedio"] * s["total_stock"] for s in sucursales) / tot, 1
    ) if tot else 0.0
    vta_3m_total = sum(s.pop("_vta_3m_total") for s in sucursales)
    total_agg["vta_3m_total"] = round(vta_3m_total, 2) if vta_3m_total > 0 else None
    total_agg["meses_inventario_total"] = round(tot / vta_3m_total, 1) if vta_3m_total > 0 and tot else None

    # Modelos agregados cross-sucursal
    modelo_agg: dict[str, dict] = {}
    for s in sucursales:
        for mrow in s["modelos"]:
            mk = mrow["modelo"]
            if mk not in modelo_agg:
                modelo_agg[mk] = {"modelo": mk, "disponible": 0, "apartado": 0, "facturado": 0, "total": 0, "_vta_3m": 0.0, "_tiene_venta": False}
            m = modelo_agg[mk]
            m["disponible"] += mrow["disponible"]
            m["apartado"] += mrow["apartado"]
            m["facturado"] += mrow["facturado"]
            m["total"] += mrow["total"]
            if mrow["vta_3m"] is not None:
                m["_vta_3m"] += mrow["vta_3m"]
                m["_tiene_venta"] = True

    total_agg["modelos"] = []
    for m in sorted(modelo_agg.values(), key=lambda x: -x["total"]):
        vta = m.pop("_vta_3m")
        tiene = m.pop("_tiene_venta")
        m["vta_3m"] = round(vta, 2) if tiene else None
        m["meses_inventario"] = round(m["total"] / vta, 1) if tiene and vta > 0 else None
        total_agg["modelos"].append(m)

    return {
        "fecha_snapshot": fecha_snapshot,
        "sucursales": sucursales,
        "total": total_agg,
    }


def get_detalle(db: Session, mui: int | None = None) -> list[dict]:
    """Detalle VIN por VIN del snapshot mas reciente."""
    mui_clause = "AND fi.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT fi.id_sucursal AS mui,
               s.nombre       AS sucursal,
               fi.vin, fi.modelo, fi.color, fi.anio,
               fi.dias_inventario, fi.dias_apartado, fi.estatus,
               fi.facturado, CAST(fi.fecha_facturacion AS text) AS fecha_facturacion,
               fi.tipo_compra, fi.status_proceso,
               CASE
                   WHEN fi.dias_inventario <= 30 THEN '0-30'
                   WHEN fi.dias_inventario <= 60 THEN '31-60'
                   WHEN fi.dias_inventario <= 90 THEN '61-90'
                   ELSE '+90'
               END AS rango
        FROM dwh.fact_inventario fi
        JOIN dwh.dim_sucursales s ON fi.id_sucursal = s.id_sucursal
        WHERE fi.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_inventario)
          {mui_clause}
        ORDER BY fi.id_sucursal, fi.dias_inventario DESC
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_apartados(db: Session, mui: int | None = None) -> list[dict]:
    """Detalle de unidades apartadas con info del asesor + cliente."""
    mui_clause = "AND fi.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT fi.id_sucursal AS mui,
               s.nombre       AS sucursal,
               fi.vin, fi.modelo, fi.color, fi.anio,
               fi.dias_inventario, fi.dias_apartado, fi.estatus,
               fi.asesor_nombre, fi.asesor_id, fi.cliente_nombre,
               CAST(fi.fecha_apartado AS text) AS fecha_apartado
        FROM dwh.fact_inventario fi
        JOIN dwh.dim_sucursales s ON fi.id_sucursal = s.id_sucursal
        WHERE fi.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_inventario)
          AND fi.estatus = 'Apartado'
          {mui_clause}
        ORDER BY fi.id_sucursal, fi.dias_apartado DESC NULLS LAST
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]
