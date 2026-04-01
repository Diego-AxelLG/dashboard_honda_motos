"""Servicio de consultas: Inventario Honda Motos."""
from sqlalchemy import text
from sqlalchemy.orm import Session


def get_aging(db: Session, mui: int | None = None) -> list[dict]:
    """Distribucion de aging por sucursal."""
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
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_detalle(db: Session, mui: int | None = None) -> list[dict]:
    """Detalle por VIN con dias en piso."""
    mui_clause = "AND fi.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        SELECT fi.id_sucursal, s.nombre AS sucursal,
               fi.modelo, fi.dias_inventario, fi.estatus,
               CAST(fi.fecha_snapshot AS text) AS fecha_snapshot
        FROM dwh.fact_inventario fi
        JOIN dwh.dim_sucursales s ON fi.id_sucursal = s.id_sucursal
        WHERE fi.fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_inventario)
          {mui_clause}
        ORDER BY fi.dias_inventario DESC
        LIMIT 500
    """)
    params: dict = {}
    if mui: params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]
