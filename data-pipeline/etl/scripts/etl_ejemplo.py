"""
============================================================================
 BOILERPLATE: ETL de ejemplo — MySQL (origen) → PostgreSQL (destino)
============================================================================
Demuestra el patrón completo del pipeline:
  1. Conexión a MySQL y PostgreSQL via DatabaseConnector (singleton)
  2. Lectura de SQL de extracción desde etl/extract/
  3. Inyección segura de parámetros (inject_params)
  4. Extracción a pandas DataFrame
  5. Transformaciones ligeras
  6. UPSERT a PostgreSQL (ON CONFLICT DO UPDATE)
  7. Registro de timestamp en etl_last_run

EJECUCION:
  python etl/scripts/etl_ejemplo.py                # Incremental (90 días)
  python etl/scripts/etl_ejemplo.py --full          # Carga completa desde FECHA_INICIO
  python etl/scripts/etl_ejemplo.py --dias 180      # Ventana personalizada

REQUISITOS:
  - Archivo .env en la raíz del proyecto con PG_*, MYSQL_* vars
  - Archivo SQL de extracción en etl/extract/extract_ventas.sql
  - Tablas destino creadas (ver ddl/001_schema_base.sql)
  - Tabla dwh.etl_last_run con columnas (etl_name VARCHAR PK, last_run_at TIMESTAMPTZ)
============================================================================
"""

import os
import sys
import re
import argparse
from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy import text, MetaData, Table
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# PATH SETUP
# ---------------------------------------------------------------------------
# PROJECT_ROOT apunta a data-pipeline/ (3 dirname desde etl/scripts/este_archivo.py)
# Esto permite resolver rutas relativas a archivos SQL y módulos compartidos.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

from etl.utils import setup_logger, DatabaseConnector, read_sql_file

# ---------------------------------------------------------------------------
# CONFIGURACION
# ---------------------------------------------------------------------------
load_dotenv()  # Lee .env desde la raíz del proyecto (donde se ejecuta el script)

# Sucursales a procesar (lista de IDs separados por coma).
# Cada proyecto define sus propias sucursales en .env.
SUCURSALES_PERMITIDAS = os.getenv("SUCURSALES_PERMITIDAS", "1, 2, 3")

# Fecha de inicio para carga completa (--full).
FECHA_INICIO_HISTORICA = os.getenv("FECHA_INICIO", "2024-01-01")

# Ventana deslizante por defecto (días hacia atrás).
DIAS_VENTANA = int(os.getenv("DIAS_VENTANA", "90"))

# Nombre de este pipeline — se usa para registrar en etl_last_run.
ETL_NAME = "ejemplo"

# Logger centralizado (escribe a logs/etl.log + consola).
logger = setup_logger()


def sql_path(relative_path: str) -> str:
    """Convierte ruta relativa (desde data-pipeline/) a absoluta."""
    return os.path.join(PROJECT_ROOT, relative_path)


# ---------------------------------------------------------------------------
# ARGUMENTOS DE LINEA DE COMANDOS
# ---------------------------------------------------------------------------
def parse_arguments():
    """
    Parsea los argumentos CLI que controlan el modo de carga:
      --full   → Carga completa desde FECHA_INICIO (.env)
      --dias N → Ventana personalizada de N días
      (default) → Ventana de DIAS_VENTANA (90 días)
    """
    parser = argparse.ArgumentParser(
        description="ETL de ejemplo: carga incremental con ventana deslizante",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python etl/scripts/etl_ejemplo.py                # Incremental (90 días)
  python etl/scripts/etl_ejemplo.py --full          # Carga completa
  python etl/scripts/etl_ejemplo.py --dias 180      # Ventana de 180 días
        """,
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Carga completa (ignora ventana deslizante)",
    )
    parser.add_argument(
        "--dias",
        type=int,
        default=None,
        help=f"Días de la ventana deslizante (default: {DIAS_VENTANA})",
    )
    return parser.parse_args()


def calcular_fecha_inicio(dias_ventana: int | None) -> str:
    """
    Calcula la fecha de corte para la extracción.
      - dias_ventana=None → usa FECHA_INICIO_HISTORICA (carga completa)
      - dias_ventana=N    → hoy - N días
    Retorna string 'YYYY-MM-DD'.
    """
    if dias_ventana is None:
        return FECHA_INICIO_HISTORICA
    fecha_corte = datetime.now() - timedelta(days=dias_ventana)
    return fecha_corte.strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# VALIDACION E INYECCION DE PARAMETROS
# ---------------------------------------------------------------------------
def validate_param(key: str, value) -> str:
    """
    Valida un parámetro antes de inyectarlo en SQL.
    Previene SQL injection verificando formatos esperados.
    Agregar nuevas claves según el proyecto lo requiera.
    """
    if key == "sucursales_permitidas":
        # Solo números separados por comas: "1, 2, 3"
        if not all(part.strip().isdigit() for part in str(value).split(",")):
            raise ValueError(f"'{key}' contiene valores no numéricos: {value}")
        return str(value)

    elif key == "fecha_inicio":
        # Solo formato YYYY-MM-DD
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(value)):
            raise ValueError(f"'{key}' no tiene formato YYYY-MM-DD: {value}")
        return str(value)

    else:
        # Parámetro desconocido: rechazar patrones peligrosos
        dangerous = [";", "--", "/*", "*/", "DROP", "DELETE", "INSERT", "UPDATE", "UNION"]
        val_upper = str(value).upper()
        for pattern in dangerous:
            if pattern in val_upper:
                raise ValueError(f"'{key}' contiene patrón no permitido: {pattern}")
        return str(value)


def inject_params(query: str, params: dict) -> str:
    """
    Reemplaza placeholders {{ clave }} en la query con valores validados.
    El archivo SQL de extracción usa la sintaxis Jinja: {{ fecha_inicio }}.
    """
    for key, value in params.items():
        validated = validate_param(key, value)
        query = query.replace(f"{{{{ {key} }}}}", validated)
    return query


# ---------------------------------------------------------------------------
# EXTRACCION (MySQL → DataFrame)
# ---------------------------------------------------------------------------
def extraer(mysql_engine, archivo_sql: str, nombre: str, params: dict) -> pd.DataFrame:
    """
    Lee un archivo .sql, inyecta parámetros, ejecuta en MySQL y retorna DataFrame.

    Args:
        mysql_engine: Engine SQLAlchemy conectado a MySQL
        archivo_sql:  Ruta relativa al SQL (desde PROJECT_ROOT), ej. 'etl/extract/extract_ventas.sql'
        nombre:       Nombre legible para logs ("ventas", "inventario", etc.)
        params:       Dict de parámetros a inyectar en la query

    Returns:
        pd.DataFrame con los datos extraídos
    """
    ruta = sql_path(archivo_sql)
    logger.info(f"   Extrayendo {nombre} desde {os.path.basename(ruta)}...")

    query = read_sql_file(ruta)
    query = inject_params(query, params)
    df = pd.read_sql(query, mysql_engine)

    logger.info(f"   -> {len(df):,} registros extraídos")
    return df


# ---------------------------------------------------------------------------
# UPSERT (DataFrame → PostgreSQL)
# ---------------------------------------------------------------------------
def upsert_ventas(table, conn, keys, data_iter):
    """
    Método custom para pandas to_sql() que hace UPSERT en PostgreSQL.
    Usa ON CONFLICT (id_oportunidad) DO UPDATE para actualizar registros existentes.

    IMPORTANTE: id_oportunidad es la clave de negocio (UNIQUE).
    No usar campos como 'vin' o 'id' como conflict key — un mismo producto
    puede tener múltiples transacciones con distinto id_oportunidad.

    Este callable se pasa como argumento `method=` a DataFrame.to_sql().
    SQLAlchemy lo invoca internamente con (table, conn, keys, data_iter).
    """
    data = [dict(zip(keys, row)) for row in data_iter]
    stmt = pg_insert(table.table).values(data)

    # Actualizar todas las columnas excepto la clave de conflicto
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


# ---------------------------------------------------------------------------
# CARGA: VENTAS
# ---------------------------------------------------------------------------
def cargar_ventas(mysql_engine, pg_engine, fecha_inicio: str) -> int:
    """
    Pipeline completo para una tabla de hechos:
      1. Extrae datos de MySQL con la ventana de fechas
      2. Transforma (dedup, tipos, limpieza)
      3. Carga a PostgreSQL via UPSERT

    Returns:
        Número de registros cargados
    """
    logger.info("[1/1] Procesando VENTAS...")

    # -- PASO 1: Extraer -------------------------------------------------------
    # El archivo SQL usa {{ fecha_inicio }} y {{ sucursales_permitidas }}
    # como placeholders que inject_params() reemplaza antes de ejecutar.
    params = {
        "fecha_inicio": fecha_inicio,
        "sucursales_permitidas": SUCURSALES_PERMITIDAS,
    }
    df = extraer(mysql_engine, "etl/extract/extract_ventas.sql", "ventas", params)

    if df.empty:
        logger.warning("   Sin datos de ventas para cargar")
        return 0

    # -- PASO 2: Transformar ---------------------------------------------------
    # Deduplicar por clave de negocio.
    # IMPORTANTE: Siempre deduplicar por id_oportunidad (la transacción),
    # NUNCA por campos como vin o cliente que pueden repetirse legítimamente.
    df.drop_duplicates(subset=["id_oportunidad"], keep="first", inplace=True)

    # Asegurar tipos de datos compatibles con el DDL destino.
    df["es_nuevo"] = df["es_nuevo"].astype(bool)
    df["monto"] = pd.to_numeric(df["monto"], errors="coerce").fillna(0)

    # Seleccionar solo las columnas que existen en la tabla destino.
    cols_to_load = [
        "id_oportunidad", "fecha", "id_sucursal", "id_vendedor",
        "monto", "es_nuevo", "modelo",
    ]
    df_to_load = df[cols_to_load]

    # -- PASO 3: Cargar (UPSERT) -----------------------------------------------
    # to_sql con method=upsert_ventas ejecuta INSERT ... ON CONFLICT DO UPDATE.
    # 'append' no trunca la tabla — los registros nuevos se insertan,
    # los existentes (mismo id_oportunidad) se actualizan.
    df_to_load.to_sql(
        "fact_ventas",
        pg_engine,
        schema="dwh",
        if_exists="append",
        index=False,
        method=upsert_ventas,
    )

    logger.info(f"   {len(df_to_load):,} ventas cargadas (UPSERT) en dwh.fact_ventas")
    return len(df_to_load)


# ---------------------------------------------------------------------------
# REGISTRO DE EJECUCION
# ---------------------------------------------------------------------------
def registrar_ejecucion(pg_engine):
    """
    Registra el timestamp de ejecución exitosa en dwh.etl_last_run.
    Esto permite al backend mostrar "Última actualización: hace X minutos".

    La tabla tiene:
      etl_name VARCHAR PK   — identificador del pipeline ('ejemplo', 'cygo', 'postventa')
      last_run_at TIMESTAMPTZ — timestamp de la última ejecución exitosa
    """
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
    # -- Parsear argumentos y determinar modo de carga -------------------------
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

    # -- Banner informativo ----------------------------------------------------
    print("\n" + "=" * 60)
    print(f"  ETL EJEMPLO — MySQL -> PostgreSQL")
    print("=" * 60)
    print(f"  Modo:        {modo}")
    print(f"  Desde:       {fecha_inicio}")
    print(f"  Sucursales:  {SUCURSALES_PERMITIDAS}")
    print("=" * 60)

    logger.info(f"Inicio ETL '{ETL_NAME}' | {modo} | desde {fecha_inicio}")

    try:
        # -- Conectar a las bases de datos -------------------------------------
        # DatabaseConnector es singleton: la primera llamada crea el engine,
        # las siguientes reusan la misma instancia.
        mysql_engine = DatabaseConnector("mysql").get_engine()
        pg_engine = DatabaseConnector("postgres").get_engine()

        # -- Ejecutar pipeline -------------------------------------------------
        # Agregar aquí más funciones cargar_*() según las tablas del proyecto.
        # El patrón es siempre: extraer SQL → transformar DataFrame → upsert PG.
        totales = {
            "ventas": cargar_ventas(mysql_engine, pg_engine, fecha_inicio),
            # "inventario": cargar_inventario(mysql_engine, pg_engine),
            # "plan": cargar_plan(mysql_engine, pg_engine),
        }

        # -- Registrar ejecución exitosa ---------------------------------------
        registrar_ejecucion(pg_engine)

        # -- Resumen -----------------------------------------------------------
        total = sum(totales.values())
        print("\n" + "=" * 60)
        print("  ETL COMPLETADO")
        print("=" * 60)
        for nombre, count in totales.items():
            print(f"  {nombre:<20} {count:>10,} registros")
        print(f"  {'TOTAL':<20} {total:>10,} registros")
        print("=" * 60)

        logger.info(f"ETL '{ETL_NAME}' completado | {total:,} registros totales")

    except SQLAlchemyError as e:
        logger.critical(f"ERROR DE BASE DE DATOS: {e}", exc_info=True)
        sys.exit(1)
    except Exception as e:
        logger.critical(f"ERROR INESPERADO: {e}", exc_info=True)
        sys.exit(1)
    finally:
        # Cerrar conexiones explícitamente.
        # El singleton las mantiene abiertas entre llamadas; dispose() las libera.
        DatabaseConnector("mysql").dispose()
        DatabaseConnector("postgres").dispose()
        logger.info("Conexiones cerradas.")


if __name__ == "__main__":
    main()
