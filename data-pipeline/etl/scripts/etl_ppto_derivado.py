"""
============================================================================
 ETL Ppto Derivado — Honda Motos
============================================================================
Genera presupuestos del año destino a partir del real del año origen,
multiplicado por un factor (default 1.10 = +10%):

  1) fact_ppto_estado_resultados (financiero)
       Real: dwh.fact_estado_resultados (sicofi)
       Aplica a TODAS las secciones (INGRESOS, COSTOS, GASTOS) preservando
       granularidad rama/tipo/mui. Convención de signos: el real tiene
       COSTOS/GASTOS negativos; el ppto los necesita positivos
       (convención balanza_ppto), así que invertimos esas secciones.

  2) fact_plan_postventa (tipo='ots') (operación postventa)
       Real: dwh.fact_postventa_kpis.cantidad agregado por mes/mui
       Resultado: meta mensual de OTs por sucursal (entera).

POLITICA DE COLISION:
  ON CONFLICT DO UPDATE — el derivado SIEMPRE GANA. Si llega ppto real
  desde sicofi (o un CSV de plan OTs) para el año destino, este script lo
  sobreescribe en la siguiente corrida. La regla del negocio es:
  ppto 2026 = real 2025 x 1.10 fija, sin importar lo que llegue de fuente.

  --force adicionalmente borra todo el año destino antes de insertar; útil
  cuando una rama/tipo desapareció del 2025 y quieres que el ppto 2026
  refleje exactamente la estructura actual del 2025 (sin filas huérfanas).

EJECUCION:
  PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ppto_derivado.py
  PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ppto_derivado.py --force
============================================================================
"""
import os
import sys
import argparse

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

from etl.utils import setup_logger, DatabaseConnector

load_dotenv()
ETL_NAME = "ppto_derivado"
ANIO_ORIGEN = 2025
ANIO_DESTINO = 2026
FACTOR = 1.10
logger = setup_logger()


SQL_INSERT = text("""
    INSERT INTO dwh.fact_ppto_estado_resultados (fecha, mui, seccion, rama, tipo, monto)
    SELECT (fecha + INTERVAL '1 year')::date AS fecha,
           mui, seccion, rama, tipo,
           -- Convencion balanza_ppto: todo positivo. Real tiene COSTOS/GASTOS negativos
           -- (signo contable), asi que invertimos esas secciones al derivar.
           ROUND(
               CASE WHEN seccion IN ('COSTOS', 'GASTOS') THEN -monto ELSE monto END
               * CAST(:factor AS numeric),
               2
           ) AS monto
    FROM dwh.fact_estado_resultados
    WHERE EXTRACT(year FROM fecha) = CAST(:anio_origen AS int)
    ON CONFLICT ON CONSTRAINT uq_ppto_edoresultados DO UPDATE
       SET monto = EXCLUDED.monto
""")

SQL_DELETE = text("""
    DELETE FROM dwh.fact_ppto_estado_resultados
    WHERE EXTRACT(year FROM fecha) = CAST(:anio AS int)
""")

# Plan OTs: cantidad mensual derivada de fact_postventa_kpis (diaria) → fact_plan_postventa (tipo='ots')
SQL_INSERT_OTS = text("""
    INSERT INTO dwh.fact_plan_postventa (anio_mes, id_sucursal, tipo, monto)
    SELECT (DATE_TRUNC('month', fecha)::date + INTERVAL '1 year')::date AS anio_mes,
           mui AS id_sucursal,
           'ots' AS tipo,
           ROUND(SUM(cantidad)::numeric * CAST(:factor AS numeric)) AS monto
    FROM dwh.fact_postventa_kpis
    WHERE EXTRACT(year FROM fecha) = CAST(:anio_origen AS int)
    GROUP BY DATE_TRUNC('month', fecha), mui
    ON CONFLICT ON CONSTRAINT uq_plan_postventa DO UPDATE
       SET monto = EXCLUDED.monto
""")

SQL_DELETE_OTS = text("""
    DELETE FROM dwh.fact_plan_postventa
    WHERE tipo = 'ots'
      AND EXTRACT(year FROM anio_mes) = CAST(:anio AS int)
""")

SQL_SEED_LASTRUN = text("""
    INSERT INTO dwh.etl_last_run (etl_name, last_run_at)
    VALUES (:n, NULL)
    ON CONFLICT (etl_name) DO NOTHING
""")

SQL_MARK_LASTRUN = text("""
    UPDATE dwh.etl_last_run SET last_run_at = NOW() WHERE etl_name = :n
""")


def parse_args():
    p = argparse.ArgumentParser(description="ETL Ppto Derivado Honda Motos")
    p.add_argument("--force", action="store_true",
                   help=f"Borra ppto del año destino ({ANIO_DESTINO}) antes de re-insertar")
    return p.parse_args()


def main():
    args = parse_args()
    print("\n" + "=" * 60)
    print("  ETL PPTO DERIVADO - Honda Motos")
    print("=" * 60)
    print(f"  Origen:  Real {ANIO_ORIGEN}")
    print(f"  Destino: Ppto {ANIO_DESTINO}")
    print(f"  Factor:  x {FACTOR}  (+{(FACTOR-1)*100:.0f}%)")
    print(f"  Modo:    {'FORCE (delete+insert)' if args.force else 'UPSERT (overrides any real)'}")
    print("=" * 60)

    logger.info(f"Inicio ETL '{ETL_NAME}' | {ANIO_ORIGEN} x {FACTOR} -> {ANIO_DESTINO} | force={args.force}")
    try:
        pg = DatabaseConnector("postgres").get_engine()
        with pg.begin() as conn:
            conn.execute(SQL_SEED_LASTRUN, {"n": ETL_NAME})
            deleted = 0
            deleted_ots = 0
            if args.force:
                deleted = conn.execute(SQL_DELETE, {"anio": ANIO_DESTINO}).rowcount
                deleted_ots = conn.execute(SQL_DELETE_OTS, {"anio": ANIO_DESTINO}).rowcount
                logger.info(f"   --force: {deleted} filas EdR + {deleted_ots} OTs {ANIO_DESTINO} previas eliminadas")
            inserted = conn.execute(SQL_INSERT, {"factor": FACTOR, "anio_origen": ANIO_ORIGEN}).rowcount
            inserted_ots = conn.execute(SQL_INSERT_OTS, {"factor": FACTOR, "anio_origen": ANIO_ORIGEN}).rowcount
            conn.execute(SQL_MARK_LASTRUN, {"n": ETL_NAME})

        print(f"\n  EdR eliminadas (force): {deleted:,}")
        print(f"  EdR insertadas:         {inserted:,}")
        print(f"  OTs eliminadas (force): {deleted_ots:,}")
        print(f"  OTs insertadas:         {inserted_ots:,}")
        print("=" * 60)
        logger.info(f"ETL '{ETL_NAME}' completado | edr={inserted} ots={inserted_ots}")

    except SQLAlchemyError as e:
        logger.critical(f"ERROR DE BASE DE DATOS: {e}", exc_info=True)
        sys.exit(1)
    except Exception as e:
        logger.critical(f"ERROR INESPERADO: {e}", exc_info=True)
        sys.exit(1)
    finally:
        DatabaseConnector("postgres").dispose()
        logger.info("Conexiones cerradas.")


if __name__ == "__main__":
    main()
