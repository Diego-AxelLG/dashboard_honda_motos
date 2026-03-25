"""
============================================================================
 BOILERPLATE: ETL de snapshot diario con deduplicación DELETE+INSERT
============================================================================
Demuestra el patrón para tablas que capturan el estado actual de un sistema
externo una vez al día (o más). Ejemplos típicos:
  - Tickets / órdenes de trabajo abiertas
  - Cuentas por cobrar vencidas
  - Inventario actual
  - Incidencias sin resolver

ESTRATEGIA: DELETE+INSERT por fecha_snapshot
  1. Extraer el estado actual completo del sistema origen
  2. DELETE FROM dwh.fact_X WHERE fecha_snapshot = hoy
  3. INSERT los datos frescos

Esto permite re-ejecutar el ETL múltiples veces al día (cron cada hora,
reintentos por fallo, ejecución manual) sin generar duplicados.

POR QUE DELETE+INSERT y no UPSERT:
  En snapshots diarios la PK natural es compleja y frágil:
  (fecha_snapshot, id_ticket, sucursal) podría funcionar, pero:
    a) Los registros DESAPARECEN del origen cuando se resuelven.
       Un UPSERT insertaría nuevos pero NUNCA eliminaría los resueltos
       del snapshot de hoy — el snapshot quedaría inflado.
    b) El sistema origen puede cambiar campos que son parte de la PK
       compuesta (ej. reasignar un ticket a otra sucursal), creando
       duplicados fantasma.
    c) DELETE+INSERT es atómico por fecha: siempre refleja exactamente
       lo que el origen tiene en este momento, sin residuos de corridas
       anteriores del mismo día.

EJECUCION:
  python etl/scripts/etl_snapshot_ejemplo.py           # Snapshot del día
  python etl/scripts/etl_snapshot_ejemplo.py --seco     # Dry run (solo extrae)

REQUISITOS:
  - .env con PG_*, MYSQL_* vars
  - SQL de extracción en etl/extract/extract_tickets_abiertos.sql
  - Tabla destino: dwh.fact_tickets_abiertos (ver DDL abajo)
  - Tabla dwh.etl_last_run con (etl_name PK, last_run_at TIMESTAMPTZ)

DDL DE EJEMPLO:
  CREATE TABLE IF NOT EXISTS dwh.fact_tickets_abiertos (
      id                SERIAL PRIMARY KEY,
      fecha_snapshot    DATE NOT NULL DEFAULT CURRENT_DATE,
      id_ticket         VARCHAR(50) NOT NULL,
      id_sucursal       INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
      categoria         VARCHAR(100),
      prioridad         VARCHAR(20),
      fecha_apertura    DATE,
      dias_abierto      INTEGER DEFAULT 0,
      monto             NUMERIC(14,2) DEFAULT 0,
      responsable       VARCHAR(200),
      comentario        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_fact_tickets_snapshot
      ON dwh.fact_tickets_abiertos(fecha_snapshot);
============================================================================
"""

import os
import sys
import argparse
from datetime import date

import pandas as pd
from sqlalchemy import text
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

SUCURSALES_PERMITIDAS = os.getenv("SUCURSALES_PERMITIDAS", "1, 2, 3")
ETL_NAME = "tickets"

logger = setup_logger("etl_snapshot", "logs/etl_snapshot.log")


def sql_path(relative_path: str) -> str:
    return os.path.join(PROJECT_ROOT, relative_path)


def inject_params(query: str, params: dict) -> str:
    """Reemplaza {{ clave }} con valores. Ver etl_ejemplo.py para validación completa."""
    for key, value in params.items():
        query = query.replace(f"{{{{ {key} }}}}", str(value))
    return query


# ---------------------------------------------------------------------------
# ARGUMENTOS
# ---------------------------------------------------------------------------
def parse_arguments():
    parser = argparse.ArgumentParser(
        description="ETL Snapshot: captura estado actual del sistema origen",
    )
    parser.add_argument(
        "--seco",
        action="store_true",
        help="Dry run: extrae datos y muestra resumen sin cargar a PostgreSQL",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# EXTRACCION
# ---------------------------------------------------------------------------
def extraer(engine, archivo_sql: str, nombre: str, params: dict) -> pd.DataFrame:
    """Extrae datos del sistema origen via SQL parametrizado."""
    ruta = sql_path(archivo_sql)
    logger.info(f"Extrayendo {nombre} desde {os.path.basename(ruta)}...")

    query = read_sql_file(ruta)
    query = inject_params(query, params)
    df = pd.read_sql(query, engine)

    logger.info(f"   -> {len(df):,} registros extraídos")
    return df


# ---------------------------------------------------------------------------
# CARGA: SNAPSHOT DELETE+INSERT
# ---------------------------------------------------------------------------
def cargar_snapshot(pg_engine, df: pd.DataFrame, tabla: str, col_snapshot: str = "fecha_snapshot") -> int:
    """
    Carga un DataFrame como snapshot diario usando DELETE+INSERT.

    El flujo es:
      1. Leer fecha_snapshot del propio DataFrame (la query de extracción la genera)
      2. DELETE todos los registros de esa fecha (limpia corridas anteriores del día)
      3. INSERT los datos frescos

    Ambas operaciones corren en la MISMA transacción. Si el INSERT falla,
    el DELETE se revierte y los datos previos del día sobreviven intactos.

    Args:
        pg_engine:    Engine SQLAlchemy conectado a PostgreSQL
        df:           DataFrame con los datos extraídos (debe incluir col_snapshot)
        tabla:        Nombre completo de la tabla destino ("dwh.fact_tickets_abiertos")
        col_snapshot: Columna de fecha del snapshot (default: "fecha_snapshot")

    Returns:
        Número de registros insertados
    """
    if df.empty:
        logger.warning(f"   Sin datos para {tabla}")
        return 0

    # La fecha del snapshot viene del DataFrame (generada en la query de extracción,
    # normalmente CURRENT_DATE o CURDATE()). No la hardcodeamos en Python para que
    # el snapshot refleje la fecha que el sistema origen consideró "hoy".
    snapshot_date = df[col_snapshot].iloc[0]

    # --- DELETE + INSERT en una sola transacción ---
    # pg_engine.begin() abre transacción y hace commit automático al salir.
    # Si ocurre excepción, hace rollback — los datos previos quedan intactos.
    #
    # IMPORTANTE: Separar el schema y tabla para el DELETE parametrizado.
    # Nunca interpolar la fecha directamente en el SQL — usar :param.
    schema, table_name = tabla.split(".")
    with pg_engine.begin() as conn:
        # Paso 1: DELETE registros del snapshot de hoy
        deleted = conn.execute(
            text(f"DELETE FROM {schema}.{table_name} WHERE {col_snapshot} = :fs"),
            {"fs": snapshot_date},
        ).rowcount

        if deleted:
            logger.info(f"   {deleted:,} registros previos eliminados para {snapshot_date}")

        # Paso 2: INSERT datos frescos
        # to_sql dentro de una transacción existente usa la misma conexión.
        df.to_sql(
            table_name,
            conn,
            schema=schema,
            if_exists="append",
            index=False,
        )

    logger.info(f"   {len(df):,} registros cargados en {tabla} (snapshot {snapshot_date})")
    return len(df)


# ---------------------------------------------------------------------------
# PIPELINE: TICKETS ABIERTOS
# ---------------------------------------------------------------------------
def procesar_tickets(origen_engine, pg_engine, dry_run: bool = False) -> int:
    """
    Pipeline completo para el snapshot de tickets abiertos:
      1. Extrae el estado actual del sistema origen
      2. Transforma (normaliza columnas, limpia datos)
      3. DELETE+INSERT el snapshot del día

    Returns:
        Número de registros cargados (0 si dry_run)
    """
    logger.info("[1/1] Procesando TICKETS ABIERTOS...")

    # -- EXTRAER ---------------------------------------------------------------
    params = {"sucursales_permitidas": SUCURSALES_PERMITIDAS}
    df = extraer(
        origen_engine,
        "etl/extract/extract_tickets_abiertos.sql",
        "tickets abiertos",
        params,
    )

    if df.empty:
        logger.warning("   Sin tickets abiertos en el sistema origen")
        return 0

    # -- TRANSFORMAR -----------------------------------------------------------
    # Normalizar nombres de columna a minúsculas.
    # Muchos CRMs/ERPs devuelven columnas en MAYUSCULAS o CamelCase.
    df.columns = [c.lower() for c in df.columns]

    # Asegurar tipos compatibles con el DDL destino.
    df["dias_abierto"] = pd.to_numeric(df["dias_abierto"], errors="coerce").fillna(0).astype(int)
    df["monto"] = pd.to_numeric(df["monto"], errors="coerce").fillna(0)

    # -- DRY RUN ---------------------------------------------------------------
    if dry_run:
        print(f"\n   [DRY RUN] {len(df):,} registros extraídos. No se cargaron.")
        print(f"   Columnas: {list(df.columns)}")
        print(f"   Snapshot: {df['fecha_snapshot'].iloc[0]}")
        print(df.head(10).to_string(index=False))
        return 0

    # -- CARGAR (DELETE+INSERT) ------------------------------------------------
    return cargar_snapshot(pg_engine, df, "dwh.fact_tickets_abiertos")


# ---------------------------------------------------------------------------
# REGISTRO DE EJECUCION
# ---------------------------------------------------------------------------
def registrar_ejecucion(pg_engine):
    """Registra timestamp de ejecución exitosa en dwh.etl_last_run."""
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

    print("\n" + "=" * 60)
    print("  ETL SNAPSHOT — Tickets Abiertos")
    print("=" * 60)
    print(f"  Fecha:       {date.today()}")
    print(f"  Sucursales:  {SUCURSALES_PERMITIDAS}")
    print(f"  Modo:        {'DRY RUN' if args.seco else 'CARGA'}")
    print("=" * 60)

    logger.info(f"Inicio ETL '{ETL_NAME}' | snapshot {date.today()}")

    try:
        origen_engine = DatabaseConnector("mysql").get_engine()
        pg_engine = DatabaseConnector("postgres").get_engine()

        # -- Pipeline ----------------------------------------------------------
        # Agregar más funciones procesar_*() para cada tabla snapshot.
        # Cada una sigue el mismo patrón: extraer → transformar → DELETE+INSERT.
        totales = {
            "tickets": procesar_tickets(origen_engine, pg_engine, dry_run=args.seco),
            # "cxc_detalle": procesar_cxc(origen_engine, pg_engine, dry_run=args.seco),
            # "inventario":  procesar_inventario(origen_engine, pg_engine, dry_run=args.seco),
        }

        # -- Registrar ejecución (solo si no es dry run) -----------------------
        if not args.seco:
            registrar_ejecucion(pg_engine)

        # -- Resumen -----------------------------------------------------------
        total = sum(totales.values())
        print("\n" + "=" * 60)
        print("  ETL SNAPSHOT COMPLETADO")
        print("=" * 60)
        for nombre, count in totales.items():
            print(f"  {nombre:<20} {count:>10,} registros")
        print(f"  {'TOTAL':<20} {total:>10,} registros")
        print("=" * 60)

        logger.info(f"ETL '{ETL_NAME}' completado | {total:,} registros")

    except SQLAlchemyError as e:
        logger.critical(f"ERROR DE BASE DE DATOS: {e}", exc_info=True)
        sys.exit(1)
    except Exception as e:
        logger.critical(f"ERROR INESPERADO: {e}", exc_info=True)
        sys.exit(1)
    finally:
        DatabaseConnector("mysql").dispose()
        DatabaseConnector("postgres").dispose()
        logger.info("Conexiones cerradas.")


if __name__ == "__main__":
    main()
