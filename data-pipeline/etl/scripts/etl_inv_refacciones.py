"""ETL Inventario Refacciones — metrics -> dwh.fact_inv_refacciones (snapshot)"""
import os, sys
from datetime import date
import pandas as pd
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)
from etl.utils import setup_logger, DatabaseConnector, read_sql_file

load_dotenv()
ETL_NAME = "inv_refacciones"
logger = setup_logger()

def upsert(table, conn, keys, data_iter):
    data = [dict(zip(keys, row)) for row in data_iter]
    if not data: return
    stmt = pg_insert(table.table).values(data)
    stmt = stmt.on_conflict_do_update(
        constraint="fact_inv_refacciones_fecha_snapshot_id_sucursal_key",
        set_={k: getattr(stmt.excluded, k) for k in keys if k not in ("fecha_snapshot", "id_sucursal")},
    )
    conn.execute(stmt)

def main():
    logger.info(f"Inicio ETL '{ETL_NAME}'")
    try:
        metrics = DatabaseConnector("metrics").get_engine()
        pg = DatabaseConnector("postgres").get_engine()

        sql = read_sql_file(os.path.join(PROJECT_ROOT, "etl/extract/postventa/extract_inv_refacciones.sql"))
        df = pd.read_sql(sql, metrics)
        logger.info(f"   -> {len(df):,} registros extraidos")

        if df.empty:
            logger.warning("   Sin datos"); return

        df.columns = [c.lower() for c in df.columns]
        df.rename(columns={"mui": "id_sucursal"}, inplace=True)
        df["id_sucursal"] = df["id_sucursal"].astype(int)
        df["fecha_snapshot"] = pd.to_datetime(df["fecha_snapshot"]).dt.date

        cols = ["fecha_snapshot", "id_sucursal", "movimiento", "nuevo", "tec_obsoleto", "obsoleto"]
        df[cols].to_sql("fact_inv_refacciones", pg, schema="dwh", if_exists="append", index=False, method=upsert)

        with pg.connect() as conn:
            conn.execute(text("UPDATE dwh.etl_last_run SET last_run_at=NOW() WHERE etl_name=:n"), {"n": ETL_NAME})
            conn.commit()

        logger.info(f"   {len(df):,} inv refacciones cargados")
    except (SQLAlchemyError, Exception) as e:
        logger.critical(f"ERROR: {e}", exc_info=True); sys.exit(1)
    finally:
        DatabaseConnector("metrics").dispose(); DatabaseConnector("postgres").dispose()

if __name__ == "__main__":
    main()
