# Ventas — Backend API

Documentación de los endpoints FastAPI que alimentan la página `/ventas`. Todos viven bajo `/api/v1/ventas/` y se registran en `backend/app/api/router.py`.

- **Puerto dev:** `8001` (NUNCA 8000).
- **Endpoint file:** `backend/app/api/endpoints/ventas.py`
- **Service file:** `backend/app/services/ventas_service.py`

| # | Endpoint | Endpoint:línea | Servicio |
|---|---|---|---|
| 1 | `GET /ventas/resumen` | `ventas.py:9-11` | `get_resumen` |
| 2 | `GET /ventas/tendencia` | `ventas.py:14-16` | `get_tendencia` |
| 3 | `GET /ventas/por-modelo` | `ventas.py:19-21` | `get_por_modelo` |
| 4 | `GET /ventas/flujos` | `ventas.py:24-26` | `get_flujos` |
| 5 | `GET /ventas/detalle` | `ventas.py:34-36` | `get_detalle` |
| 6 | `GET /ventas/cumplimiento-pacing` | `ventas.py:29-31` | `get_cumplimiento_pacing` |

> La página `/ventas` consume los endpoints 1–5. El **#6 (cumplimiento-pacing)** existe en el mismo router pero lo usa la página **Resumen Ejecutivo**; ya está documentado en `docs/docs_pages/resumen/backend_api.md` y aquí se menciona solo por completitud.

### Parámetros comunes

Todos los endpoints aceptan los mismos:

- `mui: int | None` — `6` (Tijuana), `8` (Mexicali), `null` consolidado.
- `anio_mes: str | None` — formato `YYYY-MM`; default: mes actual.

Convención crítica en SQL: usar **`CAST(:param AS type)`** en `text()`, no `:param::type` (SQLAlchemy escapa el `::`).

### Helper de mes (`ventas_service.py`)

`_resolve_month(anio_mes)` retorna `(mes_inicio, mes_fin)`:

- `mes_inicio = 'YYYY-MM-01'`
- `mes_fin = primer día del mes siguiente` (para que los filtros sean `fecha >= mes_inicio AND fecha < mes_fin`).

Si `anio_mes` es `None`, usa el mes actual.

---

## 1. `GET /api/v1/ventas/resumen`

**Servicio:** `ventas_service.py:25-40`

Lee directo de la vista materializada `dwh.mv_kpis_mensual`:

```sql
SELECT anio_mes, id_sucursal, sucursal,
       total_ventas, ventas_nuevos, monto_total,
       meta, pct_cumplimiento, var_pct_yoy
FROM dwh.mv_kpis_mensual
WHERE anio_mes = :anio_mes
  [ AND id_sucursal = CAST(:mui AS int) ]
ORDER BY id_sucursal;
```

La vista ya calcula:

- `pct_cumplimiento = ROUND(total_ventas * 100.0 / meta, 1)` (null si meta=0).
- `var_pct_yoy = ROUND((actual - año_anterior) * 100.0 / año_anterior, 1)` (null si anterior=0).

### Response

```ts
Resumen[] = [{
  anio_mes, id_sucursal, sucursal,
  total_ventas, ventas_nuevos, monto_total,   // monto_total siempre 0
  meta, pct_cumplimiento, var_pct_yoy
}]
```

**Uso en frontend:** alimenta las 3 `KPICard` (Ventas #, Cumplimiento, Var. YoY), con promedio simple en cliente para cumplimiento y YoY.

---

## 2. `GET /api/v1/ventas/tendencia`

**Servicio:** `ventas_service.py:43-84`

Genera la **curva de acumulado vs plan prorrateado día a día** del mes seleccionado. Usa `generate_series` para tener un punto por cada día aunque no haya ventas.

```sql
WITH dias AS (
  SELECT CAST(generate_series(
           CAST(:mes_inicio AS date),
           CAST(:mes_fin   AS date) - interval '1 day',
           interval '1 day'
         ) AS date) AS fecha
),
ventas_dia AS (
  SELECT fv.fecha, COUNT(*) AS unidades
  FROM dwh.fact_ventas fv
  WHERE fv.fecha >= CAST(:mes_inicio AS date)
    AND fv.fecha <  CAST(:mes_fin   AS date)
    [ AND fv.id_sucursal = CAST(:mui AS int) ]
  GROUP BY fv.fecha
),
plan_total AS (
  SELECT COALESCE(SUM(plan_ventas), 0) AS total
  FROM dwh.fact_plan
  WHERE anio_mes = :anio_mes
    [ AND id_sucursal = CAST(:mui AS int) ]
)
SELECT CAST(d.fecha AS text) AS fecha,
       CAST(COALESCE(SUM(vd.unidades) OVER (ORDER BY d.fecha), 0) AS int)
         AS ventas_acumuladas,
       CAST(ROUND(
         CAST((SELECT total FROM plan_total) AS numeric)
         / GREATEST(EXTRACT(DAY FROM CAST(:mes_fin AS date) - interval '1 day'), 1)
         * ROW_NUMBER() OVER (ORDER BY d.fecha)
       ) AS int) AS plan_prorrateado
FROM dias d
LEFT JOIN ventas_dia vd ON vd.fecha = d.fecha
ORDER BY d.fecha;
```

### Fórmulas

- **`ventas_acumuladas`** — window function `SUM(unidades) OVER (ORDER BY fecha)`. Corre incluso en días sin ventas gracias al `LEFT JOIN` con `dias`.
- **`plan_prorrateado`** — `ROUND(plan_total / dias_mes * dia_del_mes)`. Es una recta que va de 0 al plan total.

### Response

```ts
Tendencia[] = [{
  fecha: string,              // "YYYY-MM-DD"
  ventas_acumuladas: number,
  plan_prorrateado: number
}]
```

**Uso en frontend:** `LineChart` "Venta Acumulada vs Plan".

---

## 3. `GET /api/v1/ventas/por-modelo`

**Servicio:** `ventas_service.py:87-105`

```sql
SELECT fv.modelo,
       COUNT(*)                                          AS unidades,
       SUM(CASE WHEN fv.venta_contado     THEN 1 ELSE 0 END) AS contado,
       SUM(CASE WHEN NOT fv.venta_contado THEN 1 ELSE 0 END) AS financiamiento
FROM dwh.fact_ventas fv
WHERE fv.fecha >= CAST(:mes_inicio AS date)
  AND fv.fecha <  CAST(:mes_fin   AS date)
  [ AND fv.id_sucursal = CAST(:mui AS int) ]
GROUP BY fv.modelo
ORDER BY unidades DESC;
```

### Response

```ts
Modelo[] = [{ modelo, unidades, contado, financiamiento }]
```

**Uso en frontend:** `BarChart` horizontal stacked (contado + financiamiento).

---

## 4. `GET /api/v1/ventas/flujos`

**Servicio:** `ventas_service.py:108-124`

```sql
SELECT CAST(f.fecha AS text) AS fecha,
       f.id_sucursal,
       f.freshup,
       f.internet,
       (f.freshup + f.internet) AS total
FROM dwh.fact_flujos_piso f
WHERE f.fecha >= CAST(:mes_inicio AS date)
  AND f.fecha <  CAST(:mes_fin   AS date)
  [ AND f.id_sucursal = CAST(:mui AS int) ]
ORDER BY f.fecha;
```

Datos diarios; el `total` se calcula en la SELECT (no está en la tabla). `fact_flujos_piso` se puebla con los **contactos** del CRM clasificados por fuente:

- `freshup` = contactos con `fuente_fue_IDfuente = 1` (walk-in).
- `internet` = contactos con `fuente_fue_IDfuente = 4` (lead web).

### Response

```ts
Flujo[] = [{ fecha, id_sucursal, freshup, internet, total }]
```

**Uso en frontend:** `ComposedChart` en el tab "Flujos de Piso".

---

## 5. `GET /api/v1/ventas/detalle`

**Servicio:** `ventas_service.py:268-287`

```sql
SELECT CAST(fv.fecha AS text) AS fecha,
       fv.id_sucursal,
       s.nombre AS sucursal,
       fv.modelo,
       fv.id_oportunidad AS vin,
       fv.venta_contado
FROM dwh.fact_ventas fv
JOIN dwh.dim_sucursales s ON s.id_sucursal = fv.id_sucursal
WHERE fv.fecha >= CAST(:mes_inicio AS date)
  AND fv.fecha <  CAST(:mes_fin   AS date)
  [ AND fv.id_sucursal = CAST(:mui AS int) ]
ORDER BY fv.fecha DESC
LIMIT 500;
```

**Límite duro: 500 filas**, ordenadas por fecha DESC. `id_oportunidad` se renombra a `vin` porque en este proyecto esa columna **es el VIN** (así lo produce el ETL de ventas).

### Response

```ts
VentaDetalle[] = [{
  fecha, id_sucursal, sucursal,
  modelo, vin, venta_contado
}]
```

**Uso en frontend:** tabla paginada en cliente (50 por página). Con meses muy activos puede tocar el límite de 500 — si en algún momento hace falta, habrá que paginar del lado backend.

---

## 6. `GET /api/v1/ventas/cumplimiento-pacing` *(no consumido por /ventas)*

Documentado en detalle en `docs/docs_pages/resumen/backend_api.md`. Breve recordatorio:

- Calcula **ventas al mismo día** del mes, `plan_prorrateado` y variaciones contra mes anterior y año anterior **en el mismo cutoff_day**.
- Cutoff:
  - mes actual → `min(today.day, dias_mes)`
  - mes pasado → `dias_mes`
  - mes futuro → `0`
- Retorna `{ anio_mes, cutoff_day, dias_mes, total, sucursales[] }`.
- Fuente: `dwh.fact_ventas`, `dwh.fact_plan`, `dwh.dim_sucursales`.

---

## 7. Tablas y vistas del DWH tocadas

| Objeto | Endpoints | Notas |
|---|---|---|
| `dwh.mv_kpis_mensual` | resumen | Vista materializada; pre-agrega cumplimiento y YoY |
| `dwh.fact_ventas` | tendencia, por-modelo, detalle, cumplimiento-pacing | `id_oportunidad = VIN`, `monto` siempre 0 |
| `dwh.fact_plan` | tendencia, cumplimiento-pacing | Unpivot 12 meses desde hmcrm, `plan_ventas > 0` |
| `dwh.fact_flujos_piso` | flujos | `(fecha, id_sucursal)` único; `freshup` + `internet` |
| `dwh.dim_sucursales` | detalle, cumplimiento-pacing | Solo 6 (Tijuana) y 8 (Mexicali). Ensenada no existe |
| `dwh.dim_tiempo` | (implícito) | Referenciada por FK desde fact_ventas |

## 8. Middlewares y observabilidad

Configurados en `backend/app/main.py`:

- **CORS** (desde `CORS_ORIGINS` en `.env`).
- **Rate limit** 60 req/s por IP.
- **Audit log** por request.
- **Security headers** estándar.
- **Healthcheck:** `GET /api/v1/health/`.

## 9. Notas de integridad

- `fact_ventas.monto` **es siempre 0** — el campo no existe en hmcrm. La página de Ventas **nunca** muestra montos monetarios; todo son **conteos de unidades**. `mv_kpis_mensual.monto_total` se lo ignora.
- El servicio asume `mui ∈ {6, 8}`; el filtro por catálogo vive en el ETL (Tijuana/Mexicali en hmcrm).
- `LIMIT 500` en `/detalle` es un corte defensivo; meses normales caen muy por debajo.
- `cumplimiento_pct` y `var_pct_yoy` del endpoint `/resumen` ya vienen calculados por la MV — no re-calcular en servicio ni en frontend.
