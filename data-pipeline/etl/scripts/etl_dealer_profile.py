"""ETL Dealer Profile — metrics -> dwh.fact_dealer_profile (UPSERT, solo P1+P2)"""
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
ETL_NAME = "dealer_profile"
logger = setup_logger()

# KPIs curados (41 de 60)
P1_IDS = {1,2,3,4,5,6,7, 29,30,33,34,36,37,38,41,44,47,48,49,57,69, 71,72,74,76, 80,81}
P2_IDS = {31,43,51,52,53,54, 58,60,61,62,63,64,65,68}
ALL_IDS = P1_IDS | P2_IDS

def upsert(table, conn, keys, data_iter):
    data = [dict(zip(keys, row)) for row in data_iter]
    if not data: return
    stmt = pg_insert(table.table).values(data)
    stmt = stmt.on_conflict_do_update(
        constraint="fact_dealer_profile_fecha_id_sucursal_dealer_profile_id_key",
        set_={k: getattr(stmt.excluded, k) for k in keys if k not in ("fecha", "id_sucursal", "dealer_profile_id")},
    )
    conn.execute(stmt)

def main():
    logger.info(f"Inicio ETL '{ETL_NAME}'")
    try:
        metrics = DatabaseConnector("metrics").get_engine()
        pg = DatabaseConnector("postgres").get_engine()

        sql = read_sql_file(os.path.join(PROJECT_ROOT, "etl/extract/postventa/extract_dealer_profile.sql"))
        df = pd.read_sql(sql, metrics)
        logger.info(f"   -> {len(df):,} registros extraidos (sin filtro)")

        if df.empty:
            logger.warning("   Sin datos"); return

        df.columns = [c.lower() for c in df.columns]
        df.rename(columns={"mui": "id_sucursal"}, inplace=True)
        df["id_sucursal"] = df["id_sucursal"].astype(int)

        # Filtrar solo P1+P2
        df = df[df["dealer_profile_id"].isin(ALL_IDS)].copy()
        logger.info(f"   -> {len(df):,} registros despues de filtro P1+P2")

        # Asignar prioridad
        df["prioridad"] = df["dealer_profile_id"].apply(lambda x: 1 if x in P1_IDS else 2)
        df["valor"] = pd.to_numeric(df["valor"], errors="coerce")
        df["sub_valor"] = pd.to_numeric(df["sub_valor"], errors="coerce")

        cols = ["fecha", "id_sucursal", "dealer_profile_id", "nombre", "seccion", "valor", "sub_valor", "prioridad"]
        df[cols].to_sql("fact_dealer_profile", pg, schema="dwh", if_exists="append", index=False, method=upsert)

        with pg.connect() as conn:
            conn.execute(text("UPDATE dwh.etl_last_run SET last_run_at=NOW() WHERE etl_name=:n"), {"n": ETL_NAME})
            conn.commit()

        logger.info(f"   {len(df):,} dealer profile KPIs cargados")
    except (SQLAlchemyError, Exception) as e:
        logger.critical(f"ERROR: {e}", exc_info=True); sys.exit(1)
    finally:
        DatabaseConnector("metrics").dispose(); DatabaseConnector("postgres").dispose()

if __name__ == "__main__":
    main()
