"""
V4: Tablas que fallaron + servicio_ventas/os_proceso/dealer_profile para Honda Motos
"""
import os
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv(override=True)
dsn = (f"mysql+mysqlconnector://{os.getenv('METRICS_USER')}:{os.getenv('METRICS_PASSWORD')}"
       f"@{os.getenv('METRICS_HOST')}/{os.getenv('METRICS_DATABASE')}?charset=utf8mb4")
engine = create_engine(dsn)
MOTOS = "6, 7, 8"

def show(title, query):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")
    try:
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)
            pd.set_option('display.max_columns', 30)
            pd.set_option('display.width', 250)
            pd.set_option('display.max_colwidth', 40)
            if df.empty:
                print("  (sin resultados)")
            else:
                print(df.to_string(index=False))
    except Exception as e:
        err = str(e).split('\n')[0][:200]
        print(f"  ERROR: {err}")

# ── servicio_ventas para Honda Motos ──
show("1. servicio_ventas: agencias distintas (ALL)",
     """SELECT marca_unidad_id, COUNT(*) as registros,
               MIN(fecha_factura) as min_fecha, MAX(fecha_factura) as max_fecha
        FROM servicio_ventas
        GROUP BY marca_unidad_id ORDER BY marca_unidad_id""")

show("2. os_proceso: agencias distintas (ALL)",
     """SELECT marca_unidad_id, COUNT(*) as registros,
               MIN(fecha_apertura) as min_fecha, MAX(fecha_apertura) as max_fecha
        FROM os_proceso
        GROUP BY marca_unidad_id ORDER BY marca_unidad_id""")

show("3. dealer_profile_valor: agencias distintas (ALL)",
     """SELECT marca_unidad_id, COUNT(*) as registros,
               MIN(CONCAT(anio,'-',LPAD(mes,2,'0'))) as min_periodo,
               MAX(CONCAT(anio,'-',LPAD(mes,2,'0'))) as max_periodo
        FROM dealer_profile_valor
        GROUP BY marca_unidad_id ORDER BY marca_unidad_id""")

# ── refacciones_inventario para Honda Motos ──
show("4. DESCRIBE refacciones_inventario", "DESCRIBE refacciones_inventario")

show("4b. refacciones_inventario: agencias (ALL)",
     """SELECT marca_unidad_id, COUNT(*) as registros,
               MIN(registro) as min_fecha, MAX(registro) as max_fecha
        FROM refacciones_inventario
        GROUP BY marca_unidad_id ORDER BY marca_unidad_id""")

# ── resumen_gerencial_valor para Honda Motos ──
show("5. resumen_gerencial_valor: Honda Motos (6,7,8)",
     f"""SELECT rgv.marca_unidad_id, COUNT(*) as registros,
                MIN(CONCAT(rgv.anio,'-',LPAD(rgv.mes,2,'0'))) as min_periodo,
                MAX(CONCAT(rgv.anio,'-',LPAD(rgv.mes,2,'0'))) as max_periodo
         FROM resumen_gerencial_valor rgv
         WHERE rgv.marca_unidad_id IN ({MOTOS})
         GROUP BY rgv.marca_unidad_id""")

show("5b. resumen_gerencial_valor: SAMPLE moto TJ (id=6), latest",
     """SELECT rgv.marca_unidad_id, rgv.anio, rgv.mes,
               rg.nombre as indicador, rgs.nombre as seccion,
               rgv.valor, rgv.sub_valor
        FROM resumen_gerencial_valor rgv
        JOIN resumen_gerencial rg ON rgv.resumen_gerencial_id = rg.id
        JOIN resumen_gerencial_seccion rgs ON rg.resumen_gerencial_seccion_id = rgs.id
        WHERE rgv.marca_unidad_id = 6
        ORDER BY rgv.anio DESC, rgv.mes DESC
        LIMIT 40""")

# ── inventario_nuevos para Honda Motos ──
show("6. inventario_nuevos: Honda Motos (6,7,8)",
     f"""SELECT marca_unidad_id, COUNT(*) as registros,
                MIN(registro) as min_fecha, MAX(registro) as max_fecha
         FROM inventario_nuevos
         WHERE marca_unidad_id IN ({MOTOS})
         GROUP BY marca_unidad_id""")

show("6b. inventario_nuevos SAMPLE moto TJ (latest 5)",
     """SELECT vin, marca, modelo, version, estatus, fecha_compra, registro
        FROM inventario_nuevos
        WHERE marca_unidad_id = 6
        ORDER BY registro DESC LIMIT 5""")

# ── ventas_autos_nuevos para Honda Motos ──
show("7. ventas_autos_nuevos: Honda Motos (6,7,8)",
     f"""SELECT marca_unidad_id, COUNT(*) as registros,
                MIN(fecha_factura) as min_fecha, MAX(fecha_factura) as max_fecha
         FROM ventas_autos_nuevos
         WHERE marca_unidad_id IN ({MOTOS})
         GROUP BY marca_unidad_id""")

show("7b. ventas_autos_nuevos SAMPLE moto TJ (latest 5)",
     """SELECT fecha_factura, factura, vin, marca, modelo,
               tipo_venta, venta_total, nombre_vendedor, nombre_cliente
        FROM ventas_autos_nuevos
        WHERE marca_unidad_id = 6
        ORDER BY fecha_factura DESC LIMIT 5""")

# ── sicofi.balanza_ppto para Honda Motos ──
show("8. sicofi.balanza_ppto Honda Motos: secciones/ramas",
     """SELECT seccion, rama, tipo, COUNT(*) as registros,
               MIN(CONCAT(anio_ejercicio,'-',LPAD(mes,2,'0'))) as min_periodo,
               MAX(CONCAT(anio_ejercicio,'-',LPAD(mes,2,'0'))) as max_periodo
        FROM sicofi.balanza_ppto
        WHERE marca = 'HONDA MOTOS'
        GROUP BY seccion, rama, tipo
        ORDER BY seccion, rama, tipo""")

# ── sicofi.catalogo_balanza Honda Motos ──
show("9. sicofi.catalogo_balanza Honda Motos: secciones/ramas",
     """SELECT seccion, rama, tipo, COUNT(*) as registros
        FROM sicofi.catalogo_balanza
        WHERE marca = 'HONDA MOTOS'
        GROUP BY seccion, rama, tipo
        ORDER BY seccion, rama, tipo""")

# ── Resumen: ¿qué hay para Honda Motos? ──
print("\n\n" + "="*70)
print("  RESUMEN: Datos disponibles para Honda Motos (marca_unidad_id 6,7,8)")
print("="*70)
print("""
TABLA                        | IDs Motos | Notas
-----------------------------|-----------|----------------------------
refacciones_inventario       | 6, 7, 8   | Inventario de refacciones
resumen_gerencial_valor      | 6, 7, 8   | KPIs gerenciales (ventas, postventa)
inventario_nuevos            | 6, 7, 8   | Inventario motos nuevas
inventario_usados            | 6         | Solo TJ
ventas_autos_nuevos          | 6, 7, 8   | Ventas de motos nuevas
ventas_autos_usados          | 6         | Solo TJ, 15 registros
cuentas_por_cobrar           | 6, 8      | CxC desde Intelisis
cuentas_por_pagar            | 6, 8      | CxP desde Intelisis
sicofi.cxc_intelisis         | suc 1,2,3 | CXC vencidas (ya extraído)
sicofi.balanza_ppto          | marca HM  | Presupuestos
sicofi.catalogo_balanza      | marca HM  | Catálogo cuentas contables
servicio_ventas              | ???       | Pendiente verificar
os_proceso                   | ???       | Pendiente verificar
dealer_profile_valor         | ???       | Pendiente verificar
""")

print("FIN")
