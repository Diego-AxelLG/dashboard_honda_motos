"""ETL Servicio KPIs — metrics -> dwh.fact_servicio_kpi"""
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
ETL_NAME = "servicio_kpi"
logger = setup_logger()

def upsert(table, conn, keys, data_iter):
    data = [dict(zip(keys, row)) for row in data_iter]
    if not data: return
    stmt = pg_insert(table.table).values(data)
    stmt = stmt.on_conflict_do_update(
        constraint="fact_servicio_kpi_fecha_id_sucursal_key",
        set_={k: getattr(stmt.excluded, k) for k in keys if k not in ("fecha", "id_sucursal")},
    )
    conn.execute(stmt)

def main():
    logger.info(f"Inicio ETL '{ETL_NAME}'")
    try:
        metrics = DatabaseConnector("metrics").get_engine()
        pg = DatabaseConnector("postgres").get_engine()

        sql = read_sql_file(os.path.join(PROJECT_ROOT, "etl/extract/postventa/extract_oskpi.sql"))
        df = pd.read_sql(sql, metrics)
        logger.info(f"   -> {len(df):,} registros extraidos")

        if df.empty:
            logger.warning("   Sin datos"); return

        df.columns = [c.lower() for c in df.columns]
        df.rename(columns={
            "mui": "id_sucursal",
            "cantidad": "cantidad_os",
            "horas_mo": "horas_mo",
            "venta_mo": "venta_mo",
            "ventatotal_siniva": "venta_total_sin_iva",
        }, inplace=True)
        df["id_sucursal"] = df["id_sucursal"].astype(int)

        # Dedup by fecha+sucursal
        df.drop_duplicates(subset=["fecha", "id_sucursal"], keep="first", inplace=True)

        cols = ["fecha", "id_sucursal", "cantidad_os", "horas_mo", "venta_mo", "venta_total_sin_iva"]
        df[cols].to_sql("fact_servicio_kpi", pg, schema="dwh", if_exists="append", index=False, method=upsert)

        with pg.connect() as conn:
            conn.execute(text("UPDATE dwh.etl_last_run SET last_run_at=NOW() WHERE etl_name=:n"), {"n": ETL_NAME})
            conn.commit()

        logger.info(f"   {len(df):,} servicio KPIs cargados (UPSERT)")
    except (SQLAlchemyError, Exception) as e:
        logger.critical(f"ERROR: {e}", exc_info=True); sys.exit(1)
    finally:
        DatabaseConnector("metrics").dispose(); DatabaseConnector("postgres").dispose()

if __name__ == "__main__":
    main()
