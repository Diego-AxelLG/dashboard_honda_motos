"""ETL Presupuesto Estado de Resultados — sicofi -> dwh.fact_ppto_edr"""
import os, sys
import pandas as pd
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)
from etl.utils import setup_logger, DatabaseConnector, read_sql_file

load_dotenv()
ETL_NAME = "ppto_edr"
logger = setup_logger()

def upsert(table, conn, keys, data_iter):
    data = [dict(zip(keys, row)) for row in data_iter]
    if not data: return
    stmt = pg_insert(table.table).values(data)
    stmt = stmt.on_conflict_do_update(
        constraint="fact_ppto_edr_fecha_id_sucursal_seccion_rama_tipo_key",
        set_={k: getattr(stmt.excluded, k) for k in keys if k not in ("fecha", "id_sucursal", "seccion", "rama", "tipo")},
    )
    conn.execute(stmt)

def main():
    logger.info(f"Inicio ETL '{ETL_NAME}'")
    try:
        sicofi = DatabaseConnector("sicofi").get_engine()
        pg = DatabaseConnector("postgres").get_engine()

        sql = read_sql_file(os.path.join(PROJECT_ROOT, "etl/extract/postventa/extract_ppto_estado_resultados.sql"))
        df = pd.read_sql(sql, sicofi)
        logger.info(f"   -> {len(df):,} registros extraidos")

        if df.empty:
            logger.warning("   Sin datos"); return

        df.columns = [c.lower() for c in df.columns]
        df.rename(columns={"mui": "id_sucursal"}, inplace=True)
        df["id_sucursal"] = df["id_sucursal"].astype(int)
        df["fecha"] = pd.to_datetime(df["fecha"]).dt.date
        df = df.dropna(subset=["id_sucursal"])

        cols = ["fecha", "id_sucursal", "seccion", "rama", "tipo", "monto"]
        df[cols].to_sql("fact_ppto_edr", pg, schema="dwh", if_exists="append", index=False, method=upsert)

        with pg.connect() as conn:
            conn.execute(text("UPDATE dwh.etl_last_run SET last_run_at=NOW() WHERE etl_name=:n"), {"n": ETL_NAME})
            conn.commit()

        logger.info(f"   {len(df):,} ppto EdR cargados")
    except (SQLAlchemyError, Exception) as e:
        logger.critical(f"ERROR: {e}", exc_info=True); sys.exit(1)
    finally:
        DatabaseConnector("sicofi").dispose(); DatabaseConnector("postgres").dispose()

if __name__ == "__main__":
    main()
