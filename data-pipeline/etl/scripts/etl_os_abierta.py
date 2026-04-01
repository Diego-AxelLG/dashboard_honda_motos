"""ETL OS Abiertas — metrics -> dwh.fact_os_abierta + fact_os_abierta_detalle (snapshot DELETE+INSERT)"""
import os, sys
from datetime import date
import pandas as pd
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)
from etl.utils import setup_logger, DatabaseConnector, read_sql_file

load_dotenv()
ETL_NAME = "os_abierta"
logger = setup_logger()

def main():
    logger.info(f"Inicio ETL '{ETL_NAME}'")
    try:
        metrics = DatabaseConnector("metrics").get_engine()
        pg = DatabaseConnector("postgres").get_engine()
        today = date.today()

        # --- Agregado ---
        sql_agg = read_sql_file(os.path.join(PROJECT_ROOT, "etl/extract/postventa/extract_os_abierta.sql"))
        df_agg = pd.read_sql(sql_agg, metrics)
        df_agg.columns = [c.lower() for c in df_agg.columns]
        df_agg.rename(columns={"mui": "id_sucursal"}, inplace=True)
        df_agg["id_sucursal"] = df_agg["id_sucursal"].astype(int)
        logger.info(f"   Agregado: {len(df_agg)} registros")

        # --- Detalle ---
        sql_det = read_sql_file(os.path.join(PROJECT_ROOT, "etl/extract/postventa/extract_os_abierta_detalle.sql"))
        df_det = pd.read_sql(sql_det, metrics)
        df_det.columns = [c.lower() for c in df_det.columns]
        df_det.rename(columns={"mui": "id_sucursal"}, inplace=True)
        df_det["id_sucursal"] = df_det["id_sucursal"].astype(int)
        df_det["dias_abierta"] = pd.to_numeric(df_det["dias_abierta"], errors="coerce").fillna(0).astype(int)
        df_det["monto_venta"] = pd.to_numeric(df_det["monto_venta"], errors="coerce").fillna(0)
        logger.info(f"   Detalle: {len(df_det)} registros")

        # DELETE+INSERT for today
        with pg.begin() as conn:
            conn.execute(text("DELETE FROM dwh.fact_os_abierta WHERE fecha_snapshot = :d"), {"d": today})
            if not df_agg.empty:
                df_agg.to_sql("fact_os_abierta", conn, schema="dwh", if_exists="append", index=False)

            conn.execute(text("DELETE FROM dwh.fact_os_abierta_detalle WHERE fecha_snapshot = :d"), {"d": today})
            if not df_det.empty:
                df_det.to_sql("fact_os_abierta_detalle", conn, schema="dwh", if_exists="append", index=False)

        with pg.connect() as conn:
            conn.execute(text("UPDATE dwh.etl_last_run SET last_run_at=NOW() WHERE etl_name=:n"), {"n": ETL_NAME})
            conn.commit()

        logger.info(f"   OS abiertas: {len(df_agg)} agg + {len(df_det)} det cargados")
    except (SQLAlchemyError, Exception) as e:
        logger.critical(f"ERROR: {e}", exc_info=True); sys.exit(1)
    finally:
        DatabaseConnector("metrics").dispose(); DatabaseConnector("postgres").dispose()

if __name__ == "__main__":
    main()
