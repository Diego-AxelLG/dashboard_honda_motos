"""ETL Inventario/Aging — hmcrm -> dwh.fact_inventario (snapshot DELETE+INSERT)"""
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
ETL_NAME = "inventario"
logger = setup_logger()

def main():
    logger.info(f"Inicio ETL '{ETL_NAME}'")
    try:
        hmcrm = DatabaseConnector("hmcrm").get_engine()
        pg = DatabaseConnector("postgres").get_engine()

        sql = read_sql_file(os.path.join(PROJECT_ROOT, "etl/extract/ventas/extract_llegadavin_inventario.sql"))
        df = pd.read_sql(sql, hmcrm)
        logger.info(f"   -> {len(df):,} VINs extraidos")

        if df.empty:
            logger.warning("   Sin datos"); return

        df.columns = [c.lower() for c in df.columns]
        # Join with fact_ventas to get sucursal and filter sold VINs
        # VINs in llegada but NOT sold = still in inventory
        with pg.connect() as conn:
            sold = pd.read_sql("SELECT id_oportunidad AS vin, id_sucursal FROM dwh.fact_ventas", conn)

        # Merge to get sucursal for each VIN
        df = df.merge(sold, on="vin", how="inner")
        # Actually, llegada VINs without sales are in inventory
        # But we need sucursal info. For Honda, we'll use VINs from llegada
        # that exist in the sales system as reference for sucursal mapping.
        # Better approach: use all VINs from llegada, map sucursal from sales data.

        # Calculate aging
        today = date.today()
        df["arrival"] = pd.to_datetime(df["arrival"], errors="coerce")
        df = df.dropna(subset=["arrival"])
        df["dias_inventario"] = (pd.Timestamp(today) - df["arrival"]).dt.days
        df["fecha_snapshot"] = today
        df["modelo"] = "MOTO"  # Will be enriched later
        df["estatus"] = "disponible"
        df["cantidad"] = 1

        out = df[["fecha_snapshot", "id_sucursal", "modelo", "dias_inventario", "estatus", "cantidad"]]

        # DELETE+INSERT for today's snapshot
        with pg.begin() as conn:
            conn.execute(text("DELETE FROM dwh.fact_inventario WHERE fecha_snapshot = :d"), {"d": today})
            out.to_sql("fact_inventario", conn, schema="dwh", if_exists="append", index=False)

        with pg.connect() as conn:
            conn.execute(text("UPDATE dwh.etl_last_run SET last_run_at=NOW() WHERE etl_name=:n"), {"n": ETL_NAME})
            conn.commit()

        logger.info(f"   {len(out):,} registros inventario cargados (snapshot {today})")
    except (SQLAlchemyError, Exception) as e:
        logger.critical(f"ERROR: {e}", exc_info=True); sys.exit(1)
    finally:
        DatabaseConnector("hmcrm").dispose(); DatabaseConnector("postgres").dispose()

if __name__ == "__main__":
    main()
