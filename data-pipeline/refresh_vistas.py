"""
Refresca las vistas materializadas del DWH.

Agregar cada vista materializada del proyecto a la lista VIEWS.
Ejecutar despues de cada ETL para que la API sirva datos actualizados.

Uso:
    .venv/bin/python3 data-pipeline/refresh_vistas.py
"""
import sys
sys.path.insert(0, "data-pipeline")

from dotenv import load_dotenv
load_dotenv()

from etl.utils import DatabaseConnector, setup_logger
from sqlalchemy import text

# ---------------------------------------------------------------------------
# TEMPLATE: Agregar aqui las vistas materializadas del proyecto
# ---------------------------------------------------------------------------
VIEWS = [
    "dwh.mv_kpis_ventas_mensual",
    # "dwh.mv_otra_vista",
]

# ---------------------------------------------------------------------------
logger = setup_logger(name="refresh_vistas")
pg = DatabaseConnector("postgres")
engine = pg.get_engine()

with engine.connect() as conn:
    for view in VIEWS:
        logger.info(f"Refrescando {view}...")
        conn.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
        conn.commit()
        logger.info(f"OK: {view} refrescada.")

logger.info(f"Todas las vistas refrescadas ({len(VIEWS)} total).")
