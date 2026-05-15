"""
============================================================================
 ETL Ventas — hmcrm (MySQL) → dwh.fact_ventas (PostgreSQL)
============================================================================
Extrae ventas de motos nuevas de Honda Motos (Tijuana y Mexicali),
normaliza modelos, deduplica por VIN+fecha, y carga via UPSERT.

EJECUCION:
  python etl/scripts/etl_ventas.py                # Incremental (90 dias)
  python etl/scripts/etl_ventas.py --full          # Carga completa desde 2024
  python etl/scripts/etl_ventas.py --dias 180      # Ventana personalizada
============================================================================
"""

import os
import sys
import argparse
from datetime import datetime, timedelta

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

from etl.utils import setup_logger, DatabaseConnector, read_sql_file, inject_params

# ---------------------------------------------------------------------------
# CONFIGURACION
# ---------------------------------------------------------------------------
load_dotenv()

SUCURSALES_PERMITIDAS = os.getenv("SUCURSALES_PERMITIDAS", "6,8")
FECHA_INICIO_HISTORICA = os.getenv("FECHA_INICIO", "2024-01-01")
DIAS_VENTANA = int(os.getenv("DIAS_VENTANA", "90"))
ETL_NAME = "ventas"

logger = setup_logger()


def sql_path(relative_path: str) -> str:
    return os.path.join(PROJECT_ROOT, relative_path)


# ---------------------------------------------------------------------------
# ARGUMENTOS CLI
# ---------------------------------------------------------------------------
def parse_arguments():
    parser = argparse.ArgumentParser(description="ETL Ventas Honda Motos: hmcrm -> PostgreSQL")
    parser.add_argument("--full", action="store_true", help="Carga completa desde FECHA_INICIO")
    parser.add_argument("--dias", type=int, default=None, help=f"Dias ventana (default: {DIAS_VENTANA})")
    return parser.parse_args()


def calcular_fecha_inicio(dias_ventana: int | None) -> str:
    if dias_ventana is None:
        return FECHA_INICIO_HISTORICA
    return (datetime.now() - timedelta(days=dias_ventana)).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# UPSERT
# ---------------------------------------------------------------------------
def upsert_ventas(table, conn, keys, data_iter):
    """UPSERT via ON CONFLICT (id_oportunidad) DO UPDATE."""
    data = [dict(zip(keys, row)) for row in data_iter]
    if not data:
        return

    stmt = pg_insert(table.table).values(data)
    update_dict = {
        key: getattr(stmt.excluded, key)
        for key in keys
        if key != "id_oportunidad"
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=["id_oportunidad"],
        set_=update_dict,
    )
    conn.execute(stmt)


def upsert_vendedores(table, conn, keys, data_iter):
    """UPSERT via ON CONFLICT (id_vendedor) DO UPDATE."""
    data = [dict(zip(keys, row)) for row in data_iter]
    if not data:
        return

    stmt = pg_insert(table.table).values(data)
    update_dict = {
        key: getattr(stmt.excluded, key)
        for key in keys
        if key != "id_vendedor"
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=["id_vendedor"],
        set_=update_dict,
    )
    conn.execute(stmt)


def cargar_dim_vendedores(df: pd.DataFrame, pg_engine) -> int:
    """Deriva dim_vendedores del extract y hace UPSERT por id_vendedor.

    Para cada asesor toma la sucursal de su venta mas reciente y `activo`=True
    cuando su `status_vendedor` mas reciente es 'Empleado'.
    """
    base = df.dropna(subset=["id_vendedor"]).copy()
    if base.empty:
        logger.warning("   [VENDEDORES] Sin asesores en el extract; omitido")
        return 0

    base["id_vendedor"] = base["id_vendedor"].astype(int)
    base["nombre_vendedor"] = base["nombre_vendedor"].fillna("").str.strip()
    base = base[base["nombre_vendedor"] != ""]

    # Para cada asesor, quedarnos con su registro mas reciente
    base.sort_values("fecha", ascending=False, inplace=True)
    latest = base.drop_duplicates(subset=["id_vendedor"], keep="first")

    dim = pd.DataFrame({
        "id_vendedor": latest["id_vendedor"].astype(int),
        "nombre":      latest["nombre_vendedor"].astype(str),
        "id_sucursal": latest["mui"].astype(int),
        "activo":      latest["status_vendedor"].fillna("").str.strip().str.lower().eq("empleado"),
    })

    dim.to_sql(
        "dim_vendedores",
        pg_engine,
        schema="dwh",
        if_exists="append",
        index=False,
        method=upsert_vendedores,
    )
    logger.info(f"   {len(dim):,} vendedores cargados (UPSERT) en dwh.dim_vendedores")
    return len(dim)


# ---------------------------------------------------------------------------
# PIPELINE VENTAS
# ---------------------------------------------------------------------------
def cargar_ventas(hmcrm_engine, pg_engine, fecha_inicio: str) -> int:
    logger.info("[VENTAS] Extrayendo desde hmcrm...")

    # -- EXTRACT --
    params = {"fecha_inicio": fecha_inicio}
    ruta = sql_path("etl/extract/ventas/extract_ventas.sql")
    query = read_sql_file(ruta)
    query = inject_params(query, params)
    df = pd.read_sql(query, hmcrm_engine)

    logger.info(f"   -> {len(df):,} registros extraidos")

    if df.empty:
        logger.warning("   Sin datos de ventas para cargar")
        return 0

    # -- TRANSFORM --
    # Deduplicar por VIN (cada VIN se vende una sola vez; si hay duplicados,
    # conservar el registro mas reciente — la venta cancelada no cuenta)
    antes = len(df)
    df.sort_values("fecha", ascending=False, inplace=True)
    df.drop_duplicates(subset=["vin"], keep="first", inplace=True)
    if len(df) < antes:
        logger.info(f"   Dedup: {antes - len(df)} duplicados por VIN removidos")

    # Crear id_oportunidad = VIN
    df["id_oportunidad"] = df["vin"]

    # Cargar dim_vendedores antes que el fact (FK)
    cargar_dim_vendedores(df, pg_engine)

    # Mapear columnas al schema destino
    df["id_sucursal"] = df["mui"].astype(int)
    df["es_nuevo"] = True
    df["monto"] = 0  # No disponible en esta fuente
    df["venta_contado"] = df["venta_contado"].astype(bool)
    df["modelo"] = df["modelo"].str.strip()
    df["id_vendedor"] = df["id_vendedor"].astype("Int64")  # nullable int

    # Seleccionar columnas destino
    cols = ["id_oportunidad", "fecha", "id_sucursal", "id_vendedor",
            "monto", "es_nuevo", "modelo", "venta_contado"]
    df_out = df[cols].copy()

    # -- LOAD (UPSERT) --
    df_out.to_sql(
        "fact_ventas",
        pg_engine,
        schema="dwh",
        if_exists="append",
        index=False,
        method=upsert_ventas,
    )

    logger.info(f"   {len(df_out):,} ventas cargadas (UPSERT) en dwh.fact_ventas")
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
    args = parse_arguments()

    if args.full:
        dias_ventana = None
        modo = "CARGA COMPLETA"
    elif args.dias is not None:
        dias_ventana = args.dias
        modo = f"VENTANA {dias_ventana} DIAS"
    else:
        dias_ventana = DIAS_VENTANA
        modo = f"VENTANA {dias_ventana} DIAS"

    fecha_inicio = calcular_fecha_inicio(dias_ventana)

    print("\n" + "=" * 60)
    print("  ETL VENTAS - Honda Motos (hmcrm -> PostgreSQL)")
    print("=" * 60)
    print(f"  Modo:        {modo}")
    print(f"  Desde:       {fecha_inicio}")
    print(f"  Sucursales:  {SUCURSALES_PERMITIDAS}")
    print("=" * 60)

    logger.info(f"Inicio ETL '{ETL_NAME}' | {modo} | desde {fecha_inicio}")

    try:
        hmcrm_engine = DatabaseConnector("hmcrm").get_engine()
        pg_engine = DatabaseConnector("postgres").get_engine()

        total = cargar_ventas(hmcrm_engine, pg_engine, fecha_inicio)
        registrar_ejecucion(pg_engine)

        print("\n" + "=" * 60)
        print("  ETL VENTAS COMPLETADO")
        print("=" * 60)
        print(f"  Ventas cargadas: {total:,}")
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
