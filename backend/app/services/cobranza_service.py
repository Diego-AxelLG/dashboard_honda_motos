"""Servicio de consultas: Cobranza (CxC + OS abiertas + compromisos).

CxC: facturas vencidas con sistema de compromisos de cobro.
OS:  ordenes de servicio fuera de SLA con sistema de compromisos de cierre.

Patron comun:
  - summary: pivot agencia x categoria/tipo_orden sobre el ultimo snapshot.
  - detalle: lista plana por sucursal con compromiso_activo nested.
  - compromisos: historial, POST (crear), PATCH (editar comentario).
"""

from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# CxC
# ---------------------------------------------------------------------------
def get_cxc_summary(db: Session, mui: int | None = None) -> list[dict]:
    """Pivot por sucursal y categoria sobre el snapshot mas reciente."""
    mui_clause = "AND d.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        WITH latest AS (
            SELECT MAX(fecha_snapshot) AS fecha FROM dwh.fact_cxc_detalle
        )
        SELECT
            d.id_sucursal AS mui,
            s.nombre      AS sucursal,
            COALESCE(d.categoria, 'Sin categoria') AS categoria,
            COUNT(*)                               AS cantidad_cxc,
            COALESCE(SUM(d.saldo_vencido), 0)      AS saldo_total
        FROM dwh.fact_cxc_detalle d
        JOIN latest l ON d.fecha_snapshot = l.fecha
        JOIN dwh.dim_sucursales s ON s.id_sucursal = d.id_sucursal
        WHERE 1=1 {mui_clause}
        GROUP BY d.id_sucursal, s.nombre, d.categoria
        ORDER BY s.nombre, categoria
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_cxc_detalle(db: Session, mui: int) -> list[dict]:
    """Detalle individual de facturas con compromiso_activo nested."""
    sql = text("""
        WITH latest AS (
            SELECT MAX(fecha_snapshot) AS fecha FROM dwh.fact_cxc_detalle
        ),
        compromisos_agg AS (
            SELECT
                movimiento, id_sucursal,
                COUNT(*) FILTER (WHERE estado = 'vencido') AS qty_vencidos,
                MAX(id) FILTER (WHERE estado = 'activo')   AS compromiso_activo_id
            FROM dwh.fact_compromiso_cxc
            GROUP BY movimiento, id_sucursal
        )
        SELECT
            d.movimiento,
            d.cliente,
            d.categoria,
            CAST(d.fecha_emision AS text) AS fecha_emision,
            d.dias_vencido,
            d.saldo_vencido,
            d.observaciones,
            d.id_sucursal AS mui,
            s.nombre AS sucursal,
            COALESCE(ca.qty_vencidos, 0) AS compromisos_vencidos,
            c.id                          AS compromiso_id,
            c.comentario                  AS compromiso_comentario,
            CAST(c.fecha_compromiso AS text)         AS fecha_compromiso,
            to_char(c.fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                AS compromiso_fecha_registro,
            c.estado AS compromiso_estado,
            (c.fecha_compromiso - CURRENT_DATE) AS dias_restantes
        FROM dwh.fact_cxc_detalle d
        CROSS JOIN latest l
        JOIN dwh.dim_sucursales s ON s.id_sucursal = d.id_sucursal
        LEFT JOIN compromisos_agg ca
               ON ca.movimiento = d.movimiento AND ca.id_sucursal = d.id_sucursal
        LEFT JOIN dwh.fact_compromiso_cxc c ON c.id = ca.compromiso_activo_id
        WHERE d.fecha_snapshot = l.fecha
          AND d.id_sucursal = CAST(:mui AS int)
        ORDER BY COALESCE(ca.qty_vencidos, 0) DESC, d.dias_vencido DESC
    """)
    rows = db.execute(sql, {"mui": mui}).mappings().all()
    out: list[dict] = []
    for r in rows:
        compromiso = None
        if r["compromiso_id"] is not None:
            compromiso = {
                "id": r["compromiso_id"],
                "comentario": r["compromiso_comentario"],
                "fecha_compromiso": r["fecha_compromiso"],
                "fecha_registro": r["compromiso_fecha_registro"],
                "estado": r["compromiso_estado"],
                "dias_restantes": int(r["dias_restantes"]) if r["dias_restantes"] is not None else None,
            }
        out.append({
            "mui": r["mui"],
            "sucursal": r["sucursal"],
            "movimiento": r["movimiento"],
            "cliente": r["cliente"],
            "categoria": r["categoria"],
            "fecha_emision": r["fecha_emision"],
            "dias_vencido": r["dias_vencido"],
            "saldo_vencido": float(r["saldo_vencido"]) if r["saldo_vencido"] is not None else None,
            "observaciones": r["observaciones"],
            "compromiso_activo": compromiso,
            "compromisos_vencidos": int(r["compromisos_vencidos"]),
        })
    return out


def get_cxc_compromisos_historial(db: Session, movimiento: str, mui: int) -> list[dict]:
    sql = text("""
        SELECT
            id,
            comentario,
            CAST(fecha_compromiso AS text) AS fecha_compromiso,
            to_char(fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                AS fecha_registro,
            estado,
            CASE WHEN estado = 'activo'
                 THEN (fecha_compromiso - CURRENT_DATE)
                 ELSE NULL END AS dias_restantes,
            registrado_por
        FROM dwh.fact_compromiso_cxc
        WHERE movimiento = :mov AND id_sucursal = CAST(:mui AS int)
        ORDER BY fecha_registro DESC
    """)
    return [dict(r) for r in db.execute(sql, {"mov": movimiento, "mui": mui}).mappings().all()]


def create_cxc_compromiso(db: Session, movimiento: str, mui: int, comentario: str, dias: int) -> dict:
    if dias not in (15, 30, 45, 60):
        raise HTTPException(422, detail="dias_compromiso debe ser 15, 30, 45 o 60")
    if len(comentario.strip()) < 5:
        raise HTTPException(422, detail="comentario debe tener al menos 5 caracteres")

    existing = db.execute(text("""
        SELECT id FROM dwh.fact_compromiso_cxc
        WHERE movimiento = :mov AND id_sucursal = CAST(:mui AS int) AND estado = 'activo'
        LIMIT 1
    """), {"mov": movimiento, "mui": mui}).fetchone()
    if existing:
        raise HTTPException(409, detail="Ya existe un compromiso activo para esta factura")

    row = db.execute(text("""
        INSERT INTO dwh.fact_compromiso_cxc
            (movimiento, id_sucursal, comentario, fecha_compromiso, registrado_por)
        VALUES (:mov, CAST(:mui AS int), :com, CURRENT_DATE + CAST(:dias AS int), 'dashboard')
        RETURNING
            id,
            comentario,
            CAST(fecha_compromiso AS text) AS fecha_compromiso,
            to_char(fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                AS fecha_registro,
            estado,
            (fecha_compromiso - CURRENT_DATE) AS dias_restantes
    """), {"mov": movimiento, "mui": mui, "com": comentario, "dias": dias}).mappings().one()
    db.commit()
    return {
        "id": row["id"],
        "comentario": row["comentario"],
        "fecha_compromiso": row["fecha_compromiso"],
        "fecha_registro": row["fecha_registro"],
        "estado": row["estado"],
        "dias_restantes": int(row["dias_restantes"]) if row["dias_restantes"] is not None else None,
    }


def update_cxc_compromiso_comentario(db: Session, compromiso_id: int, comentario: str) -> dict:
    if len(comentario.strip()) < 5:
        raise HTTPException(422, detail="comentario debe tener al menos 5 caracteres")
    row = db.execute(text("""
        UPDATE dwh.fact_compromiso_cxc
        SET comentario = :com
        WHERE id = CAST(:id AS int) AND estado = 'activo'
        RETURNING
            id, comentario,
            CAST(fecha_compromiso AS text) AS fecha_compromiso,
            to_char(fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                AS fecha_registro,
            estado,
            (fecha_compromiso - CURRENT_DATE) AS dias_restantes
    """), {"id": compromiso_id, "com": comentario}).mappings().fetchone()
    if not row:
        raise HTTPException(404, detail="Compromiso activo no encontrado")
    db.commit()
    return {
        "id": row["id"],
        "comentario": row["comentario"],
        "fecha_compromiso": row["fecha_compromiso"],
        "fecha_registro": row["fecha_registro"],
        "estado": row["estado"],
        "dias_restantes": int(row["dias_restantes"]) if row["dias_restantes"] is not None else None,
    }


# ---------------------------------------------------------------------------
# OS abiertas (versión "cobranza" con compromisos)
# ---------------------------------------------------------------------------
def get_os_summary(db: Session, mui: int | None = None) -> list[dict]:
    mui_clause = "AND d.id_sucursal = CAST(:mui AS int)" if mui else ""
    sql = text(f"""
        WITH latest AS (
            SELECT MAX(fecha_snapshot) AS fecha FROM dwh.fact_os_abierta_detalle
        )
        SELECT
            d.id_sucursal AS mui,
            s.nombre      AS sucursal,
            d.tipo_orden,
            COUNT(*)      AS cantidad_os
        FROM dwh.fact_os_abierta_detalle d
        JOIN latest l ON d.fecha_snapshot = l.fecha
        JOIN dwh.dim_sucursales s ON s.id_sucursal = d.id_sucursal
        WHERE COALESCE(d.monto_venta, 0) > 1 {mui_clause}
        GROUP BY d.id_sucursal, s.nombre, d.tipo_orden
        ORDER BY s.nombre, d.tipo_orden
    """)
    params: dict = {}
    if mui:
        params["mui"] = mui
    return [dict(r) for r in db.execute(sql, params).mappings().all()]


def get_os_detalle(db: Session, mui: int) -> list[dict]:
    sql = text("""
        WITH latest AS (
            SELECT MAX(fecha_snapshot) AS fecha FROM dwh.fact_os_abierta_detalle
        ),
        compromisos_agg AS (
            SELECT
                numero_ot, id_sucursal,
                COUNT(*) FILTER (WHERE estado = 'vencido') AS qty_vencidos,
                MAX(id) FILTER (WHERE estado = 'activo')   AS compromiso_activo_id
            FROM dwh.fact_compromiso_os
            GROUP BY numero_ot, id_sucursal
        )
        SELECT
            d.numero_ot,
            d.vin,
            d.tipo_orden,
            d.nombre_asesor,
            d.nombre_cliente,
            CAST(d.fecha_apertura AS text) AS fecha_apertura,
            d.dias_abierta,
            d.monto_venta,
            d.situacion,
            d.taller,
            d.id_sucursal AS mui,
            s.nombre      AS sucursal,
            COALESCE(ca.qty_vencidos, 0) AS compromisos_vencidos,
            c.id                          AS compromiso_id,
            c.comentario                  AS compromiso_comentario,
            CAST(c.fecha_compromiso AS text) AS fecha_compromiso,
            to_char(c.fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                AS compromiso_fecha_registro,
            c.estado AS compromiso_estado,
            (c.fecha_compromiso - CURRENT_DATE) AS dias_restantes
        FROM dwh.fact_os_abierta_detalle d
        CROSS JOIN latest l
        JOIN dwh.dim_sucursales s ON s.id_sucursal = d.id_sucursal
        LEFT JOIN compromisos_agg ca
               ON ca.numero_ot = d.numero_ot AND ca.id_sucursal = d.id_sucursal
        LEFT JOIN dwh.fact_compromiso_os c ON c.id = ca.compromiso_activo_id
        WHERE d.fecha_snapshot = l.fecha
          AND d.id_sucursal = CAST(:mui AS int)
          AND COALESCE(d.monto_venta, 0) > 1
        ORDER BY COALESCE(ca.qty_vencidos, 0) DESC, d.dias_abierta DESC
    """)
    rows = db.execute(sql, {"mui": mui}).mappings().all()
    out: list[dict] = []
    for r in rows:
        compromiso = None
        if r["compromiso_id"] is not None:
            compromiso = {
                "id": r["compromiso_id"],
                "comentario": r["compromiso_comentario"],
                "fecha_compromiso": r["fecha_compromiso"],
                "fecha_registro": r["compromiso_fecha_registro"],
                "estado": r["compromiso_estado"],
                "dias_restantes": int(r["dias_restantes"]) if r["dias_restantes"] is not None else None,
            }
        out.append({
            "mui": r["mui"],
            "sucursal": r["sucursal"],
            "numero_ot": r["numero_ot"],
            "vin": r["vin"],
            "tipo_orden": r["tipo_orden"],
            "nombre_asesor": r["nombre_asesor"],
            "nombre_cliente": r["nombre_cliente"],
            "fecha_apertura": r["fecha_apertura"],
            "dias_abierta": r["dias_abierta"],
            "monto_venta": float(r["monto_venta"]) if r["monto_venta"] is not None else 0.0,
            "situacion": r["situacion"],
            "taller": r["taller"],
            "compromiso_activo": compromiso,
            "compromisos_vencidos": int(r["compromisos_vencidos"]),
        })
    return out


def get_os_compromisos_historial(db: Session, numero_ot: str, mui: int) -> list[dict]:
    sql = text("""
        SELECT
            id,
            comentario,
            CAST(fecha_compromiso AS text) AS fecha_compromiso,
            to_char(fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                AS fecha_registro,
            estado,
            CASE WHEN estado = 'activo'
                 THEN (fecha_compromiso - CURRENT_DATE)
                 ELSE NULL END AS dias_restantes,
            registrado_por
        FROM dwh.fact_compromiso_os
        WHERE numero_ot = :ot AND id_sucursal = CAST(:mui AS int)
        ORDER BY fecha_registro DESC
    """)
    return [dict(r) for r in db.execute(sql, {"ot": numero_ot, "mui": mui}).mappings().all()]


def create_os_compromiso(db: Session, numero_ot: str, mui: int, comentario: str, dias: int) -> dict:
    if dias not in (15, 30, 45, 60):
        raise HTTPException(422, detail="dias_compromiso debe ser 15, 30, 45 o 60")
    if len(comentario.strip()) < 5:
        raise HTTPException(422, detail="comentario debe tener al menos 5 caracteres")

    existing = db.execute(text("""
        SELECT id FROM dwh.fact_compromiso_os
        WHERE numero_ot = :ot AND id_sucursal = CAST(:mui AS int) AND estado = 'activo'
        LIMIT 1
    """), {"ot": numero_ot, "mui": mui}).fetchone()
    if existing:
        raise HTTPException(409, detail="Ya existe un compromiso activo para esta OT")

    row = db.execute(text("""
        INSERT INTO dwh.fact_compromiso_os
            (numero_ot, id_sucursal, comentario, fecha_compromiso, registrado_por)
        VALUES (:ot, CAST(:mui AS int), :com, CURRENT_DATE + CAST(:dias AS int), 'dashboard')
        RETURNING
            id, comentario,
            CAST(fecha_compromiso AS text) AS fecha_compromiso,
            to_char(fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                AS fecha_registro,
            estado,
            (fecha_compromiso - CURRENT_DATE) AS dias_restantes
    """), {"ot": numero_ot, "mui": mui, "com": comentario, "dias": dias}).mappings().one()
    db.commit()
    return {
        "id": row["id"],
        "comentario": row["comentario"],
        "fecha_compromiso": row["fecha_compromiso"],
        "fecha_registro": row["fecha_registro"],
        "estado": row["estado"],
        "dias_restantes": int(row["dias_restantes"]) if row["dias_restantes"] is not None else None,
    }


def update_os_compromiso_comentario(db: Session, compromiso_id: int, comentario: str) -> dict:
    if len(comentario.strip()) < 5:
        raise HTTPException(422, detail="comentario debe tener al menos 5 caracteres")
    row = db.execute(text("""
        UPDATE dwh.fact_compromiso_os
        SET comentario = :com
        WHERE id = CAST(:id AS int) AND estado = 'activo'
        RETURNING
            id, comentario,
            CAST(fecha_compromiso AS text) AS fecha_compromiso,
            to_char(fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                AS fecha_registro,
            estado,
            (fecha_compromiso - CURRENT_DATE) AS dias_restantes
    """), {"id": compromiso_id, "com": comentario}).mappings().fetchone()
    if not row:
        raise HTTPException(404, detail="Compromiso activo no encontrado")
    db.commit()
    return {
        "id": row["id"],
        "comentario": row["comentario"],
        "fecha_compromiso": row["fecha_compromiso"],
        "fecha_registro": row["fecha_registro"],
        "estado": row["estado"],
        "dias_restantes": int(row["dias_restantes"]) if row["dias_restantes"] is not None else None,
    }
