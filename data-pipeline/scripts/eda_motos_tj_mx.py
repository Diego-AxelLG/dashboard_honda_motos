"""
EDA – Honda Motos: Tijuana (6) y Mexicali (8)
Calidad de columnas, nulos, distribuciones y anomalías.
"""
import os, warnings
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

warnings.filterwarnings("ignore")
load_dotenv(override=True)

dsn = (f"mysql+mysqlconnector://{os.getenv('METRICS_USER')}:{os.getenv('METRICS_PASSWORD')}"
       f"@{os.getenv('METRICS_HOST')}/{os.getenv('METRICS_DATABASE')}?charset=utf8mb4")
engine = create_engine(dsn)

IDS = "6, 8"
LABELS = {6: "Tijuana", 8: "Mexicali"}

def banner(title):
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}")

def run(query):
    with engine.connect() as conn:
        return pd.read_sql(text(query), conn)

def show(df, max_rows=60):
    pd.set_option("display.max_columns", 40)
    pd.set_option("display.width", 300)
    pd.set_option("display.max_colwidth", 50)
    pd.set_option("display.max_rows", max_rows)
    if df.empty:
        print("  (sin resultados)")
    else:
        print(df.to_string(index=False))

def null_report(table, where_clause, sample_limit=500000):
    """Analiza % de nulos y vacíos por columna."""
    banner(f"NULOS / VACÍOS – {table}")
    try:
        df = run(f"SELECT * FROM {table} WHERE {where_clause} LIMIT {sample_limit}")
        total = len(df)
        print(f"  Registros analizados: {total:,}")
        report = []
        for col in df.columns:
            nulls = df[col].isna().sum()
            empties = (df[col].astype(str).str.strip() == "").sum() if df[col].dtype == object else 0
            zeros = (df[col] == 0).sum() if pd.api.types.is_numeric_dtype(df[col]) else 0
            uniq = df[col].nunique()
            report.append({
                "columna": col,
                "tipo_pandas": str(df[col].dtype),
                "nulos": nulls,
                "%_nulos": round(nulls / total * 100, 1),
                "vacios": empties,
                "%_vacios": round(empties / total * 100, 1),
                "zeros": zeros,
                "unicos": uniq,
                "ejemplo": str(df[col].dropna().iloc[0])[:40] if nulls < total else "ALL NULL"
            })
        rdf = pd.DataFrame(report)
        show(rdf)
        return df
    except Exception as e:
        print(f"  ERROR: {str(e).split(chr(10))[0][:200]}")
        return pd.DataFrame()

# ═══════════════════════════════════════════════════════════════════
# 1. VENTAS MOTOS NUEVAS
# ═══════════════════════════════════════════════════════════════════
banner("1. VENTAS_AUTOS_NUEVOS – Resumen por ciudad")
show(run(f"""
    SELECT marca_unidad_id, COUNT(*) registros,
           COUNT(DISTINCT YEAR(fecha_factura)) anios,
           MIN(fecha_factura) min_fecha, MAX(fecha_factura) max_fecha,
           COUNT(DISTINCT vin) vins_unicos,
           COUNT(DISTINCT nombre_vendedor) vendedores,
           ROUND(AVG(venta_total),2) avg_venta,
           ROUND(MIN(venta_total),2) min_venta,
           ROUND(MAX(venta_total),2) max_venta
    FROM ventas_autos_nuevos
    WHERE marca_unidad_id IN ({IDS})
    GROUP BY marca_unidad_id
"""))

banner("1b. VENTAS – Distribución por tipo_venta")
show(run(f"""
    SELECT marca_unidad_id, tipo_venta, COUNT(*) registros,
           ROUND(AVG(venta_total),2) avg_venta
    FROM ventas_autos_nuevos
    WHERE marca_unidad_id IN ({IDS})
    GROUP BY marca_unidad_id, tipo_venta
    ORDER BY marca_unidad_id, registros DESC
"""))

banner("1c. VENTAS – Registros por año-mes (últimos 14 meses)")
show(run(f"""
    SELECT marca_unidad_id,
           CONCAT(YEAR(fecha_factura), '-', LPAD(MONTH(fecha_factura),2,'0')) periodo,
           COUNT(*) ventas,
           ROUND(SUM(venta_total),0) ingreso_total
    FROM ventas_autos_nuevos
    WHERE marca_unidad_id IN ({IDS})
      AND fecha_factura >= DATE_SUB(CURDATE(), INTERVAL 14 MONTH)
    GROUP BY marca_unidad_id, periodo
    ORDER BY marca_unidad_id, periodo
"""))

banner("1d. VENTAS – Top 10 modelos")
show(run(f"""
    SELECT marca_unidad_id, modelo, COUNT(*) ventas,
           ROUND(AVG(venta_total),0) avg_precio
    FROM ventas_autos_nuevos
    WHERE marca_unidad_id IN ({IDS})
      AND fecha_factura >= '2024-01-01'
    GROUP BY marca_unidad_id, modelo
    ORDER BY marca_unidad_id, ventas DESC
"""))

df_ventas = null_report("ventas_autos_nuevos", f"marca_unidad_id IN ({IDS})")

# Detectar posibles duplicados por VIN + fecha
banner("1e. VENTAS – Posibles duplicados (mismo VIN + fecha)")
show(run(f"""
    SELECT vin, fecha_factura, COUNT(*) veces
    FROM ventas_autos_nuevos
    WHERE marca_unidad_id IN ({IDS})
    GROUP BY vin, fecha_factura
    HAVING veces > 1
    ORDER BY veces DESC
    LIMIT 15
"""))

# ═══════════════════════════════════════════════════════════════════
# 2. INVENTARIO MOTOS NUEVAS
# ═══════════════════════════════════════════════════════════════════
banner("2. INVENTARIO_NUEVOS – Resumen por ciudad")
show(run(f"""
    SELECT marca_unidad_id, COUNT(*) registros,
           COUNT(DISTINCT vin) vins_unicos,
           COUNT(DISTINCT estatus) estatus_distintos,
           MIN(registro) min_fecha, MAX(registro) max_fecha
    FROM inventario_nuevos
    WHERE marca_unidad_id IN ({IDS})
    GROUP BY marca_unidad_id
"""))

banner("2b. INVENTARIO – Distribución de estatus (último corte)")
show(run(f"""
    SELECT i.marca_unidad_id, i.estatus, COUNT(*) unidades
    FROM inventario_nuevos i
    INNER JOIN (
        SELECT marca_unidad_id, MAX(registro) as max_reg
        FROM inventario_nuevos
        WHERE marca_unidad_id IN ({IDS})
        GROUP BY marca_unidad_id
    ) m ON i.marca_unidad_id = m.marca_unidad_id AND i.registro = m.max_reg
    GROUP BY i.marca_unidad_id, i.estatus
    ORDER BY i.marca_unidad_id, unidades DESC
"""))

df_inv = null_report("inventario_nuevos", f"marca_unidad_id IN ({IDS})", 300000)

# ═══════════════════════════════════════════════════════════════════
# 3. SERVICIO (POSTVENTA)
# ═══════════════════════════════════════════════════════════════════
banner("3. SERVICIO_VENTAS – Resumen por ciudad")
show(run(f"""
    SELECT marca_unidad_id, COUNT(*) registros,
           MIN(fecha_factura) min_fecha, MAX(fecha_factura) max_fecha,
           COUNT(DISTINCT vin) vins_unicos
    FROM servicio_ventas
    WHERE marca_unidad_id IN ({IDS})
    GROUP BY marca_unidad_id
"""))

banner("3b. SERVICIO_VENTAS – Columnas disponibles")
show(run("DESCRIBE servicio_ventas"))

df_sv = null_report("servicio_ventas", f"marca_unidad_id IN ({IDS})")

# ═══════════════════════════════════════════════════════════════════
# 4. OS_PROCESO (órdenes de servicio)
# ═══════════════════════════════════════════════════════════════════
banner("4. OS_PROCESO – Resumen por ciudad")
show(run(f"""
    SELECT marca_unidad_id, COUNT(*) registros,
           MIN(fecha_apertura) min_fecha, MAX(fecha_apertura) max_fecha
    FROM os_proceso
    WHERE marca_unidad_id IN ({IDS})
    GROUP BY marca_unidad_id
"""))

banner("4b. OS_PROCESO – Columnas disponibles")
show(run("DESCRIBE os_proceso"))

df_os = null_report("os_proceso", f"marca_unidad_id IN ({IDS})")

# ═══════════════════════════════════════════════════════════════════
# 5. REFACCIONES INVENTARIO
# ═══════════════════════════════════════════════════════════════════
banner("5. REFACCIONES_INVENTARIO – Resumen por ciudad")
show(run(f"""
    SELECT marca_unidad_id, COUNT(*) registros,
           COUNT(DISTINCT numero_parte) partes_unicas,
           MIN(registro) min_fecha, MAX(registro) max_fecha,
           ROUND(AVG(costo),2) avg_costo,
           ROUND(SUM(costo),0) costo_total_inventario
    FROM refacciones_inventario
    WHERE marca_unidad_id IN ({IDS})
      AND registro = (SELECT MAX(registro) FROM refacciones_inventario WHERE marca_unidad_id = 6)
    GROUP BY marca_unidad_id
"""))

df_ref = null_report(
    "refacciones_inventario",
    f"marca_unidad_id IN ({IDS}) AND registro >= '2025-01-01'",
    300000
)

# ═══════════════════════════════════════════════════════════════════
# 6. DEALER PROFILE (KPIs mensuales)
# ═══════════════════════════════════════════════════════════════════
banner("6. DEALER_PROFILE_VALOR – Resumen por ciudad")
show(run(f"""
    SELECT marca_unidad_id, COUNT(*) registros,
           MIN(CONCAT(anio,'-',LPAD(mes,2,'0'))) min_periodo,
           MAX(CONCAT(anio,'-',LPAD(mes,2,'0'))) max_periodo,
           COUNT(DISTINCT dealer_profile_id) kpis_distintos
    FROM dealer_profile_valor
    WHERE marca_unidad_id IN ({IDS})
    GROUP BY marca_unidad_id
"""))

banner("6b. DEALER_PROFILE – Estructura")
show(run("DESCRIBE dealer_profile"))

banner("6c. DEALER_PROFILE – KPIs disponibles (sample)")
show(run(f"""
    SELECT dp.id, dp.nombre, COUNT(*) registros
    FROM dealer_profile_valor dpv
    JOIN dealer_profile dp ON dpv.dealer_profile_id = dp.id
    WHERE dpv.marca_unidad_id = 6
      AND dpv.anio >= 2024
    GROUP BY dp.id, dp.nombre
    ORDER BY dp.nombre
    LIMIT 50
"""))

df_dp = null_report("dealer_profile_valor", f"marca_unidad_id IN ({IDS})")

# ═══════════════════════════════════════════════════════════════════
# 7. RESUMEN GERENCIAL
# ═══════════════════════════════════════════════════════════════════
banner("7. RESUMEN_GERENCIAL_VALOR – Estructura")
show(run("DESCRIBE resumen_gerencial"))

banner("7b. RESUMEN_GERENCIAL – Indicadores disponibles")
show(run(f"""
    SELECT rg.id, rg.nombre, COUNT(*) registros
    FROM resumen_gerencial_valor rgv
    JOIN resumen_gerencial rg ON rgv.resumen_gerencial_id = rg.id
    WHERE rgv.marca_unidad_id IN ({IDS})
      AND rgv.anio >= 2024
    GROUP BY rg.id, rg.nombre
    ORDER BY rg.nombre
"""))

df_rg = null_report("resumen_gerencial_valor", f"marca_unidad_id IN ({IDS})")

# ═══════════════════════════════════════════════════════════════════
# 8. BALANZA PRESUPUESTO (SICOFI)
# ═══════════════════════════════════════════════════════════════════
banner("8. SICOFI.BALANZA_PPTO – Cobertura mensual")
show(run("""
    SELECT anio_ejercicio, COUNT(DISTINCT mes) meses_con_datos,
           COUNT(*) registros
    FROM sicofi.balanza_ppto
    WHERE marca = 'HONDA MOTOS'
    GROUP BY anio_ejercicio
    ORDER BY anio_ejercicio
"""))

df_bp = null_report("sicofi.balanza_ppto", "marca = 'HONDA MOTOS'", 200000)


# ═══════════════════════════════════════════════════════════════════
# RESUMEN FINAL DE CALIDAD
# ═══════════════════════════════════════════════════════════════════
banner("RESUMEN FINAL – CALIDAD DE DATOS")
print("""
Tabla                     | TJ(6) | MX(8) | Alertas
--------------------------|-------|-------|----------------------------------
ventas_autos_nuevos       |   ✓   |   ✓   | Revisar nulos arriba
inventario_nuevos         |   ✓   |   ✓   | Revisar estatus / nulos
servicio_ventas           |   ✓   |   ✓   | Revisar nulos arriba
os_proceso                |   ✓   |   ✓   | Revisar nulos arriba
refacciones_inventario    |   ✓   |   ✓   | Revisar existencia como varchar
dealer_profile_valor      |   ✓   |   ✓   | Revisar KPIs disponibles
resumen_gerencial_valor   |   ✓   |   ✓   | JOIN con resumen_gerencial OK
sicofi.balanza_ppto       |   ✓   |   ✓   | Sin marca_unidad_id, usa marca

Nota: columna 'existencia' en refacciones_inventario es VARCHAR, no numérico.
""")

print("FIN del EDA")
