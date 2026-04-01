"""
============================================================================
 ETL Plan de Ventas — hmcrm (MySQL) → dwh.fact_plan (PostgreSQL)
============================================================================
Extrae plan de ventas mensual por modelo de Honda Motos,
unpivots 12 columnas mensuales a filas, y carga via UPSERT.

EJECUCION:
  python etl/scripts/etl_plan_ventas.py            # Carga completa
============================================================================
"""

import os
import sys

import pandas as pd
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# PATH SETUP
# ---------------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

from etl.utils import setup_logger, DatabaseConnector, read_sql_file

# ---------------------------------------------------------------------------
# CONFIGURACION
# ---------------------------------------------------------------------------
load_dotenv()

ETL_NAME = "plan_ventas"
logger = setup_logger()


def sql_path(relative_path: str) -> str:
    return os.path.join(PROJECT_ROOT, relative_path)


# ---------------------------------------------------------------------------
# UPSERT
# ---------------------------------------------------------------------------
def upsert_plan(table, conn, keys, data_iter):
    """UPSERT via ON CONFLICT (anio_mes, id_sucursal, modelo) DO UPDATE."""
    data = [dict(zip(keys, row)) for row in data_iter]
    if not data:
        return

    stmt = pg_insert(table.table).values(data)
    update_dict = {
        key: getattr(stmt.excluded, key)
        for key in keys
        if key not in ("anio_mes", "id_sucursal", "modelo")
    }
    stmt = stmt.on_conflict_do_update(
        constraint="fact_plan_anio_mes_suc_modelo_key",
        set_=update_dict,
    )
    conn.execute(stmt)


# ---------------------------------------------------------------------------
# PIPELINE PLAN VENTAS
# ---------------------------------------------------------------------------
def cargar_plan(hmcrm_engine, pg_engine) -> int:
    logger.info("[PLAN VENTAS] Extrayendo desde hmcrm...")

    # -- EXTRACT --
    ruta = sql_path("etl/extract/ventas/extract_plan_ventas.sql")
    query = read_sql_file(ruta)
    df = pd.read_sql(query, hmcrm_engine)

    logger.info(f"   -> {len(df):,} registros extraidos (pivotados)")

    if df.empty:
        logger.warning("   Sin datos de plan para cargar")
        return 0

    # -- TRANSFORM: Unpivot 12 columnas mensuales a filas --
    # Columnas origen: Sucursal, Anio, 1..12, Modelo, descripcion
    month_cols = [str(m) for m in range(1, 13)]

    df_melted = df.melt(
        id_vars=["Sucursal", "Anio", "Modelo"],
        value_vars=month_cols,
        var_name="mes",
        value_name="plan_ventas",
    )

    # Crear anio_mes (YYYY-MM)
    df_melted["mes"] = df_melted["mes"].astype(int)
    df_melted["anio_mes"] = (
        df_melted["Anio"].astype(int).astype(str)
        + "-"
        + df_melted["mes"].astype(str).str.zfill(2)
    )

    # Mapear columnas
    df_melted["id_sucursal"] = df_melted["Sucursal"].astype(int)
    df_melted["plan_ventas"] = pd.to_numeric(df_melted["plan_ventas"], errors="coerce").fillna(0).astype(int)
    df_melted["modelo"] = df_melted["Modelo"].str.strip()

    # Filtrar filas con plan = 0 para no llenar el DWH con ceros
    df_melted = df_melted[df_melted["plan_ventas"] > 0]

    # Seleccionar columnas destino
    cols = ["anio_mes", "id_sucursal", "plan_ventas", "modelo"]
    df_out = df_melted[cols].copy()

    # Deduplicar por business key
    df_out.drop_duplicates(subset=["anio_mes", "id_sucursal", "modelo"], keep="first", inplace=True)

    logger.info(f"   -> {len(df_out):,} filas despues de unpivot (sin ceros)")

    # -- LOAD (UPSERT) --
    df_out.to_sql(
        "fact_plan",
        pg_engine,
        schema="dwh",
        if_exists="append",
        index=False,
        method=upsert_plan,
    )

    logger.info(f"   {len(df_out):,} planes cargados (UPSERT) en dwh.fact_plan")
    return len(df_out)


# ---------------------------------------------------------------------------
# REGISTRO EJECUCION
# ---------------------------------------------------------------------------
def registrar_ejecucion(pg_engine):
    with pg_engine.connect() as conn:
        conn.execute(
            text("UPDATE dwh.etl_last_run SET last_run_at = NOW() WHERE etl_name = :name"),
            {"name": ETL_NAME},
        )
        conn.commit()
    logger.info(f"   etl_last_run actualizado para '{ETL_NAME}'")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    print("\n" + "=" * 60)
    print("  ETL PLAN VENTAS - Honda Motos (hmcrm -> PostgreSQL)")
    print("=" * 60)

    logger.info(f"Inicio ETL '{ETL_NAME}'")

    try:
        hmcrm_engine = DatabaseConnector("hmcrm").get_engine()
        pg_engine = DatabaseConnector("postgres").get_engine()

        total = cargar_plan(hmcrm_engine, pg_engine)
        registrar_ejecucion(pg_engine)

        print("\n" + "=" * 60)
        print("  ETL PLAN VENTAS COMPLETADO")
        print("=" * 60)
        print(f"  Filas plan cargadas: {total:,}")
        print("=" * 60)

        logger.info(f"ETL '{ETL_NAME}' completado | {total:,} registros")

    except SQLAlchemyError as e:
        logger.critical(f"ERROR DE BASE DE DATOS: {e}", exc_info=True)
        sys.exit(1)
    except Exception as e:
        logger.critical(f"ERROR INESPERADO: {e}", exc_info=True)
        sys.exit(1)
    finally:
        DatabaseConnector("hmcrm").dispose()
        DatabaseConnector("postgres").dispose()
        logger.info("Conexiones cerradas.")


if __name__ == "__main__":
    main()
