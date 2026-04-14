"""
============================================================================
 ETL Postventa + Financiero — Honda Motos
============================================================================
Orquestador unificado que carga:
  1. fact_estado_resultados        (P&L reales de sicofi)
  2. fact_ppto_estado_resultados   (P&L presupuesto de sicofi)
  3. fact_postventa_kpis           (OTs + Horas MO de metrics)
  4. fact_contable_servicio        (Venta Total contable de sicofi)
  5. fact_contable_servicio        (Venta MO contable de sicofi)
  6. fact_ticket_promedio           (CSV manual)

EJECUCION:
  PYTHONPATH=. python data-pipeline/etl/scripts/etl_postventa_financiero.py
  PYTHONPATH=. python data-pipeline/etl/scripts/etl_postventa_financiero.py --full
============================================================================
"""
import os
import sys
import argparse
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
ETL_NAME = "postventa_financiero"
logger = setup_logger()

AGENCIA_MUI = {
    'HONDA MOTOS TIJUANA': 6,
    'HONDA MOTOS MEXICALI': 8,
}


def sql_path(relative: str) -> str:
    return os.path.join(PROJECT_ROOT, relative)


def parse_arguments():
    parser = argparse.ArgumentParser(description="ETL Postventa+Financiero Honda Motos")
    parser.add_argument("--full", action="store_true", help="Carga completa (6 meses)")
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extraer(engine, sql_file: str, label: str) -> pd.DataFrame:
    """Extrae datos de MySQL ejecutando un archivo SQL."""
    sql = read_sql_file(sql_path(sql_file))
    logger.info(f"[{label}] Extrayendo...")
    df = pd.read_sql(sql, engine)
    df.columns = [c.lower() for c in df.columns]
    logger.info(f"   -> {len(df):,} registros")
    return df


def upsert_generic(table, conn, keys, data_iter, *, constraint: str, conflict_keys: list[str]):
    """UPSERT genérico via ON CONFLICT DO UPDATE."""
    data = [dict(zip(keys, row)) for row in data_iter]
    if not data:
        return
    stmt = pg_insert(table.table).values(data)
    update_cols = {k: getattr(stmt.excluded, k) for k in keys if k not in conflict_keys}
    stmt = stmt.on_conflict_do_update(constraint=constraint, set_=update_cols)
    conn.execute(stmt)


# ---------------------------------------------------------------------------
# 1. Estado de Resultados (Reales)
# ---------------------------------------------------------------------------

def cargar_estado_resultados(sicofi_engine, pg_engine):
    df = extraer(sicofi_engine, "etl/extract/postventa/extract_estado_resultados.sql", "EdR Reales")
    if df.empty:
        logger.warning("   Sin datos de EdR reales")
        return 0

    records = [{
        'fecha': row['fecha'], 'mui': int(row['mui']),
        'seccion': str(row['seccion']).strip(), 'rama': str(row['rama']).strip(),
        'tipo': str(row['tipo']).strip(),
        'monto': float(row['monto']) if pd.notna(row['monto']) else 0,
    } for _, row in df.iterrows() if pd.notna(row['mui']) and pd.notna(row['fecha'])]

    if not records:
        return 0

    from sqlalchemy import MetaData, Table
    meta = MetaData(schema='dwh')
    tbl = Table('fact_estado_resultados', meta, autoload_with=pg_engine)

    with pg_engine.begin() as conn:
        stmt = pg_insert(tbl).values(records)
        stmt = stmt.on_conflict_do_update(
            constraint='uq_edoresultados',
            set_={'monto': stmt.excluded.monto},
        )
        conn.execute(stmt)

    logger.info(f"   {len(records):,} EdR reales cargados (UPSERT)")
    return len(records)


# ---------------------------------------------------------------------------
# 2. Presupuesto Estado de Resultados
# ---------------------------------------------------------------------------

def cargar_ppto_estado_resultados(sicofi_engine, pg_engine):
    df = extraer(sicofi_engine, "etl/extract/postventa/extract_ppto_estado_resultados.sql", "EdR Ppto")
    if df.empty:
        logger.warning("   Sin datos de EdR presupuesto")
        return 0

    records = [{
        'fecha': row['fecha'], 'mui': int(row['mui']),
        'seccion': str(row['seccion']).strip(), 'rama': str(row['rama']).strip(),
        'tipo': str(row['tipo']).strip(),
        'monto': float(row['monto']) if pd.notna(row['monto']) else 0,
    } for _, row in df.iterrows() if pd.notna(row['mui']) and pd.notna(row['fecha'])]

    if not records:
        return 0

    from sqlalchemy import MetaData, Table
    meta = MetaData(schema='dwh')
    tbl = Table('fact_ppto_estado_resultados', meta, autoload_with=pg_engine)

    with pg_engine.begin() as conn:
        stmt = pg_insert(tbl).values(records)
        stmt = stmt.on_conflict_do_update(
            constraint='uq_ppto_edoresultados',
            set_={'monto': stmt.excluded.monto},
        )
        conn.execute(stmt)

    logger.info(f"   {len(records):,} EdR ppto cargados (UPSERT)")
    return len(records)


# ---------------------------------------------------------------------------
# 3. KPIs Postventa (OTs + Horas MO)
# ---------------------------------------------------------------------------

def cargar_kpis(metrics_engine, pg_engine):
    df = extraer(metrics_engine, "etl/extract/postventa/extract_kpis_postventa.sql", "KPIs Postventa")
    if df.empty:
        logger.warning("   Sin datos de KPIs postventa")
        return 0

    df.rename(columns={
        'mui': 'mui', 'fecha': 'fecha', 'cantidad': 'cantidad',
        'horas_mo': 'horas_mo', 'venta_mo': 'venta_mo',
        'venta_total_sin_iva': 'venta_total_sin_iva',
    }, inplace=True)
    df['mui'] = df['mui'].astype(int)
    df.drop_duplicates(subset=['fecha', 'mui'], keep='first', inplace=True)

    cols = ['mui', 'fecha', 'cantidad', 'horas_mo', 'venta_mo', 'venta_total_sin_iva']

    from sqlalchemy import MetaData, Table
    meta = MetaData(schema='dwh')
    tbl = Table('fact_postventa_kpis', meta, autoload_with=pg_engine)

    records = df[cols].to_dict('records')
    with pg_engine.begin() as conn:
        stmt = pg_insert(tbl).values(records)
        stmt = stmt.on_conflict_do_update(
            constraint='uq_postventa_kpis_fecha_mui',
            set_={k: getattr(stmt.excluded, k) for k in cols if k not in ('fecha', 'mui')},
        )
        conn.execute(stmt)

    logger.info(f"   {len(records):,} KPIs postventa cargados (UPSERT)")
    return len(records)


# ---------------------------------------------------------------------------
# 4. Contable Servicio (Venta Total)
# ---------------------------------------------------------------------------

def cargar_contable_servicio(sicofi_engine, pg_engine):
    df = extraer(sicofi_engine, "etl/extract/postventa/extract_contable_servicio.sql", "Contable Servicio")
    if df.empty:
        logger.warning("   Sin datos de contable servicio")
        return 0

    records = [{
        'fecha': row['fecha'], 'mui': int(row['mui']),
        'tipo': str(row['tipo']).strip(),
        'monto': float(row['monto']) if pd.notna(row['monto']) else 0,
    } for _, row in df.iterrows() if pd.notna(row['mui']) and pd.notna(row['fecha'])]

    if not records:
        return 0

    from sqlalchemy import MetaData, Table
    meta = MetaData(schema='dwh')
    tbl = Table('fact_contable_servicio', meta, autoload_with=pg_engine)

    with pg_engine.begin() as conn:
        stmt = pg_insert(tbl).values(records)
        stmt = stmt.on_conflict_do_update(
            constraint='uq_contable_servicio_fecha_mui_tipo',
            set_={'monto': stmt.excluded.monto},
        )
        conn.execute(stmt)

    logger.info(f"   {len(records):,} contable servicio cargados (UPSERT)")
    return len(records)


# ---------------------------------------------------------------------------
# 5. Venta MO (Contable)
# ---------------------------------------------------------------------------

def cargar_venta_mo(sicofi_engine, pg_engine):
    df = extraer(sicofi_engine, "etl/extract/postventa/extract_venta_mo.sql", "Venta MO")
    if df.empty:
        logger.warning("   Sin datos de venta MO")
        return 0

    records = [{
        'fecha': row['fecha'], 'mui': int(row['mui']),
        'tipo': str(row['tipo']).strip(),
        'monto': float(row['monto']) if pd.notna(row['monto']) else 0,
    } for _, row in df.iterrows() if pd.notna(row['mui']) and pd.notna(row['fecha'])]

    if not records:
        return 0

    from sqlalchemy import MetaData, Table
    meta = MetaData(schema='dwh')
    tbl = Table('fact_contable_servicio', meta, autoload_with=pg_engine)

    with pg_engine.begin() as conn:
        stmt = pg_insert(tbl).values(records)
        stmt = stmt.on_conflict_do_update(
            constraint='uq_contable_servicio_fecha_mui_tipo',
            set_={'monto': stmt.excluded.monto},
        )
        conn.execute(stmt)

    logger.info(f"   {len(records):,} venta MO cargados (UPSERT)")
    return len(records)


# ---------------------------------------------------------------------------
# 6. Ticket Promedio (CSV)
# ---------------------------------------------------------------------------

def cargar_ticket_promedio(pg_engine):
    csv_path = sql_path("etl/extract/postventa/ticket_promedio.csv")
    if not os.path.exists(csv_path):
        logger.warning("   CSV ticket_promedio.csv no encontrado")
        return 0

    df = pd.read_csv(csv_path)
    if df.empty:
        logger.info("   CSV ticket_promedio.csv vacío — omitiendo")
        return 0

    # Map Agencia to MUI
    df['mui'] = df['Agencia'].str.upper().str.strip().map(AGENCIA_MUI)
    df = df.dropna(subset=['mui'])
    df['mui'] = df['mui'].astype(int)
    df['fecha'] = pd.to_datetime(
        df['Año'].astype(str) + '-' + df['Mes_Num'].astype(str).str.zfill(2) + '-01'
    )

    records = [{
        'mui': int(row['mui']),
        'fecha': row['fecha'],
        'ticket_promedio': float(row['Ticket_Promedio']),
    } for _, row in df.iterrows()]

    if not records:
        return 0

    from sqlalchemy import MetaData, Table
    meta = MetaData(schema='dwh')
    tbl = Table('fact_ticket_promedio', meta, autoload_with=pg_engine)

    with pg_engine.begin() as conn:
        stmt = pg_insert(tbl).values(records)
        stmt = stmt.on_conflict_do_update(
            constraint='uq_ticket_promedio_fecha_mui',
            set_={'ticket_promedio': stmt.excluded.ticket_promedio},
        )
        conn.execute(stmt)

    logger.info(f"   {len(records):,} ticket promedio cargados (UPSERT)")
    return len(records)


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    args = parse_arguments()
    modo = "CARGA COMPLETA (6 meses)" if args.full else "INCREMENTAL"

    print("\n" + "=" * 60)
    print("  ETL POSTVENTA + FINANCIERO - Honda Motos")
    print("=" * 60)
    print(f"  Modo: {modo}")
    print("=" * 60)

    logger.info(f"Inicio ETL '{ETL_NAME}' | {modo}")

    try:
        sicofi = DatabaseConnector("sicofi").get_engine()
        metrics = DatabaseConnector("metrics").get_engine()
        pg = DatabaseConnector("postgres").get_engine()

        totals = {}
        totals['edr_reales'] = cargar_estado_resultados(sicofi, pg)
        totals['edr_ppto'] = cargar_ppto_estado_resultados(sicofi, pg)
        totals['kpis'] = cargar_kpis(metrics, pg)
        totals['contable'] = cargar_contable_servicio(sicofi, pg)
        totals['venta_mo'] = cargar_venta_mo(sicofi, pg)
        totals['ticket'] = cargar_ticket_promedio(pg)

        # Update last run
        with pg.connect() as conn:
            conn.execute(
                text("UPDATE dwh.etl_last_run SET last_run_at = NOW() WHERE etl_name = :name"),
                {"name": ETL_NAME},
            )
            conn.commit()

        print("\n" + "=" * 60)
        print("  ETL POSTVENTA + FINANCIERO COMPLETADO")
        print("=" * 60)
        for k, v in totals.items():
            print(f"  {k}: {v:,}")
        print("=" * 60)

        logger.info(f"ETL '{ETL_NAME}' completado | {totals}")

    except SQLAlchemyError as e:
        logger.critical(f"ERROR DE BASE DE DATOS: {e}", exc_info=True)
        sys.exit(1)
    except Exception as e:
        logger.critical(f"ERROR INESPERADO: {e}", exc_info=True)
        sys.exit(1)
    finally:
        for db in ("sicofi", "metrics", "postgres"):
            DatabaseConnector(db).dispose()
        logger.info("Conexiones cerradas.")


if __name__ == "__main__":
    main()
