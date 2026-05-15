"""
============================================================================
 ETL Plan CSV — Honda Motos
============================================================================
Carga los planes mensuales desde CSV manuales:

  data-pipeline/csv/Plan_5_alas.csv         -> fact_plan (motos)
  data-pipeline/csv/plan_postventa_2026.csv -> fact_plan_postventa

Plan motos:  DELETE 2026 + INSERT desde CSV (CSV es fuente de verdad).
Plan postv:  UPSERT por (anio_mes, id_sucursal, tipo).

EJECUCION:
  PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_plan_csv.py
============================================================================
"""
import os
import sys
import csv
from datetime import date

from sqlalchemy import text, MetaData, Table
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

from etl.utils import setup_logger, DatabaseConnector

load_dotenv()
ETL_NAME = "plan_csv"
ANIO = 2026
logger = setup_logger()

CSV_DIR = os.path.join(PROJECT_ROOT, "csv")
CSV_MOTOS = os.path.join(CSV_DIR, "Plan_5_alas.csv")
CSV_POSTVENTA = os.path.join(CSV_DIR, "plan_postventa_2026.csv")

MES_NUM = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
    "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
    "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}

TIPO_MAP = {
    "refacciones mostrador": "refacciones_mostrador",
    "mano de obra": "mano_obra",
    "refacciones de taller": "refacciones_taller",
}


# ---------------------------------------------------------------------------
# Plan motos: Plan_5_alas.csv
# ---------------------------------------------------------------------------

def cargar_plan_motos(pg_engine) -> int:
    if not os.path.exists(CSV_MOTOS):
        logger.warning(f"   No existe: {CSV_MOTOS}")
        return 0

    records = []
    with open(CSV_MOTOS, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = [c.strip().lower() for c in next(reader)]
        try:
            i_mes = header.index("mes")
            i_tj = header.index("tijuana")
            i_mx = header.index("mexicali")
        except ValueError:
            logger.error(f"   Headers no esperados en {CSV_MOTOS}: {header}")
            return 0
        for row in reader:
            if not row or not row[i_mes].strip():
                continue
            mes_str = row[i_mes].strip().lower()
            mes_num = MES_NUM.get(mes_str)
            if not mes_num:
                continue
            anio_mes = f"{ANIO}-{mes_num:02d}"
            try:
                plan_tj = int(float(row[i_tj]))
                plan_mx = int(float(row[i_mx]))
            except (ValueError, IndexError):
                logger.warning(f"   Fila inválida en {mes_str}: {row}")
                continue
            records.append({"anio_mes": anio_mes, "id_sucursal": 6, "modelo": "TOTAL", "plan_ventas": plan_tj})
            records.append({"anio_mes": anio_mes, "id_sucursal": 8, "modelo": "TOTAL", "plan_ventas": plan_mx})

    if not records:
        logger.warning("   Sin filas válidas para fact_plan")
        return 0

    with pg_engine.begin() as conn:
        deleted = conn.execute(text(
            f"DELETE FROM dwh.fact_plan WHERE anio_mes LIKE :prefix"
        ), {"prefix": f"{ANIO}-%"}).rowcount
        conn.execute(text(
            "INSERT INTO dwh.fact_plan (anio_mes, id_sucursal, modelo, plan_ventas) "
            "VALUES (:anio_mes, :id_sucursal, :modelo, :plan_ventas)"
        ), records)

    logger.info(f"   plan_motos: borradas {deleted} filas {ANIO} previas, insertadas {len(records)} desde CSV")
    return len(records)


# ---------------------------------------------------------------------------
# Plan postventa: plan_postventa_2026.csv (3 bloques apilados)
# ---------------------------------------------------------------------------

def parse_plan_postventa(path: str) -> list[dict]:
    """Parser tolerante para el archivo con 3 bloques (Mostrador / MO / Taller)."""
    rows: list[dict] = []
    current_tipo: str | None = None
    in_data = False

    with open(path, newline="", encoding="utf-8-sig") as f:
        for raw in csv.reader(f):
            if not raw or all(not c.strip() for c in raw):
                in_data = False
                continue
            cell0 = raw[0].strip().lower()

            # ¿Header de bloque? (contiene "meta de" + nombre del tipo)
            if "meta" in cell0:
                current_tipo = None
                for key, tipo in TIPO_MAP.items():
                    if key in cell0:
                        current_tipo = tipo
                        break
                in_data = False
                continue

            # ¿Header de columnas?
            if cell0.startswith("mes"):
                in_data = True
                continue

            # ¿Fila Total? Salta
            if cell0 == "total":
                in_data = False
                continue

            if not in_data or current_tipo is None:
                continue

            mes_num = MES_NUM.get(cell0)
            if not mes_num:
                continue
            anio_mes = date(ANIO, mes_num, 1)

            # Layout esperado: Mes, Grupo, Mexicali, Tijuana
            try:
                monto_mx = float(raw[2])
                monto_tj = float(raw[3])
            except (ValueError, IndexError):
                continue
            rows.append({"anio_mes": anio_mes, "id_sucursal": 8, "tipo": current_tipo, "monto": monto_mx})
            rows.append({"anio_mes": anio_mes, "id_sucursal": 6, "tipo": current_tipo, "monto": monto_tj})

    return rows


def cargar_plan_postventa(pg_engine) -> int:
    if not os.path.exists(CSV_POSTVENTA):
        logger.warning(f"   No existe: {CSV_POSTVENTA}")
        return 0

    records = parse_plan_postventa(CSV_POSTVENTA)
    if not records:
        logger.warning("   Sin filas parseadas para fact_plan_postventa")
        return 0

    meta = MetaData(schema="dwh")
    tbl = Table("fact_plan_postventa", meta, autoload_with=pg_engine)

    with pg_engine.begin() as conn:
        stmt = pg_insert(tbl).values(records)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_plan_postventa",
            set_={"monto": stmt.excluded.monto},
        )
        conn.execute(stmt)

    logger.info(f"   plan_postventa: {len(records)} filas cargadas (UPSERT)")
    return len(records)


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main():
    print("\n" + "=" * 60)
    print("  ETL PLAN CSV - Honda Motos")
    print("=" * 60)
    print(f"  Año: {ANIO}")
    print(f"  CSV motos:    {CSV_MOTOS}")
    print(f"  CSV postvta:  {CSV_POSTVENTA}")
    print("=" * 60)

    logger.info(f"Inicio ETL '{ETL_NAME}' | año={ANIO}")
    try:
        pg = DatabaseConnector("postgres").get_engine()
        n_motos = cargar_plan_motos(pg)
        n_post = cargar_plan_postventa(pg)
        with pg.connect() as conn:
            conn.execute(
                text("UPDATE dwh.etl_last_run SET last_run_at = NOW() WHERE etl_name = :name"),
                {"name": ETL_NAME},
            )
            conn.commit()
        print("\n" + "=" * 60)
        print("  ETL PLAN CSV COMPLETADO")
        print("=" * 60)
        print(f"  Plan motos:     {n_motos:,}")
        print(f"  Plan postvta:   {n_post:,}")
        print("=" * 60)
        logger.info(f"ETL '{ETL_NAME}' completado | motos={n_motos} postv={n_post}")
    except SQLAlchemyError as e:
        logger.critical(f"ERROR DE BASE DE DATOS: {e}", exc_info=True)
        sys.exit(1)
    except Exception as e:
        logger.critical(f"ERROR INESPERADO: {e}", exc_info=True)
        sys.exit(1)
    finally:
        DatabaseConnector("postgres").dispose()
        logger.info("Conexiones cerradas.")


if __name__ == "__main__":
    main()
