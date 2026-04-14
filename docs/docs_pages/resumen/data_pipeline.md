# Resumen Ejecutivo — Data Pipeline

Trazabilidad completa del data pipeline que alimenta la página Resumen Ejecutivo: desde las fuentes MySQL (hmcrm, sicofi, metrics) y un CSV manual, pasando por ETL Python, hasta las tablas/vistas materializadas del DWH PostgreSQL que consume el backend.

- **DDLs:** `data-pipeline/ddl/001_schema_base.sql` → `002_honda_motos.sql` → `003_honda_motos_all_facts.sql` → `004_refactor_financiero_postventa.sql`
- **ETL scripts:** `data-pipeline/etl/scripts/`
- **Extract SQL:** `data-pipeline/etl/extract/{ventas,postventa}/`
- **Orquestación:** `data-pipeline/cron_etl.sh` + `data-pipeline/refresh_vistas.py`

---

## 1. Vista general del linaje

```
MySQL sources                    PostgreSQL DWH (schema dwh)              Backend
─────────────                    ──────────────────────────              ───────
hmcrm ──▶ etl_ventas.py       ──▶ fact_ventas                   ─┐
hmcrm ──▶ etl_plan_ventas.py  ──▶ fact_plan                      ├──▶ mv_kpis_mensual ──▶ /ventas/resumen
                                                                 │                    ──▶ /ventas/cumplimiento-pacing
                                                                 └──▶ dim_sucursales
                                                                      dim_tiempo

sicofi ──┐
metrics ─┼▶ etl_postventa_financiero.py ──▶ fact_estado_resultados       ──▶ /financiero/financials
CSV ─────┘                                  fact_ppto_estado_resultados
                                            fact_postventa_kpis           ──▶ /postventa/summary
                                            fact_contable_servicio
                                            fact_ticket_promedio
```

Los 4 endpoints del resumen tocan, en total, **7 fact + 2 dim + 1 MV** del DWH.

---

## 2. Tablas del DWH usadas por el Resumen

### 2.1 Dimensiones (`001_schema_base.sql` + `002_honda_motos.sql`)

| Tabla | Columnas clave | Seed |
|---|---|---|
| `dwh.dim_sucursales` | `id_sucursal PK`, `nombre`, `ciudad`, `marca`, `activa` | `002_honda_motos.sql:13-16` — `(6,'Tijuana')`, `(8,'Mexicali')`; Ensenada (7) no existe |
| `dwh.dim_tiempo` | `fecha PK`, `anio`, `mes`, `anio_mes`, `trimestre`, `es_fin_mes` | `001_schema_base.sql:39-51` — `generate_series('2020-01-01','2030-12-31')` |

### 2.2 Facts

| Tabla | DDL | Conflict key | Patrón | Alimentada por |
|---|---|---|---|---|
| `fact_ventas` | `001_schema_base.sql:78-88` | `id_oportunidad` (UNIQUE, = VIN) | UPSERT | `etl_ventas.py` |
| `fact_plan` | `001/002` | `(anio_mes, id_sucursal, modelo)` | UPSERT | `etl_plan_ventas.py` |
| `fact_estado_resultados` | `004:23-34` | `(fecha, mui, seccion, rama, tipo)` | UPSERT | `etl_postventa_financiero.py` |
| `fact_ppto_estado_resultados` | `004:36-48` | `(fecha, mui, seccion, rama, tipo)` | UPSERT | `etl_postventa_financiero.py` |
| `fact_postventa_kpis` | `004:50-62` | `(fecha, mui)` | UPSERT | `etl_postventa_financiero.py` |
| `fact_contable_servicio` | `004:64-72` | `(fecha, mui, tipo)` | UPSERT | `etl_postventa_financiero.py` (carga `Ingreso` + `MO`) |
| `fact_ticket_promedio` | `004:74-80` | `(fecha, mui)` | UPSERT | `etl_postventa_financiero.py` (CSV manual) |

### 2.3 Vista materializada `dwh.mv_kpis_mensual`

Definida en `001_schema_base.sql:132-192`. Es la **única MV** que usa el Resumen (endpoint `/ventas/resumen`).

```sql
CREATE MATERIALIZED VIEW dwh.mv_kpis_mensual AS
WITH ventas_agg AS (
  SELECT dt.anio_mes, fv.id_sucursal,
         COUNT(*)                                    AS total_ventas,
         COUNT(*) FILTER (WHERE fv.es_nuevo = TRUE)  AS ventas_nuevos,
         SUM(fv.monto)                               AS monto_total
  FROM dwh.fact_ventas fv
  JOIN dwh.dim_tiempo  dt ON dt.fecha = fv.fecha
  GROUP BY dt.anio_mes, fv.id_sucursal
),
plan_agg AS (
  SELECT anio_mes, id_sucursal, SUM(plan_ventas) AS meta
  FROM dwh.fact_plan GROUP BY anio_mes, id_sucursal
)
SELECT v.anio_mes, v.id_sucursal, s.nombre AS sucursal, s.marca,
       v.total_ventas, v.ventas_nuevos, v.monto_total,
       COALESCE(p.meta, 0) AS meta,
       CASE WHEN p.meta = 0 THEN NULL
            ELSE ROUND(v.total_ventas * 100.0 / p.meta, 1) END AS pct_cumplimiento,
       CASE WHEN v_ant.total_ventas IS NULL OR v_ant.total_ventas = 0 THEN NULL
            ELSE ROUND((v.total_ventas - v_ant.total_ventas) * 100.0
                       / v_ant.total_ventas, 1) END            AS var_pct_yoy
FROM ventas_agg v
JOIN dwh.dim_sucursales s  ON s.id_sucursal = v.id_sucursal
LEFT JOIN plan_agg p       ON p.anio_mes = v.anio_mes AND p.id_sucursal = v.id_sucursal
LEFT JOIN ventas_agg v_ant ON v_ant.id_sucursal = v.id_sucursal
  AND v_ant.anio_mes = TO_CHAR(TO_DATE(v.anio_mes,'YYYY-MM') - INTERVAL '1 year','YYYY-MM');
```

Índice `idx_mv_kpis_mensual_pk` en `(id_sucursal, anio_mes)` para permitir `REFRESH CONCURRENTLY` en el futuro.

> `mv_cumplimiento_ventas` y `mv_aging_inventario` existen (`003_honda_motos_all_facts.sql`) pero **el Resumen no las consume**.

---

## 3. ETL por tabla

### 3.1 `etl_ventas.py` → `fact_ventas`

**Archivo:** `data-pipeline/etl/scripts/etl_ventas.py`
**Extract:** `data-pipeline/etl/extract/ventas/extract_ventas.sql`
**Fuente:** `hmcrm.vw_ventas_totales`

**CLI:**
```bash
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py            # incremental 90 días
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py --full     # desde FECHA_INICIO
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py --dias 180 # ventana custom
```

**Filtros clave del extract (`extract_ventas.sql`):**
- `datco_snuevo = 'si'` — solo motos nuevas.
- `hus_ciudad IN ('Tijuana','Mexicali')` — **excluye Tecate (191 registros espurios) y Ensenada**.
- Ventana parametrizada `dat_fecha_facturacion >= :fecha_inicio`.

**Transformaciones:**
- `id_sucursal = CASE WHEN hus_ciudad LIKE '%Mexicali%' THEN 8 ELSE 6 END`.
- `id_oportunidad = VIN`.
- Modelo normalizado con CASE/REGEXP (quita "moto", "honda", años, casos especiales CARGO/DIO/navi/Wave/CGL125TOOL).
- `venta_contado = (dats_compra = 'CONTADO')`.
- **Dedup por VIN** en Python (`etl_ventas.py:111-115`): `sort_values('fecha', ascending=False).drop_duplicates('VIN', keep='first')`. Si una moto se cancela y se re-vende, cuenta como 1 venta, la más reciente.

**Load:** `ON CONFLICT (id_oportunidad) DO UPDATE` (`etl_ventas.py:82-85`).

**Nota:** `fact_ventas.monto` **siempre es 0** — el campo no está disponible en hmcrm. El Resumen solo usa conteos.

### 3.2 `etl_plan_ventas.py` → `fact_plan`

**Extract:** `data-pipeline/etl/extract/ventas/extract_plan_ventas.sql`
**Fuente:** `hmcrm.plan_venta` + `hmcrm.modelos_plan_venta`

**Filtros:**
- `plv_anio IN (YEAR(CURRENT_DATE()), YEAR(CURRENT_DATE())-1)` — año actual y anterior.
- `plv_id_agencia IN (1, 2)` — solo Honda Motos. **Mapeo:** `1→6` (TJ), `2→8` (MX).

**Transformaciones:**
- Unpivot de 12 columnas mensuales (`plv_ene` … `plv_dic`) a filas con `melt()` (`etl_plan_ventas.py:85-99`).
- Construye `anio_mes = YYYY-MM`.
- Filtra filas con `plan_ventas = 0` (evita matriz esparsa, `etl_plan_ventas.py:107`).

**Load:** `ON CONFLICT (anio_mes, id_sucursal, modelo) DO UPDATE`.

### 3.3 `etl_postventa_financiero.py` — orquestador unificado

**Archivo:** `data-pipeline/etl/scripts/etl_postventa_financiero.py` (366 líneas)
**CLI:**
```bash
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_postventa_financiero.py         # incremental
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_postventa_financiero.py --full  # 6 meses
```

Orquesta 6 cargas secuenciales (`etl_postventa_financiero.py:310-361`):

#### (a) `cargar_estado_resultados()` (`:83-112`) → `fact_estado_resultados`
- **Extract:** `extract_estado_resultados.sql`
- **Fuente:** `sicofi.catalogo_balanza cb JOIN sicofi.balanza b ON cb.cuenta = b.cuenta`
- **Filtros clave:**
  - `cb.marca = 'HONDA MOTOS'` (catálogo)
  - `b.marca = 'HONDA'` (¡ojo! **lado transaccional usa 'HONDA', no 'HONDA MOTOS'**).
  - `b.terminacion IN (4, 6)` — term 5 (Ensenada) excluida.
  - `cb.seccion IN ('INGRESOS','COSTOS','GASTOS')`
  - Ventana rolling 6 meses.
  - `HAVING SUM(b.abono - b.cargo) != 0`
- **Mapeo `mui`:** `4→6` Tijuana, `6→8` Mexicali.
- **`monto = SUM(abono - cargo)`** (contabilidad de doble entrada).

#### (b) `cargar_ppto_estado_resultados()` (`:119-148`) → `fact_ppto_estado_resultados`
- **Extract:** `extract_ppto_estado_resultados.sql`
- **Fuente:** `sicofi.balanza_ppto`
- **Filtros:** `marca='HONDA MOTOS'`, `terminacion IN (1, 2)`, rolling 6 meses, `HAVING SUM(mensual) != 0`.
- **Mapeo `mui`:** `1→6`, `2→8`. **⚠ Diferente** del de reales (4/6).
- Usa `mensual`, no `acumulado` (acumulado siempre es 0 en fuente). Falta data de 2023.

#### (c) `cargar_kpis()` (`:155-185`) → `fact_postventa_kpis`
- **Extract:** `extract_kpis_postventa.sql`
- **Fuente:** `metrics.servicio_ventas`
- **Filtros:**
  - `marca_unidad_id IN (6, 8)`
  - `LEFT(factura, 3) IN ('smt','smm')` — **prefijo Honda Motos** (sin esto entra contaminación de Honda Autos).
  - `tipo_orden = 'Publico'`.
  - Rolling 24-27 meses.
- **Dedup:** RIGHT JOIN al máximo `id` por `(numero_ot, tipo_orden)`.
- Agrega `cantidad` (COUNT OTs), `horas_mo`, `venta_mo`, `venta_total_sin_iva`.
- Alertas de calidad conocidas (no bloqueantes): `telefono` 77% vacío, `numero_cliente` 52% vacío, `marca` incluye "NO HONDA"/"ITALIKA".

#### (d) `cargar_contable_servicio()` (`:192-220`) → `fact_contable_servicio` con `tipo='Ingreso'`
- **Extract:** `extract_contable_servicio.sql`
- **Fuente:** `sicofi.catalogo_balanza + balanza` filtrando `cb.rama='SERVICIO'`, `b.terminacion IN (4,6)`.

#### (e) `cargar_venta_mo()` (`:227-255`) → `fact_contable_servicio` con `tipo='MO'`
- **Extract:** `extract_venta_mo.sql` (mismas fuentes pero `cb.tipo='MO'`).

Ambas cargas comparten el constraint `(fecha, mui, tipo)`, así que conviven en la misma tabla.

#### (f) `cargar_ticket_promedio()` (`:262-303`) → `fact_ticket_promedio`
- **Fuente:** CSV manual `data-pipeline/etl/extract/postventa/ticket_promedio.csv`.
- Mapeo `Agencia → mui`: `'HONDA MOTOS TIJUANA'→6`, `'HONDA MOTOS MEXICALI'→8`.
- Construye `fecha = YYYY-MM-01`.

---

## 4. Orquestación (`cron_etl.sh` + `refresh_vistas.py`)

### 4.1 Cron (`data-pipeline/cron_etl.sh`)

Dos bloques con `flock` sobre `/tmp/etl_{main,secondary}.lock` para evitar concurrencia:

```bash
./data-pipeline/cron_etl.sh main       # ventas + plan + flujos + inventario + refresh MVs
./data-pipeline/cron_etl.sh secondary  # postventa/financiero + OS + refacciones + UIO + refresh MVs
```

**Cadencia actual (según `CLAUDE.md`):** cada 2 horas en `:15` / `:20`, ventana 6am-8pm. Logs con retención de 30 días en `data-pipeline/logs/`.

### 4.2 Refresh de MVs (`refresh_vistas.py`)

```python
REFRESH MATERIALIZED VIEW dwh.mv_kpis_mensual
REFRESH MATERIALIZED VIEW dwh.mv_cumplimiento_ventas
REFRESH MATERIALIZED VIEW dwh.mv_aging_inventario
```

Se ejecuta al final de ambos bloques del cron. Actualmente es `REFRESH` no concurrente.

### 4.3 Tracking

Tabla simple `dwh.etl_last_run (etl_name PK, last_run_at TIMESTAMPTZ)` — cada ETL actualiza su fila al terminar. Útil para validar frescura desde el backend o desde un dashboard de salud.

---

## 5. Filtros y mapeos críticos (cheat-sheet)

| Aspecto | Regla | Dónde vive |
|---|---|---|
| **Ciudades válidas** | `Tijuana`, `Mexicali`. Tecate y Ensenada excluidos. | `extract_ventas.sql` |
| **MUI hmcrm** | `Mexicali→8`, resto→`6` | `etl_ventas.py` |
| **Plan agencias hmcrm** | `plv_id_agencia: 1→6, 2→8` | `extract_plan_ventas.sql` |
| **Metrics servicio** | `marca_unidad_id IN (6,8)` + prefijo factura `SMT/SMM` + `tipo_orden='Publico'` | `extract_kpis_postventa.sql` |
| **Sicofi reales** | `cb.marca='HONDA MOTOS'` pero `b.marca='HONDA'`; `term 4→mui 6`, `term 6→mui 8` | `extract_estado_resultados.sql`, `extract_contable_servicio.sql`, `extract_venta_mo.sql` |
| **Sicofi presupuesto** | `marca='HONDA MOTOS'`, `term 1→mui 6`, `term 2→mui 8`. ⚠ mapping distinto del de reales | `extract_ppto_estado_resultados.sql` |
| **VIN dedup** | Por VIN, `sort fecha DESC`, keep first (más reciente) | `etl_ventas.py:111-115` |
| **Plan filter** | `plan_ventas > 0` | `etl_plan_ventas.py:107` |

---

## 6. Alertas de calidad de datos relevantes al Resumen

- **Tecate (191 registros en hmcrm):** excluidos en `extract_ventas.sql` con el filtro de ciudad.
- **VINs duplicados:** deduplicados en ETL; una venta cancelada + re-venta = 1 venta, la más reciente.
- **`fact_ventas.monto` siempre 0:** no disponible en hmcrm. El Resumen usa solo unidades — el `monto_total` de `mv_kpis_mensual` no debe interpretarse.
- **`sicofi.balanza_ppto`:** sin datos de 2023; `acumulado` siempre 0 (usar `mensual`).
- **`sicofi` reales bajo `marca='HONDA'`** con terminaciones 4/5/6, no bajo `'HONDA MOTOS'`. El catálogo sí usa `'HONDA MOTOS'` — el join hace el puente.
- **`metrics.servicio_ventas`:** `telefono` 77% vacío, `numero_cliente` 52% vacío, marca a veces "NO HONDA"/"ITALIKA". Estas columnas no las consume el Resumen.
- **`os_proceso.costo`:** 100% cero en fuente — no afecta al Resumen (no lo consulta), pero no intentar usarlo en ningún endpoint.
- **`refacciones_inventario.existencia`:** VARCHAR, requiere CAST — irrelevante para Resumen.

---

## 7. Auditoría (`data-pipeline/scripts/audit_integridad.py`)

Script de verificación de integridad que cubre:

1. Mapeos MUI en `metrics.servicio_ventas` (no cross-contaminación con Honda Autos).
2. Exclusión efectiva de Tecate y Ensenada en hmcrm.
3. Mapeos de terminaciones en sicofi balanza vs balanza_ppto (reales 4/6 vs ppto 1/2).
4. Reconciliación entre fuente MySQL y DWH para `fact_ventas`.
5. Detección de filas con monto cero fuera de lo esperado.

Útil antes de cualquier refactor de ETL o cuando una métrica del Resumen se ve rara.

---

## 8. Comandos útiles (cheat-sheet)

```bash
# Activar venv desde la raíz del proyecto
source venv/bin/activate

# ETL de ventas
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py --full
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_plan_ventas.py

# ETL postventa + financiero (unificado)
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_postventa_financiero.py --full

# Refresh manual de vistas materializadas
PYTHONPATH=data-pipeline python data-pipeline/refresh_vistas.py

# Orquestado por cron
./data-pipeline/cron_etl.sh main
./data-pipeline/cron_etl.sh secondary

# Audit
PYTHONPATH=data-pipeline python data-pipeline/scripts/audit_integridad.py
```
