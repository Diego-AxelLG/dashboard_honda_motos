"""ETL Cobranza — Honda Motos.

Pobla:
  - dwh.fact_cxc_detalle  (snapshot diario desde sicofi.cxc_intelisis)

Mantiene compromisos (CxC y OS):
  - Genera compromisos automaticos cuando cambia observaciones (CxC) o situacion (OS)
    entre el snapshot actual y el anterior. registrado_por='CRM', 60 dias.
  - Transiciona estados: activo -> vencido (fecha pasada y sigue en snapshot) y
    activo/vencido -> cumplido (ya no aparece en el snapshot = se cobro/cerro).

Requiere que etl_os_abierta.py haya corrido ANTES en la misma corrida del cron,
ya que la lógica de compromisos OS depende de tener el snapshot del día cargado.
"""

import os
import sys
from datetime import date

import pandas as pd
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)
from etl.utils import setup_logger, DatabaseConnector, read_sql_file

load_dotenv()
ETL_NAME = "cobranza"
logger = setup_logger()


# ---------------------------------------------------------------------------
# 1. Carga snapshot CxC desde sicofi
# ---------------------------------------------------------------------------
def cargar_cxc_detalle(sicofi_engine, pg_engine) -> int:
    """DELETE snapshot del día + INSERT desde sicofi.cxc_intelisis."""
    sql = read_sql_file(os.path.join(PROJECT_ROOT, "etl/extract/postventa/extract_cxc_detalle.sql"))
    df = pd.read_sql(sql, sicofi_engine)
    df.columns = [c.lower() for c in df.columns]

    if df.empty:
        logger.warning("   No hay datos de CxC para hoy")
        return 0

    df["id_sucursal"] = df["id_sucursal"].astype(int)
    df["dias_vencido"] = pd.to_numeric(df["dias_vencido"], errors="coerce").fillna(0).astype(int)
    df["saldo_vencido"] = pd.to_numeric(df["saldo_vencido"], errors="coerce").fillna(0)

    today = date.today()
    with pg_engine.begin() as conn:
        deleted = conn.execute(
            text("DELETE FROM dwh.fact_cxc_detalle WHERE fecha_snapshot = :d"),
            {"d": today},
        ).rowcount
        if deleted:
            logger.info(f"   {deleted} registros CxC previos eliminados para {today}")
        df.to_sql("fact_cxc_detalle", conn, schema="dwh", if_exists="append", index=False)

    logger.info(f"   {len(df)} registros cargados en dwh.fact_cxc_detalle")
    return len(df)


# ---------------------------------------------------------------------------
# 2. Compromisos automaticos CxC desde "observaciones"
# ---------------------------------------------------------------------------
def actualizar_compromisos_cxc_desde_observaciones(pg_engine) -> int:
    """Detecta cambios en `observaciones` entre los 2 snapshots mas recientes.

    Para cada (movimiento, id_sucursal) cuya observacion cambio (o es nueva y no vacia):
      - cierra cualquier compromiso 'activo' previo como 'cumplido'
      - inserta nuevo compromiso registrado_por='CRM', fecha_compromiso = HOY + 60 dias

    Retorna numero de compromisos CRM creados.
    """
    with pg_engine.begin() as conn:
        snapshots = conn.execute(text("""
            SELECT DISTINCT fecha_snapshot
            FROM dwh.fact_cxc_detalle
            ORDER BY fecha_snapshot DESC
            LIMIT 2
        """)).scalars().all()
        if not snapshots:
            return 0

        current = snapshots[0]
        previous = snapshots[1] if len(snapshots) > 1 else None

        if previous is not None:
            changed = conn.execute(text("""
                WITH cur AS (
                    SELECT movimiento, id_sucursal, observaciones
                    FROM dwh.fact_cxc_detalle
                    WHERE fecha_snapshot = :cur
                ),
                prev AS (
                    SELECT movimiento, id_sucursal, observaciones
                    FROM dwh.fact_cxc_detalle
                    WHERE fecha_snapshot = :prev
                )
                SELECT c.movimiento, c.id_sucursal, c.observaciones
                FROM cur c
                LEFT JOIN prev p
                  ON p.movimiento = c.movimiento AND p.id_sucursal = c.id_sucursal
                WHERE c.observaciones IS NOT NULL
                  AND c.observaciones <> ''
                  AND (p.movimiento IS NULL OR COALESCE(p.observaciones, '') <> c.observaciones)
            """), {"cur": current, "prev": previous}).mappings().all()
        else:
            changed = conn.execute(text("""
                SELECT movimiento, id_sucursal, observaciones
                FROM dwh.fact_cxc_detalle
                WHERE fecha_snapshot = :cur
                  AND observaciones IS NOT NULL AND observaciones <> ''
            """), {"cur": current}).mappings().all()

        created = 0
        for row in changed:
            conn.execute(text("""
                UPDATE dwh.fact_compromiso_cxc
                SET estado = 'cumplido'
                WHERE movimiento = :mov AND id_sucursal = :suc AND estado = 'activo'
            """), {"mov": row["movimiento"], "suc": row["id_sucursal"]})

            conn.execute(text("""
                INSERT INTO dwh.fact_compromiso_cxc
                    (movimiento, id_sucursal, comentario, fecha_compromiso, registrado_por)
                VALUES (:mov, :suc, :comentario, CURRENT_DATE + 60, 'CRM')
            """), {
                "mov": row["movimiento"],
                "suc": row["id_sucursal"],
                "comentario": row["observaciones"],
            })
            created += 1

    if created:
        logger.info(f"   {created} compromisos CRM creados desde observaciones CxC")
    return created


# ---------------------------------------------------------------------------
# 3. Compromisos automaticos OS desde "situacion"
# ---------------------------------------------------------------------------
def actualizar_compromisos_os_desde_situacion(pg_engine) -> int:
    """Misma logica que CxC pero sobre fact_os_abierta_detalle.situacion."""
    with pg_engine.begin() as conn:
        snapshots = conn.execute(text("""
            SELECT DISTINCT fecha_snapshot
            FROM dwh.fact_os_abierta_detalle
            ORDER BY fecha_snapshot DESC
            LIMIT 2
        """)).scalars().all()
        if not snapshots:
            return 0

        current = snapshots[0]
        previous = snapshots[1] if len(snapshots) > 1 else None

        if previous is not None:
            changed = conn.execute(text("""
                WITH cur AS (
                    SELECT numero_ot, id_sucursal, situacion
                    FROM dwh.fact_os_abierta_detalle
                    WHERE fecha_snapshot = :cur
                ),
                prev AS (
                    SELECT numero_ot, id_sucursal, situacion
                    FROM dwh.fact_os_abierta_detalle
                    WHERE fecha_snapshot = :prev
                )
                SELECT c.numero_ot, c.id_sucursal, c.situacion
                FROM cur c
                LEFT JOIN prev p
                  ON p.numero_ot = c.numero_ot AND p.id_sucursal = c.id_sucursal
                WHERE c.situacion IS NOT NULL AND c.situacion <> ''
                  AND (p.numero_ot IS NULL OR COALESCE(p.situacion, '') <> c.situacion)
            """), {"cur": current, "prev": previous}).mappings().all()
        else:
            changed = conn.execute(text("""
                SELECT numero_ot, id_sucursal, situacion
                FROM dwh.fact_os_abierta_detalle
                WHERE fecha_snapshot = :cur
                  AND situacion IS NOT NULL AND situacion <> ''
            """), {"cur": current}).mappings().all()

        created = 0
        for row in changed:
            conn.execute(text("""
                UPDATE dwh.fact_compromiso_os
                SET estado = 'cumplido'
                WHERE numero_ot = :ot AND id_sucursal = :suc AND estado = 'activo'
            """), {"ot": row["numero_ot"], "suc": row["id_sucursal"]})

            conn.execute(text("""
                INSERT INTO dwh.fact_compromiso_os
                    (numero_ot, id_sucursal, comentario, fecha_compromiso, registrado_por)
                VALUES (:ot, :suc, :comentario, CURRENT_DATE + 60, 'CRM')
            """), {
                "ot": row["numero_ot"],
                "suc": row["id_sucursal"],
                "comentario": row["situacion"],
            })
            created += 1

    if created:
        logger.info(f"   {created} compromisos CRM creados desde situacion OS")
    return created


# ---------------------------------------------------------------------------
# 4. Transicion de estados activo -> vencido / cumplido
# ---------------------------------------------------------------------------
def actualizar_estado_compromisos(pg_engine) -> None:
    """Aplica reglas a fact_compromiso_cxc y fact_compromiso_os:
      1) activo -> vencido: si fecha_compromiso < hoy Y la entidad sigue en snapshot.
      2) activo/vencido -> cumplido: si la entidad ya no aparece en el snapshot.
    """
    with pg_engine.begin() as conn:
        latest_cxc = conn.execute(text(
            "SELECT MAX(fecha_snapshot) FROM dwh.fact_cxc_detalle"
        )).scalar()

        if latest_cxc:
            v = conn.execute(text("""
                UPDATE dwh.fact_compromiso_cxc c
                SET estado = 'vencido'
                WHERE c.estado = 'activo'
                  AND c.fecha_compromiso < CURRENT_DATE
                  AND EXISTS (
                      SELECT 1 FROM dwh.fact_cxc_detalle d
                      WHERE d.movimiento = c.movimiento
                        AND d.id_sucursal = c.id_sucursal
                        AND d.fecha_snapshot = :latest
                  )
            """), {"latest": latest_cxc}).rowcount

            cu = conn.execute(text("""
                UPDATE dwh.fact_compromiso_cxc c
                SET estado = 'cumplido'
                WHERE c.estado IN ('activo', 'vencido')
                  AND NOT EXISTS (
                      SELECT 1 FROM dwh.fact_cxc_detalle d
                      WHERE d.movimiento = c.movimiento
                        AND d.id_sucursal = c.id_sucursal
                        AND d.fecha_snapshot = :latest
                  )
            """), {"latest": latest_cxc}).rowcount

            if v or cu:
                logger.info(f"   CxC: {v} activo->vencido, {cu} -> cumplido")

        latest_os = conn.execute(text(
            "SELECT MAX(fecha_snapshot) FROM dwh.fact_os_abierta_detalle"
        )).scalar()

        if latest_os:
            v = conn.execute(text("""
                UPDATE dwh.fact_compromiso_os c
                SET estado = 'vencido'
                WHERE c.estado = 'activo'
                  AND c.fecha_compromiso < CURRENT_DATE
                  AND EXISTS (
                      SELECT 1 FROM dwh.fact_os_abierta_detalle d
                      WHERE d.numero_ot = c.numero_ot
                        AND d.id_sucursal = c.id_sucursal
                        AND d.fecha_snapshot = :latest
                  )
            """), {"latest": latest_os}).rowcount

            cu = conn.execute(text("""
                UPDATE dwh.fact_compromiso_os c
                SET estado = 'cumplido'
                WHERE c.estado IN ('activo', 'vencido')
                  AND NOT EXISTS (
                      SELECT 1 FROM dwh.fact_os_abierta_detalle d
                      WHERE d.numero_ot = c.numero_ot
                        AND d.id_sucursal = c.id_sucursal
                        AND d.fecha_snapshot = :latest
                  )
            """), {"latest": latest_os}).rowcount

            if v or cu:
                logger.info(f"   OS: {v} activo->vencido, {cu} -> cumplido")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    logger.info(f"Inicio ETL '{ETL_NAME}'")
    try:
        sicofi = DatabaseConnector("sicofi").get_engine()
        pg = DatabaseConnector("postgres").get_engine()

        logger.info("Cargando fact_cxc_detalle...")
        cargar_cxc_detalle(sicofi, pg)

        logger.info("Generando compromisos CRM desde observaciones CxC...")
        actualizar_compromisos_cxc_desde_observaciones(pg)

        logger.info("Generando compromisos CRM desde situacion OS...")
        actualizar_compromisos_os_desde_situacion(pg)

        logger.info("Transicionando estados de compromisos...")
        actualizar_estado_compromisos(pg)

        with pg.connect() as conn:
            conn.execute(
                text("UPDATE dwh.etl_last_run SET last_run_at=NOW() WHERE etl_name=:n"),
                {"n": ETL_NAME},
            )
            conn.commit()

        logger.info(f"ETL '{ETL_NAME}' completado")

    except (SQLAlchemyError, Exception) as e:
        logger.critical(f"ERROR: {e}", exc_info=True)
        sys.exit(1)
    finally:
        DatabaseConnector("sicofi").dispose()
        DatabaseConnector("postgres").dispose()


if __name__ == "__main__":
    main()
