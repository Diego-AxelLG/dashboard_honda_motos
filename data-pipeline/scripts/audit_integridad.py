"""
============================================================================
 AUDITORÍA DE INTEGRIDAD DE DATOS
============================================================================
Verifica que los datos en el DWH PostgreSQL corresponden a Honda Motos
y no a Honda Autos. Conecta a las 3 fuentes MySQL y al DWH.

EJECUCION:
  cd /home/diegoaxel/proyectos/dashboard_honda_motos
  source venv/bin/activate
  PYTHONPATH=. python data-pipeline/scripts/audit_integridad.py
============================================================================
"""
import os
import sys
import pandas as pd
from dotenv import load_dotenv

DATA_PIPELINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(DATA_PIPELINE)
sys.path.insert(0, DATA_PIPELINE)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

from etl.utils import DatabaseConnector, setup_logger

logger = setup_logger("audit")

SEPARATOR = "=" * 70


def section(title):
    print(f"\n{SEPARATOR}")
    print(f"  {title}")
    print(SEPARATOR)


def run_query(engine, sql, label=""):
    try:
        df = pd.read_sql(sql, engine)
        return df
    except Exception as e:
        print(f"  ❌ ERROR en {label}: {e}")
        return pd.DataFrame()


def main():
    print(f"\n{'#' * 70}")
    print("  AUDITORÍA DE INTEGRIDAD - Honda Motos Dashboard")
    print(f"{'#' * 70}")

    # --- Conectar a todas las bases ---
    section("1. CONECTANDO A BASES DE DATOS")
    engines = {}
    for db in ["metrics", "hmcrm", "sicofi", "postgres"]:
        try:
            engines[db] = DatabaseConnector(db).get_engine()
            print(f"  ✓ {db}: conectado")
        except Exception as e:
            print(f"  ✗ {db}: FALLO — {e}")
            engines[db] = None

    # =====================================================================
    # CHECK 1: ¿Qué son MUI 6, 7, 8 en metrics?
    # =====================================================================
    section("2. VERIFICAR IDENTIDAD DE MUI 6, 7, 8 EN METRICS")

    if engines.get("metrics"):
        # Buscar en dealer_profile o marca_unidad si existe
        for table_query, label in [
            ("""
                SELECT DISTINCT marca_unidad_id,
                       LEFT(factura, 3) AS prefijo_factura,
                       COUNT(*) AS registros
                FROM servicio_ventas
                WHERE marca_unidad_id IN (6, 7, 8)
                GROUP BY marca_unidad_id, LEFT(factura, 3)
                ORDER BY marca_unidad_id, registros DESC
            """, "Prefijos de factura por MUI en servicio_ventas"),
            ("""
                SELECT DISTINCT marca_unidad_id,
                       tipo_orden,
                       COUNT(*) AS registros
                FROM servicio_ventas
                WHERE marca_unidad_id IN (6, 7, 8)
                GROUP BY marca_unidad_id, tipo_orden
                ORDER BY marca_unidad_id, registros DESC
            """, "Tipos de orden por MUI en servicio_ventas"),
            ("""
                SELECT DISTINCT marca_unidad_id, marca, COUNT(*) AS registros
                FROM servicio_ventas
                WHERE marca_unidad_id IN (6, 7, 8)
                GROUP BY marca_unidad_id, marca
                ORDER BY marca_unidad_id, registros DESC
            """, "Marcas por MUI en servicio_ventas"),
        ]:
            print(f"\n  --- {label} ---")
            df = run_query(engines["metrics"], table_query, label)
            if not df.empty:
                print(df.to_string(index=False))
            else:
                print("  (sin resultados o columna no existe)")

        # Verificar si existe tabla marca_unidad o similar
        print("\n  --- Tablas con 'marca' o 'unidad' en el nombre ---")
        df_tables = run_query(engines["metrics"],
            "SHOW TABLES LIKE '%marca%'", "tablas marca")
        if not df_tables.empty:
            print(df_tables.to_string(index=False))
        df_tables2 = run_query(engines["metrics"],
            "SHOW TABLES LIKE '%unidad%'", "tablas unidad")
        if not df_tables2.empty:
            print(df_tables2.to_string(index=False))

        # dealer_profile directo
        print("\n  --- Nombres en dealer_profile por MUI ---")
        df_dp = run_query(engines["metrics"], """
            SELECT DISTINCT v.marca_unidad_id, dp.nombre
            FROM dealer_profile_valor v
            JOIN dealer_profile dp ON dp.id = v.dealer_profile_id
            WHERE v.marca_unidad_id IN (6, 7, 8)
            LIMIT 20
        """, "dealer_profile nombres")
        if not df_dp.empty:
            print(df_dp.to_string(index=False))

    # =====================================================================
    # CHECK 2: ¿Qué MUIs existen y cuáles son Honda Motos vs Honda Autos?
    # =====================================================================
    section("3. TODOS LOS MUI DISPONIBLES EN METRICS")

    if engines.get("metrics"):
        df_all_mui = run_query(engines["metrics"], """
            SELECT marca_unidad_id,
                   COUNT(*) AS total_registros,
                   MIN(fecha_factura) AS primera_factura,
                   MAX(fecha_factura) AS ultima_factura,
                   GROUP_CONCAT(DISTINCT LEFT(factura, 3) ORDER BY LEFT(factura, 3)) AS prefijos
            FROM servicio_ventas
            GROUP BY marca_unidad_id
            ORDER BY marca_unidad_id
        """, "todos los MUI")
        if not df_all_mui.empty:
            print(df_all_mui.to_string(index=False))

    # =====================================================================
    # CHECK 3: Verificar hmcrm — ciudades y agencias
    # =====================================================================
    section("4. VERIFICAR HMCRM — CIUDADES Y AGENCIAS")

    if engines.get("hmcrm"):
        print("\n  --- Ciudades disponibles en huser ---")
        df_cities = run_query(engines["hmcrm"], """
            SELECT hus_ciudad, hus_tipo, COUNT(*) AS usuarios
            FROM huser
            GROUP BY hus_ciudad, hus_tipo
            ORDER BY usuarios DESC
        """, "ciudades huser")
        if not df_cities.empty:
            print(df_cities.to_string(index=False))

        print("\n  --- Agencias en plan_venta ---")
        df_agencies = run_query(engines["hmcrm"], """
            SELECT DISTINCT plv_id_agencia, COUNT(*) AS registros
            FROM plan_venta
            GROUP BY plv_id_agencia
            ORDER BY plv_id_agencia
        """, "agencias plan_venta")
        if not df_agencies.empty:
            print(df_agencies.to_string(index=False))

        print("\n  --- Conteo ventas por ciudad (vw_ventas_totales) ---")
        df_ventas_city = run_query(engines["hmcrm"], """
            SELECT hus_ciudad, COUNT(*) AS ventas,
                   MIN(dat_fecha_facturacion) AS primera,
                   MAX(dat_fecha_facturacion) AS ultima
            FROM vw_ventas_totales
            WHERE datco_snuevo = 'si'
            GROUP BY hus_ciudad
            ORDER BY ventas DESC
        """, "ventas por ciudad")
        if not df_ventas_city.empty:
            print(df_ventas_city.to_string(index=False))

        print("\n  --- VINs en asigancion_auto (inventario) SIN filtro ---")
        df_inv_all = run_query(engines["hmcrm"], """
            SELECT COUNT(*) AS total_vins,
                   COUNT(DISTINCT aau_IdFk) AS vins_unicos
            FROM asigancion_auto
            WHERE aau_fecha_llegada != '0000-00-00'
              AND LENGTH(aau_IdFk) = 17
              AND aau_fecha_llegada >= '2021-01-01'
        """, "inventario sin filtro")
        if not df_inv_all.empty:
            print(df_inv_all.to_string(index=False))

        # ¿Hay columna de agencia en asigancion_auto?
        print("\n  --- Columnas de asigancion_auto ---")
        df_cols = run_query(engines["hmcrm"],
            "SHOW COLUMNS FROM asigancion_auto", "cols asigancion_auto")
        if not df_cols.empty:
            print(df_cols.to_string(index=False))

    # =====================================================================
    # CHECK 4: Sicofi — marcas disponibles
    # =====================================================================
    section("5. VERIFICAR SICOFI — MARCAS Y TERMINACIONES")

    if engines.get("sicofi"):
        print("\n  --- Marcas y terminaciones en balanza_ppto ---")
        df_marcas = run_query(engines["sicofi"], """
            SELECT marca, terminacion,
                   COUNT(*) AS registros,
                   MIN(anio_ejercicio) AS anio_min,
                   MAX(anio_ejercicio) AS anio_max
            FROM balanza_ppto
            GROUP BY marca, terminacion
            ORDER BY marca, terminacion
        """, "marcas sicofi")
        if not df_marcas.empty:
            print(df_marcas.to_string(index=False))

    # =====================================================================
    # CHECK 5: Comparar conteos ORIGEN vs DWH
    # =====================================================================
    section("6. COMPARACIÓN CONTEOS ORIGEN vs DWH")

    if engines.get("postgres"):
        pg = engines["postgres"]

        comparisons = [
            ("fact_ventas",
             "SELECT COUNT(*) AS dwh_count, MIN(fecha) AS min_fecha, MAX(fecha) AS max_fecha FROM dwh.fact_ventas",
             "hmcrm", """
                SELECT COUNT(*) AS origen_count,
                       MIN(dat_fecha_facturacion) AS min_fecha,
                       MAX(dat_fecha_facturacion) AS max_fecha
                FROM vw_ventas_totales
                WHERE datco_snuevo = 'si' AND hus_ciudad IN ('Tijuana', 'Mexicali')
                  AND dat_fecha_facturacion >= '2024-01-01'
             """),
            ("fact_ventas por sucursal",
             "SELECT id_sucursal, COUNT(*) AS dwh_count FROM dwh.fact_ventas GROUP BY id_sucursal ORDER BY id_sucursal",
             "hmcrm", """
                SELECT CASE WHEN hus_ciudad LIKE '%Mexicali%' THEN 8 ELSE 6 END AS sucursal,
                       COUNT(*) AS origen_count
                FROM vw_ventas_totales
                WHERE datco_snuevo = 'si' AND hus_ciudad IN ('Tijuana', 'Mexicali')
                  AND dat_fecha_facturacion >= '2024-01-01'
                GROUP BY sucursal
                ORDER BY sucursal
             """),
            ("fact_servicio_kpi",
             "SELECT COUNT(*) AS dwh_count, MIN(fecha) AS min_fecha, MAX(fecha) AS max_fecha FROM dwh.fact_servicio_kpi",
             None, None),
            ("fact_plan",
             "SELECT COUNT(*) AS dwh_count FROM dwh.fact_plan",
             None, None),
            ("fact_dealer_profile",
             "SELECT COUNT(*) AS dwh_count, MIN(fecha) AS min_fecha, MAX(fecha) AS max_fecha FROM dwh.fact_dealer_profile",
             None, None),
            ("fact_inventario",
             "SELECT COUNT(*) AS dwh_count, MIN(fecha_snapshot) AS min_fecha, MAX(fecha_snapshot) AS max_fecha FROM dwh.fact_inventario",
             None, None),
        ]

        for label, dwh_sql, origen_db, origen_sql in comparisons:
            print(f"\n  --- {label} ---")
            df_dwh = run_query(pg, dwh_sql, f"DWH {label}")
            if not df_dwh.empty:
                print(f"  DWH:    {df_dwh.to_dict('records')}")

            if origen_db and origen_sql and engines.get(origen_db):
                df_orig = run_query(engines[origen_db], origen_sql, f"Origen {label}")
                if not df_orig.empty:
                    print(f"  Origen: {df_orig.to_dict('records')}")

    # =====================================================================
    # CHECK 6: Verificar prefijos factura en servicio (¿Honda Autos?)
    # =====================================================================
    section("7. PREFIJOS FACTURA: ¿CUÁLES SON HONDA MOTOS vs AUTOS?")

    if engines.get("metrics"):
        print("\n  --- Prefijos de factura para MUI 6 y 8 ---")
        df_pref = run_query(engines["metrics"], """
            SELECT marca_unidad_id,
                   UPPER(LEFT(factura, 3)) AS prefijo,
                   marca,
                   COUNT(*) AS registros
            FROM servicio_ventas
            WHERE marca_unidad_id IN (6, 8)
            GROUP BY marca_unidad_id, UPPER(LEFT(factura, 3)), marca
            ORDER BY marca_unidad_id, registros DESC
        """, "prefijos factura")
        if not df_pref.empty:
            print(df_pref.to_string(index=False))

        print("\n  --- Prefijos factura SMT/SMM vs otros para MUI 6,8 ---")
        df_smt = run_query(engines["metrics"], """
            SELECT
                marca_unidad_id,
                CASE WHEN UPPER(LEFT(factura, 3)) IN ('SMT', 'SMM') THEN 'Honda Motos (SMT/SMM)'
                     ELSE CONCAT('Otro: ', UPPER(LEFT(factura, 3)))
                END AS tipo_factura,
                COUNT(*) AS registros,
                ROUND(SUM(venta_mo + venta_tot + venta_partes + venta_materiales
                    - descuento_mo - descuento_tot - descuento_partes - descuento_materiales), 2) AS venta_total
            FROM servicio_ventas
            WHERE marca_unidad_id IN (6, 8)
            GROUP BY marca_unidad_id, tipo_factura
            ORDER BY marca_unidad_id, registros DESC
        """, "SMT/SMM vs otros")
        if not df_smt.empty:
            print(df_smt.to_string(index=False))

    # =====================================================================
    # CHECK 7: ¿Existen MUIs para Honda Autos en metrics?
    # =====================================================================
    section("8. ¿EXISTEN MUIs DE HONDA AUTOS EN METRICS?")

    if engines.get("metrics"):
        print("\n  --- Todos los MUI con sus marcas predominantes ---")
        df_all = run_query(engines["metrics"], """
            SELECT marca_unidad_id,
                   marca,
                   COUNT(*) AS registros,
                   GROUP_CONCAT(DISTINCT UPPER(LEFT(factura, 3)) ORDER BY UPPER(LEFT(factura, 3))) AS prefijos
            FROM servicio_ventas
            GROUP BY marca_unidad_id, marca
            HAVING registros > 100
            ORDER BY marca_unidad_id, registros DESC
        """, "MUIs con marcas")
        if not df_all.empty:
            print(df_all.to_string(index=False))

    # =====================================================================
    # Cleanup
    # =====================================================================
    section("AUDITORÍA COMPLETADA")
    print("  Revisa los resultados arriba para determinar si los datos son correctos.")
    print("  Busca especialmente:")
    print("    - Si MUI 6/8 en metrics corresponden a HONDA (motos) o HONDA (autos)")
    print("    - Si los prefijos de factura diferentes a SMT/SMM contaminan datos")
    print("    - Diferencias significativas en conteos origen vs DWH")
    print("    - Si asigancion_auto (inventario) necesita filtro de agencia")
    print()

    for db in engines:
        try:
            DatabaseConnector(db).dispose()
        except Exception:
            pass


if __name__ == "__main__":
    main()
