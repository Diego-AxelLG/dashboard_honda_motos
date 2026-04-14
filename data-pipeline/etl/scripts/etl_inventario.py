"""ETL Inventario Honda Motos.

Fuentes: hmcrm.vw_inventario_total + v_apartado_inv + vw_ventas_totales
Destino: dwh.fact_inventario (snapshot DELETE+INSERT por fecha).
Granularidad: 1 fila por VIN con datos de apartado y facturacion enriquecidos.
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
ETL_NAME = "inventario"
logger = setup_logger()


def main():
    logger.info(f"Inicio ETL '{ETL_NAME}'")
    try:
        hmcrm = DatabaseConnector("hmcrm").get_engine()
        pg = DatabaseConnector("postgres").get_engine()

        sql = read_sql_file(os.path.join(
            PROJECT_ROOT, "etl/extract/ventas/extract_inventario_detallado.sql"
        ))
        df = pd.read_sql(sql, hmcrm)
        logger.info(f"   -> {len(df):,} filas crudas (incluye duplicados por joins)")

        if df.empty:
            logger.warning("   Sin datos en la fuente")
            return

        df.columns = [c.lower() for c in df.columns]
        df = df.dropna(subset=["id_sucursal", "vin"])
        df = df[df["id_sucursal"].isin([6, 8])]

        # Tipos
        df["id_sucursal"] = df["id_sucursal"].astype(int)
        df["dias_inventario"] = pd.to_numeric(df["dias_inventario"], errors="coerce").fillna(0).astype(int)
        df["dias_apartado"] = pd.to_numeric(df["dias_apartado"], errors="coerce")
        df["anio"] = pd.to_numeric(df["anio"], errors="coerce")
        df["asesor_id"] = pd.to_numeric(df["asesor_id"], errors="coerce")
        df["facturado"] = df["facturado"].fillna(0).astype(int).astype(bool)
        df["fecha_apartado"] = pd.to_datetime(df["fecha_apartado"], errors="coerce")
        df["fecha_facturacion"] = pd.to_datetime(df["fecha_facturacion"], errors="coerce")

        # Dedup por VIN: priorizar (facturado, fecha_facturacion reciente, fecha_apartado reciente)
        antes = len(df)
        df = df.sort_values(
            ["facturado", "fecha_facturacion", "fecha_apartado", "dias_inventario"],
            ascending=[False, False, False, False],
        ).drop_duplicates("vin", keep="first")
        dups = antes - len(df)
        if dups:
            logger.info(f"   {dups} duplicados por VIN dedupeados")

        today = date.today()
        df["fecha_snapshot"] = today
        df["cantidad"] = 1

        out_cols = [
            "fecha_snapshot", "id_sucursal", "vin", "modelo", "color", "anio",
            "dias_inventario", "dias_apartado", "estatus", "cantidad",
            "asesor_nombre", "asesor_id", "cliente_nombre", "fecha_apartado",
            "facturado", "fecha_facturacion", "tipo_compra", "status_proceso",
        ]
        out = df[out_cols]

        resumen = out.groupby(["id_sucursal", "estatus"]).size().unstack(fill_value=0)
        logger.info(f"   Distribucion:\n{resumen}")
        apart_asesor = out[out["estatus"] == "Apartado"]["asesor_nombre"].notna().sum()
        fact_count = int(out["facturado"].sum())
        logger.info(
            f"   Apartados con asesor: {apart_asesor}, Facturados con registro: {fact_count}"
        )

        with pg.begin() as conn:
            conn.execute(
                text("DELETE FROM dwh.fact_inventario WHERE fecha_snapshot = :d"),
                {"d": today},
            )
            out.to_sql(
                "fact_inventario", conn, schema="dwh", if_exists="append", index=False
            )

        with pg.begin() as conn:
            conn.execute(
                text("UPDATE dwh.etl_last_run SET last_run_at=NOW() WHERE etl_name=:n"),
                {"n": ETL_NAME},
            )
            conn.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY dwh.mv_aging_inventario"))

        logger.info(f"   {len(out):,} registros cargados (snapshot {today})")
    except (SQLAlchemyError, Exception) as e:
        logger.critical(f"ERROR: {e}", exc_info=True)
        sys.exit(1)
    finally:
        DatabaseConnector("hmcrm").dispose()
        DatabaseConnector("postgres").dispose()


if __name__ == "__main__":
    main()
