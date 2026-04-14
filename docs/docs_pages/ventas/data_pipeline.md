# Ventas — Data Pipeline

Trazabilidad del pipeline que alimenta la página `/ventas`: desde `hmcrm` (MySQL) hasta las tablas/vistas del DWH PostgreSQL que consume `ventas_service.py`.

- **DDLs:** `data-pipeline/ddl/001_schema_base.sql`, `002_honda_motos.sql`, `003_honda_motos_all_facts.sql`
- **ETL scripts:** `data-pipeline/etl/scripts/etl_ventas.py`, `etl_plan_ventas.py`, `etl_flujos_piso.py`
- **Extract SQL:** `data-pipeline/etl/extract/ventas/`
- **Orquestación:** `data-pipeline/cron_etl.sh` + `data-pipeline/refresh_vistas.py`

---

## 1. Vista general del linaje

```
MySQL hmcrm                                    PostgreSQL DWH                     Backend Ventas
───────────                                    ──────────────                     ──────────────
vw_ventas_totales ─▶ etl_ventas.py         ─▶ fact_ventas       ──┬──▶ mv_kpis_mensual ──▶ /resumen
                                                                  │
plan_venta +      ─▶ etl_plan_ventas.py    ─▶ fact_plan          ─┤               ────────▶ /tendencia
modelos_plan_venta                                                │                          /cumplimiento-pacing
                                                                  │                          /por-modelo
                                                                  │                          /detalle
contacto +        ─▶ etl_flujos_piso.py    ─▶ fact_flujos_piso   ─┴────────────────────────▶ /flujos
bitacora + huser
                                              dim_sucursales (seed)
                                              dim_tiempo (generate_series)
```

La página de Ventas toca **3 facts + 2 dims + 1 MV** del DWH.

---

## 2. Tablas del DWH

### 2.1 `dwh.fact_ventas` — DDL `001_schema_base.sql:78-88` (+ alter en `002:19-20`)

```sql
CREATE TABLE dwh.fact_ventas (
  id              SERIAL PRIMARY KEY,
  id_oportunidad  VARCHAR(50) UNIQUE,       -- = VIN, conflict key
  fecha           DATE NOT NULL REFERENCES dwh.dim_tiempo(fecha),
  id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
  id_vendedor     INTEGER REFERENCES dwh.dim_vendedores(id_vendedor),
  monto           NUMERIC(14,2) DEFAULT 0,  -- SIEMPRE 0, no hay dato en source
  es_nuevo        BOOLEAN DEFAULT TRUE,
  modelo          VARCHAR(150)
);
ALTER TABLE dwh.fact_ventas ADD COLUMN venta_contado BOOLEAN DEFAULT FALSE;  -- 002:20
```

**Índices:**
- `idx_fact_ventas_fecha` (`001:120`)
- `idx_fact_ventas_sucursal` (`001:121`)
- `idx_fact_ventas_vendedor` (`001:122`)
- `idx_fact_ventas_modelo` (`002:46`)

**Carga:** UPSERT `ON CONFLICT (id_oportunidad) DO UPDATE` — ver `etl_ventas.py:77-85`.

### 2.2 `dwh.fact_plan` — DDL `001:105-114` (+ alter en `002:23-32`)

```sql
CREATE TABLE dwh.fact_plan (
  id          SERIAL PRIMARY KEY,
  anio_mes    VARCHAR(7) NOT NULL,
  id_sucursal INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
  plan_ventas INTEGER NOT NULL DEFAULT 0,
  modelo      VARCHAR(150),                  -- agregada en 002
  UNIQUE (anio_mes, id_sucursal, modelo)     -- conflict key
);
```

**Índices:**
- `idx_fact_plan_anio_mes` (`001:125`)
- `idx_fact_plan_modelo` (`002:47`)

**Carga:** UPSERT sobre `(anio_mes, id_sucursal, modelo)` — `etl_plan_ventas.py:46-62`.

### 2.3 `dwh.fact_flujos_piso` — DDL `003_honda_motos_all_facts.sql:10-19`

```sql
CREATE TABLE dwh.fact_flujos_piso (
  id          SERIAL PRIMARY KEY,
  fecha       DATE NOT NULL,
  id_sucursal INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
  freshup     INTEGER DEFAULT 0,
  internet    INTEGER DEFAULT 0,
  UNIQUE (fecha, id_sucursal)
);
```

**Índice:** `idx_fact_flujos_fecha` (`003:19`). **Carga:** UPSERT sobre `(fecha, id_sucursal)`.

### 2.4 `dwh.dim_sucursales` — DDL `001:53-62` (+ seed `002:12-16`)

```sql
INSERT INTO dwh.dim_sucursales (id_sucursal, nombre, ciudad, marca, activa) VALUES
  (6, 'Honda Motos Tijuana',  'Tijuana',  'Honda Motos', TRUE),
  (8, 'Honda Motos Mexicali', 'Mexicali', 'Honda Motos', TRUE);
```

> Ensenada (id=7) **no** se siembra — está cerrada y excluida de todo el sistema (`CLAUDE.md:8`).

### 2.5 `dwh.dim_tiempo` — DDL `001:24-51`

Tabla calendario `fecha PK` con `anio, mes, dia, trimestre, semana_iso, dia_semana, anio_mes, es_fin_mes`. Sembrada con `generate_series('2020-01-01','2030-12-31', '1 day')`.

### 2.6 `dwh.mv_kpis_mensual` — DDL `001:132-192`

```sql
CREATE MATERIALIZED VIEW dwh.mv_kpis_mensual AS
WITH ventas_agg AS (
  SELECT dt.anio_mes, fv.id_sucursal,
         COUNT(*)                                   AS total_ventas,
         COUNT(*) FILTER (WHERE fv.es_nuevo = TRUE) AS ventas_nuevos,
         COUNT(*) FILTER (WHERE fv.es_nuevo = FALSE) AS ventas_seminuevos,
         SUM(fv.monto)                              AS monto_total
  FROM dwh.fact_ventas fv
  JOIN dwh.dim_tiempo  dt ON dt.fecha = fv.fecha
  GROUP BY dt.anio_mes, fv.id_sucursal
),
plan_agg AS (
  SELECT anio_mes, id_sucursal, SUM(plan_ventas) AS meta
  FROM dwh.fact_plan
  GROUP BY anio_mes, id_sucursal
)
SELECT v.anio_mes, v.id_sucursal, s.nombre AS sucursal, s.marca,
       v.total_ventas, v.ventas_nuevos, v.ventas_seminuevos, v.monto_total,
       COALESCE(p.meta, 0) AS meta,
       CASE WHEN COALESCE(p.meta,0) = 0 THEN NULL
            ELSE ROUND(v.total_ventas * 100.0 / p.meta, 1) END       AS pct_cumplimiento,
       CASE WHEN COALESCE(v_ant.total_ventas,0) = 0 THEN NULL
            ELSE ROUND((v.total_ventas - v_ant.total_ventas) * 100.0
                       / v_ant.total_ventas, 1) END                   AS var_pct_yoy
FROM ventas_agg v
JOIN dwh.dim_sucursales s ON s.id_sucursal = v.id_sucursal
LEFT JOIN plan_agg  p    ON p.anio_mes = v.anio_mes AND p.id_sucursal = v.id_sucursal
LEFT JOIN ventas_agg v_ant ON v_ant.id_sucursal = v.id_sucursal
  AND v_ant.anio_mes = TO_CHAR(TO_DATE(v.anio_mes,'YYYY-MM') - INTERVAL '1 year','YYYY-MM')
WITH NO DATA;
```

**Índice único:** `idx_mv_kpis_mensual_pk (id_sucursal, anio_mes)` (`001:188-189`) — habilita `REFRESH CONCURRENTLY` en el futuro, aunque hoy se refresca de forma no concurrente.

> `monto_total` es siempre 0 (ver §4). No interpretarlo en el frontend.

---

## 3. ETL por tabla

### 3.1 `etl_ventas.py` → `fact_ventas`

**Archivo:** `data-pipeline/etl/scripts/etl_ventas.py`
**Extract:** `data-pipeline/etl/extract/ventas/extract_ventas.sql`
**Fuente:** `hmcrm.vw_ventas_totales`

**CLI:**
```bash
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py            # incremental 90 días
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py --full     # desde FECHA_INICIO_HISTORICA (2024-01-01)
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py --dias 180 # ventana custom
```

Configuración (env, `etl_ventas.py:39-42`):

- `SUCURSALES_PERMITIDAS=6,8`
- `FECHA_INICIO_HISTORICA=2024-01-01`
- `DIAS_VENTANA=90`
- `ETL_NAME=ventas`

**Extract SQL clave (`extract_ventas.sql`):**

```sql
SELECT
  dat_fecha_facturacion AS fecha,
  CASE WHEN hus_ciudad LIKE '%Mexicali%' THEN 8 ELSE 6 END AS mui,
  'Nuevo' AS tipo_auto,
  CASE
    WHEN data_modelo LIKE 'GL150 CARGO' OR data_modelo LIKE 'CARGO GL150' THEN 'CARGO GL150'
    WHEN data_modelo LIKE '%DIO%' OR data_modelo LIKE '%navi%'
      OR data_modelo LIKE '%Wave%' OR data_modelo LIKE '%CGL%125%TOOL%'
      THEN REPLACE(REGEXP_REPLACE(data_modelo,
             '\\b(moto |motocicleta |honda |2024 |2025 |2026 |)\\b', ''), ' ', '')
    ELSE REGEXP_REPLACE(data_modelo,
             '\\b(moto |motocicleta |honda |2024 |2025 |2026 |)\\b', '')
  END AS modelo,
  data_vin AS vin,
  CASE WHEN dats_compra = 'CONTADO' THEN 1 ELSE 0 END AS venta_contado
FROM hmcrm.vw_ventas_totales
WHERE datco_snuevo = 'si'
  AND hus_ciudad IN ('Tijuana','Mexicali')
  AND dat_fecha_facturacion >= '{{ fecha_inicio }}'
ORDER BY dat_fecha_facturacion;
```

**Filtros clave:**
- Solo motos nuevas (`datco_snuevo = 'si'`).
- Solo Tijuana/Mexicali — **Tecate** (191 registros espurios en hmcrm) y **Ensenada** quedan fuera aquí.
- Ventana parametrizada `{{ fecha_inicio }}` (inyectada por `inject_params()`).

**Mapeos:**
- `mui`: `Mexicali → 8`, resto → `6`.
- `modelo`: normalización agresiva (quita `moto`, `motocicleta`, `honda`, años `2024/2025/2026`). Casos especiales: `CARGO GL150`, `DIO`, `navi`, `Wave`, `CGL125TOOL` pegan la palabra sin espacios.
- `venta_contado`: `dats_compra = 'CONTADO'`.

**Transformaciones en Python (`etl_ventas.py:108-129`):**

1. **Dedup por VIN** (`:111-115`):
   ```python
   df.sort_values("fecha", ascending=False, inplace=True)
   df.drop_duplicates(subset=["vin"], keep="first", inplace=True)
   ```
   Racional: una moto cancelada + re-vendida = 1 venta (la más reciente).
2. `id_oportunidad = VIN`.
3. `id_sucursal = mui.astype(int)`.
4. `es_nuevo = True`, `monto = 0` (hardcoded — no hay dato en fuente).
5. `venta_contado.astype(bool)`, `modelo.str.strip()`.
6. Proyección final de 7 columnas.

**Load (`etl_ventas.py:70-86`):** UPSERT con `ON CONFLICT (id_oportunidad) DO UPDATE SET ...` (todas las columnas menos `id_oportunidad`).

**Tracking:** actualiza `dwh.etl_last_run` con `etl_name='ventas'` al terminar (`:148-155`).

### 3.2 `etl_plan_ventas.py` → `fact_plan`

**Archivo:** `data-pipeline/etl/scripts/etl_plan_ventas.py`
**Extract:** `data-pipeline/etl/extract/ventas/extract_plan_ventas.sql`
**Fuente:** `hmcrm.plan_venta pv LEFT JOIN hmcrm.modelos_plan_venta mpv ON mpv.mopv_ID = pv.plv_ID_modelo`

**CLI:** sin flags (siempre full load del año actual + anterior).

**Extract SQL clave:**

```sql
SELECT
  CASE WHEN plv_id_agencia = 1 THEN 6
       WHEN plv_id_agencia = 2 THEN 8 END AS Sucursal,
  plv_anio AS Anio,
  plv_ene AS `1`, plv_feb AS `2`, ... plv_dic AS `12`,
  CASE ... END AS Modelo
FROM hmcrm.plan_venta pv
LEFT JOIN hmcrm.modelos_plan_venta mpv ON ...
WHERE plv_anio IN (YEAR(CURRENT_DATE()), YEAR(CURRENT_DATE())-1)
  AND plv_id_agencia IN (1, 2);
```

**Mapeos:**
- `plv_id_agencia: 1 → 6` (Tijuana), `2 → 8` (Mexicali).
- Año actual y anterior.
- Normalización de modelo idéntica a `extract_ventas.sql`.

**Transformaciones en Python (`etl_plan_ventas.py:82-114`):**

1. **Unpivot** de 12 columnas mensuales a filas con `melt()`.
2. `anio_mes = f"{Anio}-{mes:02d}"`.
3. `plan_ventas` a int; `modelo.strip()`.
4. **Filtro `plan_ventas > 0`** — evita matriz esparsa (`:106-107`).
5. `drop_duplicates(['anio_mes','id_sucursal','modelo'])` (`:114`).

**Load:** UPSERT sobre constraint `fact_plan_anio_mes_suc_modelo_key`; solo actualiza `plan_ventas` al conflictar (las columnas del business key son invariantes).

### 3.3 `etl_flujos_piso.py` → `fact_flujos_piso`

**Archivo:** `data-pipeline/etl/scripts/etl_flujos_piso.py`
**Extract:** `data-pipeline/etl/extract/ventas/extract_flujos_piso.sql`
**Fuente:** `hmcrm.contacto + bitacora + huser`

**CLI:** sin flags.

**Extract SQL:**

```sql
SELECT bit_fecha AS fecha,
       CASE WHEN hus_ciudad = 'Mexicali' THEN 8 ELSE 6 END AS Mui,
       COUNT(CASE WHEN fuente_fue_IDfuente = 1 THEN 1 END) AS FreshUp,
       COUNT(CASE WHEN fuente_fue_IDfuente = 4 THEN 1 END) AS Internet
FROM hmcrm.contacto
INNER JOIN hmcrm.bitacora bit ON bit.bit_IDbitacora = (
  SELECT bit_IDbitacora FROM hmcrm.bitacora
  WHERE contacto_con_IDcontacto = contacto.con_IDcontacto
  ORDER BY bit_IDbitacora ASC LIMIT 1
)
INNER JOIN hmcrm.huser
  ON huser_hus_IDhuser = hus_IDhuser
 AND hus_tipo = 1
 AND hus_ciudad IN ('Tijuana','Mexicali')
WHERE con_status NOT IN ('eliminado','baseDatos')
  AND YEAR(bit_fecha) - YEAR(CURRENT_DATE()) IN (-1, 0)
GROUP BY fecha, mui
ORDER BY mui, fecha DESC;
```

**Puntos clave:**
- Se enlaza al **primer** `bitacora` por contacto (fuente original del lead).
- `fuente_fue_IDfuente`: `1 = FreshUp` (walk-in), `4 = Internet`.
- Excluye contactos `eliminado` y `baseDatos`.
- Año actual + anterior.

**Transformaciones en Python (`etl_flujos_piso.py:40-44`):** lowercase columnas, rename `mui → id_sucursal`, casts a int, `fillna(0)`.

**Load:** UPSERT sobre `(fecha, id_sucursal)` (constraint `fact_flujos_piso_fecha_id_sucursal_key`). Solo actualiza `freshup` e `internet`.

---

## 4. Calidad de datos y alertas relevantes

| Tema | Detalle | Mitigación |
|---|---|---|
| **`fact_ventas.monto` siempre 0** | No viene en `hmcrm.vw_ventas_totales` | La página de Ventas solo usa **unidades**. `mv_kpis_mensual.monto_total` se ignora. |
| **Tecate (191 filas)** | Registros espurios en hmcrm — agencia distinta | Filtrados en `extract_ventas.sql` con `hus_ciudad IN ('Tijuana','Mexicali')`. |
| **Ensenada (mui 7)** | Cerrada; no debe aparecer jamás | No está sembrada en `dim_sucursales`; los extracts tampoco la incluyen. |
| **VIN duplicado** | Moto cancelada + re-vendida → 2 filas en fuente | Dedup por VIN keep-first (más reciente) en `etl_ventas.py:111-115`. |
| **Modelo ruidoso** | Strings tipo "moto honda 2025 CARGO GL150" | Normalización en SQL + `.str.strip()` en Python. Casos especiales (CARGO GL150, DIO, navi, Wave, CGL125TOOL) pegan sin espacios. |
| **Plan con ceros** | Algunos modelos tienen plan=0 en meses sin target | Filtro `plan_ventas > 0` en `etl_plan_ventas.py:106-107` — evita guardar filas vacías. |
| **`vw_ventas_totales` define "nuevo"** | `datco_snuevo='si'` — el ETL solo carga motos nuevas | `fact_ventas.es_nuevo = TRUE` hardcoded en etl. Semi-nuevos no llegan al DWH. |
| **Inyección de parámetros** | `{{ fecha_inicio }}` en extract SQL | Resuelto por `inject_params()` en `etl/utils.py` con bindings SQLAlchemy seguros. |

Hay un script adicional `data-pipeline/scripts/audit_integridad.py` que revisa Tecate/Ensenada, mapeos de sucursal y reconciliación hmcrm → DWH.

---

## 5. Orquestación y refresh

### 5.1 `cron_etl.sh` — bloque `main`

Archivo `data-pipeline/cron_etl.sh`, función `run_main()` (`:64-72`):

```bash
run_etl "Ventas"      "data-pipeline/etl/scripts/etl_ventas.py"
run_etl "Plan Ventas" "data-pipeline/etl/scripts/etl_plan_ventas.py"
run_etl "Flujos Piso" "data-pipeline/etl/scripts/etl_flujos_piso.py"
run_etl "Inventario"  "data-pipeline/etl/scripts/etl_inventario.py"
run_refresh
```

Usa `flock /tmp/etl_main.lock` para evitar solapamientos.

- **Cadencia actual** (`CLAUDE.md:43`): cada 2 horas, ventana 6am-8pm (`:15/:20`).
- Logs en `data-pipeline/logs/etl_main_YYYYMMDD_HHMMSS.log`, retención 30 días.
- Si un ETL falla, se loguea pero el bloque continúa.

### 5.2 `refresh_vistas.py`

`data-pipeline/refresh_vistas.py:22-37`:

```python
VIEWS = [
    "dwh.mv_kpis_mensual",           # ← usada por /ventas/resumen
    "dwh.mv_cumplimiento_ventas",
    "dwh.mv_aging_inventario",
]
for view in VIEWS:
    conn.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
```

Se ejecuta al final de los dos bloques del cron (`main` y `secondary`). Refresh **no concurrente** — bloquea lecturas durante el refresh, pero es corto. El índice único ya existe si más adelante se quiere mover a `REFRESH CONCURRENTLY`.

### 5.3 `dwh.etl_last_run`

Tabla de tracking (`002_honda_motos.sql:35-43`):

```sql
CREATE TABLE dwh.etl_last_run (
  etl_name    VARCHAR(100) PRIMARY KEY,
  last_run_at TIMESTAMPTZ DEFAULT NOW()
);
```

Cada ETL de ventas actualiza su fila al terminar (`etl_ventas.py:148-155`, `etl_plan_ventas.py:135-142`, `etl_flujos_piso.py:49-51`). Útil para mostrar "última actualización" en el frontend o para monitoreo.

---

## 6. Cheatsheet de comandos

```bash
# Desde la raíz del proyecto
source venv/bin/activate

# ETL
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py           # 90 días
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py --full    # desde 2024-01-01
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_plan_ventas.py
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_flujos_piso.py

# Refresh de la MV
PYTHONPATH=data-pipeline python data-pipeline/refresh_vistas.py

# Orquestado
./data-pipeline/cron_etl.sh main

# Monitoreo rápido
tail -50 data-pipeline/logs/etl_main_*.log | grep -E "Ventas|Plan|Flujos"
```

---

## 7. Resumen de tablas

| DWH object | Columnas usadas por Ventas | Fuente | ETL | Conflict key | Pattern |
|---|---|---|---|---|---|
| `fact_ventas` | `id_oportunidad`, `fecha`, `id_sucursal`, `modelo`, `venta_contado`, `es_nuevo` | `hmcrm.vw_ventas_totales` | `etl_ventas.py` | `id_oportunidad` (=VIN) | UPSERT |
| `fact_plan` | `anio_mes`, `id_sucursal`, `plan_ventas` (agregado), `modelo` | `hmcrm.plan_venta + modelos_plan_venta` | `etl_plan_ventas.py` | `(anio_mes, id_sucursal, modelo)` | UPSERT |
| `fact_flujos_piso` | `fecha`, `id_sucursal`, `freshup`, `internet` | `hmcrm.contacto + bitacora + huser` | `etl_flujos_piso.py` | `(fecha, id_sucursal)` | UPSERT |
| `dim_sucursales` | `id_sucursal`, `nombre` | seed DDL | — | PK | Seed |
| `dim_tiempo` | FK para join de `mv_kpis_mensual` | `generate_series` | — | PK (`fecha`) | Seed |
| `mv_kpis_mensual` | todas | deriva de `fact_ventas + fact_plan + dim_tiempo + dim_sucursales` | `refresh_vistas.py` | (`id_sucursal`, `anio_mes`) índice | REFRESH |
