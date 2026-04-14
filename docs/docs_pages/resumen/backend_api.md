# Resumen Ejecutivo — Backend API

Documentación de los endpoints FastAPI que alimentan la página Resumen Ejecutivo (`frontend/src/app/(dashboard)/page.tsx`). Los 4 endpoints se llaman en paralelo con el mismo par `(anio_mes, mui?)`.

- **Base path:** `/api/v1/`
- **Puerto dev:** `8001` (NUNCA 8000)
- **Routers:** `backend/app/api/router.py`
- **Dependency DB:** `get_db()` en `backend/app/core/database.py`

| # | Endpoint | Archivo endpoint | Servicio |
|---|---|---|---|
| 1 | `GET /ventas/resumen` | `backend/app/api/endpoints/ventas.py:9-11` | `ventas_service.get_resumen` |
| 2 | `GET /ventas/cumplimiento-pacing` | `backend/app/api/endpoints/ventas.py:29-31` | `ventas_service.get_cumplimiento_pacing` |
| 3 | `GET /financiero/financials` | `backend/app/api/endpoints/financiero.py:9-11` | `financiero_service.get_financials` |
| 4 | `GET /postventa/summary` | `backend/app/api/endpoints/postventa.py:9-11` | `postventa_service.get_summary` |

Parámetros comunes:

- `anio_mes: str | None` — formato `YYYY-MM`; default = mes actual.
- `mui: int | None` — `6` Tijuana, `8` Mexicali, `null` consolidado.

> Convención SQL crítica: en queries con `text()` usar **`CAST(:param AS type)`**, no `:param::type`, porque SQLAlchemy escapa el `::`.

---

## 1. `GET /api/v1/ventas/resumen`

**Servicio:** `backend/app/services/ventas_service.py:25-40`

### Query
Lee directamente de la vista materializada **`dwh.mv_kpis_mensual`**:

```sql
SELECT anio_mes, id_sucursal, sucursal,
       total_ventas, ventas_nuevos, monto_total,
       meta, pct_cumplimiento, var_pct_yoy
FROM dwh.mv_kpis_mensual
WHERE anio_mes = :anio_mes
  [ AND id_sucursal = CAST(:mui AS int) ]
ORDER BY id_sucursal;
```

Los filtros por marca Honda Motos y exclusión de Ensenada ya están "horneados" en el ETL; el servicio no los repite.

### Response
```ts
ResumenRow[] = [{
  anio_mes: string,
  id_sucursal: number,   // 6 | 8
  sucursal: string,
  total_ventas: number,
  ventas_nuevos: number,
  monto_total: number,   // siempre 0 — monto no disponible en hmcrm
  meta: number,
  pct_cumplimiento: number,  // (total_ventas / meta) * 100
  var_pct_yoy: number        // vs mismo mes del año anterior
}]
```

### Uso en el frontend
Se agregan `total_ventas` y `meta` por sucursal en `buildVM()` para formar `unidades`, `meta` y `pctCumplimiento`.

---

## 2. `GET /api/v1/ventas/cumplimiento-pacing`

**Servicio:** `backend/app/services/ventas_service.py:127-265`

Este endpoint es el más complejo: calcula **ventas al mismo día del mes** contra un **plan prorrateado** y saca variaciones contra el mes y año anterior usando el **mismo cutoff_day** en ambas ventanas comparativas.

### Lógica del cutoff (`ventas_service.py:134-145`)

```python
if (anio, mes) == (today.year, today.month):
    cutoff_day = min(today.day, dias_mes)
elif (anio, mes) > (today.year, today.month):
    cutoff_day = 0             # mes futuro
else:
    cutoff_day = dias_mes      # mes cerrado
```

### Query SQL (`ventas_service.py:152-206`)

```sql
WITH params AS (
  SELECT CAST(:mes_inicio AS date) AS mes_inicio,
         CAST(:cutoff_day AS int)  AS cutoff_day
),
ventas AS (
  SELECT fv.id_sucursal,
    COUNT(*) FILTER (
      WHERE p.cutoff_day > 0
        AND fv.fecha >= p.mes_inicio
        AND fv.fecha <  p.mes_inicio + (p.cutoff_day || ' days')::interval
    ) AS ventas_actual,
    COUNT(*) FILTER (
      WHERE fv.fecha >= (p.mes_inicio - INTERVAL '1 month')
        AND fv.fecha <  LEAST(
              p.mes_inicio,
              (p.mes_inicio - INTERVAL '1 month')
                + (p.cutoff_day || ' days')::interval)
    ) AS ventas_mes_ant,
    COUNT(*) FILTER (
      WHERE fv.fecha >= (p.mes_inicio - INTERVAL '1 year')
        AND fv.fecha <  LEAST(
              (p.mes_inicio - INTERVAL '1 year') + INTERVAL '1 month',
              (p.mes_inicio - INTERVAL '1 year')
                + (p.cutoff_day || ' days')::interval)
    ) AS ventas_anio_ant
  FROM dwh.fact_ventas fv, params p
  GROUP BY fv.id_sucursal
),
plan_s AS (
  SELECT id_sucursal, SUM(plan_ventas) AS total
  FROM dwh.fact_plan
  WHERE anio_mes = :anio_mes
  GROUP BY id_sucursal
)
SELECT s.id_sucursal AS mui, s.nombre AS sucursal,
       COALESCE(v.ventas_actual, 0)   AS ventas_actual,
       COALESCE(v.ventas_mes_ant, 0)  AS ventas_mes_anterior,
       COALESCE(v.ventas_anio_ant, 0) AS ventas_anio_anterior,
       COALESCE(p.total, 0)           AS plan_total
FROM dwh.dim_sucursales s
LEFT JOIN ventas  v ON v.id_sucursal = s.id_sucursal
LEFT JOIN plan_s  p ON p.id_sucursal = s.id_sucursal
WHERE s.activa = TRUE;
```

### Cálculos en Python (`ventas_service.py:217-257`)

```python
plan_prorrateado = round(plan_total * cutoff_day / dias_mes)
cumplimiento_pct = round((ventas_actual / plan_prorrateado) * 100) if plan_prorrateado else None
var_mes_pct      = round((ventas_actual / ventas_mes_ant  - 1) * 100, 1) if ventas_mes_ant  else None
var_anio_pct     = round((ventas_actual / ventas_anio_ant - 1) * 100, 1) if ventas_anio_ant else None
```

Los totales (`total`) son la suma de las filas por sucursal, no otra query.

### Response
```ts
{
  anio_mes: string,
  cutoff_day: number,
  dias_mes: number,
  total: PacingRow,        // consolidado Honda Motos
  sucursales: PacingRow[]  // [TJ, MX]
}

PacingRow = {
  mui: number | null,
  sucursal?: string,
  ventas_actual: number,
  plan_total: number,
  plan_prorrateado: number,
  cumplimiento_vs_plan_pct: number | null,
  ventas_mes_anterior: number,
  var_vs_mes_anterior_pct: number | null,
  ventas_anio_anterior: number,
  var_vs_anio_anterior_pct: number | null
}
```

### Uso en el frontend
Alimenta cada `SucursalCard`: barra "Ritmo vs plan", plan prorrateado y los dos `VarBadge` de arriba a la derecha.

---

## 3. `GET /api/v1/financiero/financials`

**Servicio:** `backend/app/services/financiero_service.py:22-158`

Agrega el Estado de Resultados real y presupuesto desde SICOFI para calcular UB, UO, absorción, gastos desglosados y YTD.

### CTEs principales (`financiero_service.py:27-92`)

```sql
WITH reales AS (
  SELECT mui,
    SUM(monto) FILTER (WHERE seccion IN ('INGRESOS','COSTOS'))            AS utilidad_bruta,
    SUM(monto) FILTER (WHERE seccion IN ('INGRESOS','COSTOS','GASTOS'))   AS utilidad_operacion,
    SUM(monto) FILTER (
      WHERE seccion IN ('INGRESOS','COSTOS')
        AND rama IN ('SERVICIO','BONIFICACION_SERVICIO')
    ) AS ub_postventa,
    ABS(SUM(monto) FILTER (WHERE seccion='GASTOS' AND rama='GASTO'))             AS gastos_fijos,
    ABS(SUM(monto) FILTER (WHERE seccion='GASTOS' AND rama='VARIABLES'))         AS gastos_variables,
    ABS(SUM(monto) FILTER (WHERE seccion='GASTOS' AND rama='GASTOS FINANCIEROS'))AS gastos_financieros,
    ABS(SUM(monto) FILTER (WHERE seccion='GASTOS' AND rama='OTROS GASTOS'))      AS gastos_otros,
    ABS(SUM(monto) FILTER (WHERE seccion='GASTOS' AND rama='GASTO'))
      + ABS(SUM(monto) FILTER (
          WHERE seccion='GASTOS' AND rama='VARIABLES'
            AND tipo='COMISIONES PERSONAL SERVICIO'))
      + ABS(SUM(monto) FILTER (WHERE seccion='GASTOS' AND rama='OTROS GASTOS'))
      AS gastos_absorcion
  FROM dwh.fact_estado_resultados
  WHERE fecha >= :mes_inicio AND fecha < :mes_fin
    [ AND mui = CAST(:mui AS int) ]
  GROUP BY mui
),
ppto AS (
  SELECT mui,
    SUM(monto) FILTER (WHERE seccion='INGRESOS')
      - SUM(monto) FILTER (WHERE seccion='COSTOS')                          AS ppto_utilidad_bruta,
    SUM(monto) FILTER (WHERE seccion='INGRESOS')
      - SUM(monto) FILTER (WHERE seccion='COSTOS')
      - SUM(monto) FILTER (WHERE seccion='GASTOS')                          AS ppto_utilidad_operacion
  FROM dwh.fact_ppto_estado_resultados
  WHERE fecha >= :mes_inicio AND fecha < :mes_fin
    [ AND mui = CAST(:mui AS int) ]
  GROUP BY mui
)
SELECT r.*, p.ppto_utilidad_bruta, p.ppto_utilidad_operacion,
       CASE WHEN r.gastos_absorcion > 0
            THEN ROUND((r.ub_postventa / r.gastos_absorcion) * 100, 2)
            ELSE NULL END AS absorcion_pct,
       s.nombre AS sucursal
FROM reales r
LEFT JOIN ppto p ON p.mui = r.mui
LEFT JOIN dwh.dim_sucursales s ON s.id_sucursal = r.mui;
```

### Fórmulas (resumen)

| Métrica | Definición |
|---|---|
| **Utilidad Bruta** | `SUM(monto)` con `seccion IN ('INGRESOS','COSTOS')` |
| **Utilidad Operación** | `SUM(monto)` con `seccion IN ('INGRESOS','COSTOS','GASTOS')` |
| **UB Postventa** | UB filtrando `rama IN ('SERVICIO','BONIFICACION_SERVICIO')` |
| **Gastos de Absorción** | `GASTO + (VARIABLES ∩ COMISIONES PERSONAL SERVICIO) + OTROS GASTOS` (valor absoluto) |
| **Tasa Absorción** | `UB_Postventa / Gastos_Absorción × 100` |
| **Presupuesto (balanza_ppto)** | Los montos son positivos → hay **resta explícita** Ingresos − Costos − Gastos |

### Cálculo YTD (`financiero_service.py:130-152`)

Segunda query sobre `fact_estado_resultados` con ventana `YYYY-01-01 → mes_fin`. Sus `ytd_ub` y `ytd_uo` se mergean por `mui` en las filas del payload principal.

### Response
```ts
{
  kpis: FinKPI[],        // usado por el Resumen
  edr_reales: Row[],     // detalle seccion/rama/tipo (usado por /financiero)
  edr_presupuesto: Row[]
}

FinKPI = {
  mui: number, sucursal: string,
  utilidad_bruta: number,
  utilidad_operacion: number,
  ub_postventa: number,
  gastos_fijos, gastos_variables, gastos_financieros, gastos_otros: number,
  absorcion_pct: number | null,
  ppto_utilidad_bruta: number,
  ppto_utilidad_operacion: number,
  ytd_ub: number,
  ytd_uo: number
}
```

### Uso en el frontend
Del payload solo consume `kpis`: UB, UO, absorción por tarjeta, y `ytd_ub / ytd_uo` para el footer "Acumulado 2026".

---

## 4. `GET /api/v1/postventa/summary`

**Servicio:** `backend/app/services/postventa_service.py:21-97`

Merge en Python de varias queries (más barato que un joinote) para no mezclar granularidades.

### 4.1 OTs + horas de MO (`postventa_service.py:27-42`)

```sql
SELECT k.mui, s.nombre AS sucursal,
       SUM(k.cantidad)           AS ots,
       ROUND(SUM(k.horas_mo), 2) AS horas_mo
FROM dwh.fact_postventa_kpis k
JOIN dwh.dim_sucursales s ON s.id_sucursal = k.mui
WHERE k.fecha >= :mes_inicio AND k.fecha < :mes_fin
  [ AND k.mui = CAST(:mui AS int) ]
GROUP BY k.mui, s.nombre;
```

### 4.2 Venta total y venta MO contable (`postventa_service.py:46-56`)

```sql
SELECT mui,
  SUM(monto) FILTER (WHERE tipo='Ingreso') AS venta_total,
  SUM(monto) FILTER (WHERE tipo='MO')      AS venta_mo
FROM dwh.fact_contable_servicio
WHERE fecha >= :mes_inicio AND fecha < :mes_fin
  [ AND mui = CAST(:mui AS int) ]
GROUP BY mui;
```

### 4.3 Último ticket promedio disponible (`postventa_service.py:60-67`)

```sql
SELECT DISTINCT ON (mui) mui, ticket_promedio, fecha
FROM dwh.fact_ticket_promedio
WHERE fecha <= :mes_fin
  [ AND mui = CAST(:mui AS int) ]
ORDER BY mui, fecha DESC;
```

### 4.4 Plan de servicio desde presupuesto (`postventa_service.py:71-83`)

```sql
SELECT mui,
  SUM(monto) FILTER (WHERE seccion='INGRESOS' AND rama='SERVICIO') AS plan_servicio,
  SUM(monto) FILTER (WHERE seccion='INGRESOS' AND tipo='MO')       AS plan_mo
FROM dwh.fact_ppto_estado_resultados
WHERE fecha >= :mes_inicio AND fecha < :mes_fin
  [ AND mui = CAST(:mui AS int) ]
GROUP BY mui;
```

### Response
```ts
PVSummary[] = [{
  mui: number, sucursal: string,
  ots: number,
  horas_mo: number,
  venta_total: number,    // contable (Ingreso)
  venta_mo: number,       // contable (MO)
  ticket_promedio: number | null,
  plan_servicio: number,
  plan_mo: number
}]
```

### Uso en el frontend
Solo consume `venta_total` por sucursal para el bloque "Servicio" de cada `SucursalCard`.

---

## 5. Middlewares y observabilidad

Configurados en `backend/app/main.py`:

- **CORS** (orígenes desde `CORS_ORIGINS` en `.env`).
- **Rate limit** 60 req/s por IP.
- **Audit log** por request.
- **Security headers** estándar.
- Healthcheck: `GET /api/v1/health/` (verificar con `curl http://localhost:8001/api/v1/health`).

## 6. Notas de integridad usadas por estos endpoints

- **Ensenada (MUI 7) está excluida** de todo; tampoco llega a las dim ni a las fact.
- En `fact_estado_resultados` los datos Honda Motos viven bajo `marca='HONDA'` con terminaciones `4` (TJ) y `6` (MX). En `fact_ppto_estado_resultados` las terminaciones son `1` y `2`. El mapeo a `mui` ya está hecho en ETL — los endpoints asumen `mui ∈ {6, 8}`.
- `balanza_ppto.acumulado` siempre es 0 en fuente; los agregados usan `mensual`. Ya viene resuelto en `fact_ppto_estado_resultados`.
- `fact_ventas.monto` es 0 en el ETL actual (no disponible en hmcrm). Solo se confía en los **conteos** de unidades.
