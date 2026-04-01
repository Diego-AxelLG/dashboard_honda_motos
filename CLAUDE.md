# CLAUDE.md — Honda Motos Dashboard

## Proyecto

Dashboard de BI para **Honda Motos** — dos sucursales: **Tijuana (mui 6)** y **Mexicali (mui 8)**.
Ensenada (mui 7) está cerrada y excluida de todo.

Construido sobre un boilerplate genérico de BI (ver README.md para stack completo).

## Stack

- **Frontend**: Next.js 14, React 18, TypeScript, TailwindCSS, Tremor v3, Recharts
- **Backend**: FastAPI, Pydantic v2, SQLAlchemy
- **Data Pipeline**: Python, pandas, SQLAlchemy
- **Bases de datos origen**: MySQL (3 schemas en el mismo host)
- **DWH destino**: PostgreSQL 15, esquema Kimball (star schema)

## Bases de datos origen

Todas en el mismo host (108.175.209.183). Credenciales en `.env`.

| Variable prefix | Schema   | Contenido                                          |
|-----------------|----------|-----------------------------------------------------|
| `METRICS_`      | metrics  | Ventas, inventario, servicio, dealer profile, OS    |
| `SICOFI_`       | sicofi   | Contabilidad: balanza, presupuestos, catálogos      |
| `HMCRM_`        | hmcrm    | CRM Honda Motos: contactos, ventas, plan, inventario|

## Identificadores de sucursal

### metrics / dealer_profile (marca_unidad_id)
- `6` = Honda Motos Tijuana
- `8` = Honda Motos Mexicali
- `7` = Honda Motos Ensenada (CERRADA — no usar)

### sicofi (marca + terminacion)
- `HONDA MOTOS` + terminacion `1` = Tijuana (mui 6)
- `HONDA MOTOS` + terminacion `2` = Mexicali (mui 8)
- `HONDA MOTOS` + terminacion `3` = Ensenada (no usar)
- Nota: `sicofi.balanza` NO tiene datos para HONDA MOTOS. Solo `balanza_ppto` los tiene.

### hmcrm
- `hus_ciudad = 'Tijuana'` o `plv_id_agencia = 1` = mui 6
- `hus_ciudad = 'Mexicali'` o `plv_id_agencia = 2` = mui 8
- **Tecate** aparece en vw_ventas_totales (191 registros) — excluido en extract_ventas.sql

### Prefijos de factura en servicio_ventas
- `SMT` = Tijuana (6)
- `SMM` = Mexicali (8)

## DWH PostgreSQL (honda_motos)

Schema `dwh` con modelo Kimball. DDLs en `data-pipeline/ddl/`:
- `001_schema_base.sql` — dims + fact_ventas/inventario/plan + mv_kpis_mensual
- `002_honda_motos.sql` — seeds sucursales, venta_contado, modelo en plan, etl_last_run
- `003_honda_motos_all_facts.sql` — todas las tablas de postventa + financiero + MVs

### Tablas de hechos

| Tabla | Filas | Patron | Fuente |
|-------|-------|--------|--------|
| `fact_ventas` | 2,744 | UPSERT (id_oportunidad=VIN) | hmcrm |
| `fact_plan` | 48 | UPSERT (anio_mes, id_sucursal, modelo) | hmcrm |
| `fact_flujos_piso` | 753 | UPSERT (fecha, id_sucursal) | hmcrm |
| `fact_inventario` | 2,579 | DELETE+INSERT (fecha_snapshot) | hmcrm |
| `fact_servicio_kpi` | 1,189 | UPSERT (fecha, id_sucursal) | metrics |
| `fact_os_abierta` | 5 | DELETE+INSERT (fecha_snapshot) | metrics |
| `fact_os_abierta_detalle` | 35 | DELETE+INSERT (fecha_snapshot) | metrics |
| `fact_inv_refacciones` | 2 | UPSERT (fecha_snapshot, id_sucursal) | metrics |
| `fact_uio` | 2 | UPSERT (fecha_snapshot, id_sucursal) | metrics |
| `fact_dealer_profile` | 161 | UPSERT (fecha, id_sucursal, dp_id) | metrics |
| `fact_ppto_servicio` | 48 | UPSERT (fecha, id_sucursal, tipo) | sicofi |
| `fact_ppto_edr` | 817 | UPSERT (fecha, suc, seccion, rama, tipo) | sicofi |

### Vistas materializadas
- `mv_kpis_mensual` — ventas + plan + cumplimiento + MoM + YoY
- `mv_cumplimiento_ventas` — ventas vs plan por modelo
- `mv_aging_inventario` — distribucion aging por sucursal

## ETL Scripts

Todos en `data-pipeline/etl/scripts/`. Ejecutar desde `data-pipeline/`:

```bash
# Ventas (Fase 1)
python etl/scripts/etl_ventas.py --full          # 2,744 registros
python etl/scripts/etl_plan_ventas.py            # 48 registros (unpivot)
python etl/scripts/etl_flujos_piso.py            # 753 registros
python etl/scripts/etl_inventario.py             # 2,579 registros (snapshot)

# Postventa (Fase 2)
python etl/scripts/etl_servicio_kpi.py           # 1,189 registros
python etl/scripts/etl_os_abierta.py             # 5 agg + 35 detalle
python etl/scripts/etl_inv_refacciones.py        # 2 registros
python etl/scripts/etl_uio.py                    # 2 registros
python etl/scripts/etl_dealer_profile.py         # 161 registros (41 KPIs x 2 suc x ~2 meses)
python etl/scripts/etl_ppto_servicio.py          # 48 registros
python etl/scripts/etl_ppto_edr.py               # 817 registros
```

### Conectores disponibles en utils.py
- `postgres` — PG_* vars
- `mysql` — MYSQL_* vars (no usado actualmente)
- `metrics` — METRICS_* vars
- `hmcrm` — HMCRM_* vars
- `sicofi` — SICOFI_* vars

## Queries de extracción

### data-pipeline/etl/extract/postventa/

| Archivo                            | BD      | Descripción                                    |
|------------------------------------|---------|------------------------------------------------|
| extract_oskpi.sql                  | metrics | KPIs diarios servicio (cantidad OS, horas MO, venta) |
| extract_os_abierta.sql             | metrics | OS abiertas fuera de SLA (agregado)            |
| extract_os_abierta_detalle.sql     | metrics | OS abiertas fuera de SLA (detalle individual)  |
| extract_inv_refacciones.sql        | metrics | Inventario refacciones (movimiento/nuevo/obsoleto) |
| extract_dealer_profile.sql         | metrics | 60 KPIs mensuales dealer profile (41 curados, ver docs/dealer_profile_kpis.md) |
| extract_UIO.sql                    | metrics | Units In Operation (VINs únicos servicio)      |
| extract_pptoSicofi.sql             | sicofi  | Presupuesto ingresos servicio + MO             |
| extract_ppto_estado_resultados.sql | sicofi  | Presupuesto EdR completo (ingresos/costos/gastos) |

### data-pipeline/etl/extract/ventas/

| Archivo                            | BD    | Descripción                                   |
|------------------------------------|-------|------------------------------------------------|
| extract_ventas.sql                 | hmcrm | Ventas diarias por modelo/VIN (2024+)          |
| extract_plan_ventas.sql            | hmcrm | Plan de ventas mensual por modelo              |
| extract_flujos_piso.sql            | hmcrm | Flujos de piso diarios (FreshUp + Internet)    |
| extract_llegadavin_inventario.sql  | hmcrm | Fecha de llegada por VIN (para aging inventario)|

## API Endpoints

Base: `/api/v1/`

### Ventas (`/api/v1/ventas/`)
- `GET /resumen` — KPIs mensuales desde mv_kpis_mensual
- `GET /tendencia` — Venta diaria acumulada vs plan prorrateado
- `GET /por-modelo` — Ranking modelos por unidades
- `GET /flujos` — Flujos de piso diarios
- `GET /detalle` — Drill-down VINs vendidos

### Postventa (`/api/v1/postventa/`)
- `GET /servicio-kpis` — KPIs servicio + dealer profile P1 + ppto
- `GET /os-abiertas` — OS fuera de SLA agregado + DP
- `GET /os-abiertas/detalle` — Drill-down OS individuales
- `GET /refacciones` — Inventario refacciones por categoria
- `GET /uio` — Units In Operation

### Financiero (`/api/v1/financiero/`)
- `GET /edr` — Estado de Resultados presupuestado (solo ppto, sin reales)
- `GET /dealer-profile` — KPIs P2 gastos + servicio financiero con MoM
- `GET /ventas-kpis` — KPIs P1 ventas nuevos (id 1-7)

### Inventario (`/api/v1/inventario/`)
- `GET /aging` — Distribucion aging por sucursal
- `GET /detalle` — Drill-down por VIN con dias en piso

Params comunes: `anio_mes: str` (YYYY-MM), `mui: int` (6 o 8, opcional)

## Dealer Profile KPIs

60 KPIs totales en catalogo. 41 curados para el dashboard:
- **P1 (27 KPIs)**: Venta nuevos (7), servicio operativo (14), OS abiertas (4), UIO (2)
- **P2 (14 KPIs)**: Gastos (8), servicio financiero (6)
- **Descartados (19 KPIs)**: Sin datos (12), seminuevos sin actividad (7)

Ver detalle completo en `docs/dealer_profile_kpis.md`.

## Alertas de calidad de datos conocidas

### ventas (hmcrm)
- **Tecate**: 191 registros — excluidos con `hus_ciudad IN ('Tijuana', 'Mexicali')`
- 26 VINs duplicados encontrados y deduplicados en ETL

### servicio_ventas (metrics)
- `telefono`: 77% vacío
- `numero_cliente`: 52% vacío
- `marca` incluye valores "NO HONDA" e "ITALIKA" (servicio multimarca)
- Campos venta_tot/costo_tot/descuento_* son >99% zero en motos

### os_proceso (metrics)
- `costo`: 100% en cero — no se carga; usar `venta` y `costo_refaccion`/`venta_total_ref`

### refacciones_inventario (metrics)
- `existencia` es VARCHAR, no numérico — requiere CAST para cálculos

### sicofi.balanza_ppto
- Falta año 2023 completo
- `acumulado` siempre en cero — solo `mensual` tiene datos
- **balanza** (datos reales) NO tiene datos para HONDA MOTOS — solo presupuesto disponible

## Frontend

Branding Honda: rojo #CC0000 primary, gris #333 secondary, rojo claro #E53935 accent.

### Paginas
- `/` — Resumen ejecutivo (KPI cards + grid por sucursal)
- `/ventas` — Tendencia, modelos, flujos, detalle VINs
- `/postventa` — Servicio KPIs, OS abiertas, refacciones, UIO
- `/inventario` — Aging distribution, detalle por VIN
- `/financiero` — EdR presupuestado, gastos, rentabilidad servicio, KPIs ventas DP

### Componentes UI reutilizables
- `KPICard` — Tarjeta de indicador con delta MoM
- `DataGrid<T>` — Grid de cards clickeables + panel de detalle
- `AgencyPills` — Filtro Tijuana/Mexicali/Todas
- `MonthPicker` — Selector YYYY-MM
- `LoadingState` — Skeletons (cards/table/spinner)

## Convenciones

- MUI = marca_unidad_id (identificador universal de sucursal)
- Queries SQL usan `mui` como alias de salida para el ID de sucursal
- ETL SQL usa placeholders Jinja `{{ param }}` donde corresponda
- Endpoints API: `/api/v1/<modulo>/<accion>`
- Frontend components: PascalCase, un archivo por componente

## Comandos

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && pip install -r requirements.txt
uvicorn backend.app.main:app --reload

# ETL (desde data-pipeline/)
cd data-pipeline
python etl/scripts/etl_ventas.py --full
python etl/scripts/etl_plan_ventas.py

# Scripts de exploración
python data-pipeline/scripts/eda_motos_tj_mx.py
python data-pipeline/scripts/explorar_metrics_motos.py
```
