"""
Exploración completa de Dealer Profile KPIs para Honda Motos (mui 6, 8).
Objetivo: listar los 51 KPIs, su sección, cobertura de datos, y valores de ejemplo
para decidir cuáles incluir en el dashboard.
"""
import os
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(override=True)
dsn = (f"mysql+mysqlconnector://{os.getenv('METRICS_USER')}:{os.getenv('METRICS_PASSWORD')}"
       f"@{os.getenv('METRICS_HOST')}/{os.getenv('METRICS_DATABASE')}?charset=utf8mb4")
engine = create_engine(dsn)

pd.set_option("display.max_columns", 20)
pd.set_option("display.width", 300)
pd.set_option("display.max_colwidth", 50)
pd.set_option("display.max_rows", 80)

def run(query):
    with engine.connect() as conn:
        return pd.read_sql(text(query), conn)

def banner(title):
    print(f"\n{'='*90}")
    print(f"  {title}")
    print(f"{'='*90}")

# ── 1. Catálogo completo de KPIs activos con sección ──
banner("1. CATALOGO COMPLETO: dealer_profile + secciones (estatus=1)")
df_catalogo = run("""
    SELECT dp.id, dp.nombre, dps.nombre AS seccion, dp.orden,
           dp.estatus
    FROM dealer_profile dp
    JOIN dealer_profile_seccion dps ON dps.id = dp.seccion_id
    WHERE dp.estatus = 1
    ORDER BY dps.nombre, dp.orden
""")
print(f"  Total KPIs activos: {len(df_catalogo)}")
print(df_catalogo.to_string(index=False))

# ── 2. Secciones resumen ──
banner("2. SECCIONES: conteo de KPIs por sección")
print(df_catalogo.groupby('seccion').size().reset_index(name='kpis').to_string(index=False))

# ── 3. Cobertura de datos por KPI para Honda Motos (6, 8) ──
banner("3. COBERTURA DE DATOS: registros y rango por KPI (mui 6, 8)")
df_cobertura = run("""
    SELECT dp.id, dp.nombre, dps.nombre AS seccion,
           COUNT(*) AS registros,
           COUNT(DISTINCT v.marca_unidad_id) AS agencias_con_datos,
           GROUP_CONCAT(DISTINCT v.marca_unidad_id ORDER BY v.marca_unidad_id) AS muids,
           MIN(CONCAT(v.anio,'-',LPAD(v.mes,2,'0'))) AS desde,
           MAX(CONCAT(v.anio,'-',LPAD(v.mes,2,'0'))) AS hasta,
           ROUND(AVG(v.valor), 2) AS avg_valor,
           ROUND(AVG(v.sub_valor), 2) AS avg_sub_valor
    FROM dealer_profile dp
    JOIN dealer_profile_seccion dps ON dps.id = dp.seccion_id
    LEFT JOIN dealer_profile_valor v ON v.dealer_profile_id = dp.id
         AND v.marca_unidad_id IN (6, 8)
    WHERE dp.estatus = 1
    GROUP BY dp.id, dp.nombre, dps.nombre
    ORDER BY dps.nombre, dp.id
""")
print(df_cobertura.to_string(index=False))

# ── 4. KPIs SIN datos para Honda Motos ──
banner("4. KPIs SIN DATOS para Honda Motos (candidatos a descartar)")
df_sin_datos = df_cobertura[df_cobertura['registros'] == 0]
if df_sin_datos.empty:
    print("  Todos los KPIs tienen datos para Honda Motos")
else:
    print(df_sin_datos[['id', 'nombre', 'seccion']].to_string(index=False))

# ── 5. Valores recientes (último mes disponible) por KPI y sucursal ──
banner("5. VALORES RECIENTES: último periodo por KPI y sucursal")
df_recientes = run("""
    WITH ultimo AS (
        SELECT marca_unidad_id,
               MAX(CONCAT(anio,'-',LPAD(mes,2,'0'))) AS max_periodo
        FROM dealer_profile_valor
        WHERE marca_unidad_id IN (6, 8)
        GROUP BY marca_unidad_id
    )
    SELECT v.marca_unidad_id AS mui,
           u.max_periodo AS periodo,
           dp.nombre AS kpi,
           dps.nombre AS seccion,
           v.valor,
           v.sub_valor
    FROM dealer_profile_valor v
    JOIN ultimo u ON v.marca_unidad_id = u.marca_unidad_id
         AND CONCAT(v.anio,'-',LPAD(v.mes,2,'0')) = u.max_periodo
    JOIN dealer_profile dp ON dp.id = v.dealer_profile_id
    JOIN dealer_profile_seccion dps ON dps.id = dp.seccion_id
    WHERE dp.estatus = 1
    ORDER BY v.marca_unidad_id, dps.nombre, dp.orden
""")
print(df_recientes.to_string(index=False))

# ── 6. Secciones del dealer_profile_seccion ──
banner("6. TODAS LAS SECCIONES (incluyendo inactivas)")
print(run("SELECT * FROM dealer_profile_seccion ORDER BY id").to_string(index=False))

print("\n\nFIN")
