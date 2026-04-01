# Plan de Implementacion — Honda Motos Dashboard

**Fecha**: 2026-03-31
**Cliente**: Honda Motos (Tijuana mui 6, Mexicali mui 8)
**Base**: Boilerplate BI Dashboard

---

## Fase 0: Setup Infra + Descubrimiento (Dia 1)

### 0.1 Base de datos PostgreSQL (DWH)

- [ ] Crear la BD en PostgreSQL local (o servidor destino)
- [ ] Ejecutar `001_schema_base.sql` para crear schema `dwh` con dims y facts base
- [ ] Crear DDL `002_honda_motos.sql` con tablas adicionales:

**Dimensiones nuevas:**
- `dim_modelos` — catalogo de modelos de motos (nombre normalizado, cilindrada, categoria)

**Facts nuevos (postventa):**
- `fact_servicio_kpi` — KPIs diarios de servicio (OS count, horas MO, venta MO, venta total) — viene de `extract_oskpi.sql`
- `fact_os_abierta` — Snapshot de OS abiertas fuera de SLA por tipo — viene de `extract_os_abierta.sql`
- `fact_inv_refacciones` — Snapshot inventario refacciones (movimiento/nuevo/obsoleto) — viene de `extract_inv_refacciones.sql`
- `fact_uio` — Units In Operation por cohort (UIO, UIO_MP, UIO_AP) — viene de `extract_UIO.sql`
- `fact_dealer_profile` — 41 KPIs mensuales dealer profile (de 60 originales, 19 descartados — ver `docs/dealer_profile_kpis.md`) — viene de `extract_dealer_profile.sql`
- `fact_ppto_servicio` — Presupuesto servicio + MO por mes — viene de `extract_pptoSicofi.sql`
- `fact_ppto_edr` — Estado de resultados presupuestado completo — viene de `extract_ppto_estado_resultados.sql`

**Facts nuevos (ventas):**
- `fact_flujos_piso` — Flujos diarios por fuente (FreshUp, Internet) — viene de `extract_flujos_piso.sql`
- `fact_llegada_vin` — Fecha llegada de VIN para aging — viene de `extract_llegadavin_inventario.sql`

**Vistas materializadas nuevas:**
- `mv_kpis_servicio_mensual` — Agregacion mensual de servicio
- `mv_cumplimiento_ventas` — Ventas vs plan con % y tendencia
- `mv_aging_inventario` — Distribucion de aging por sucursal

- [ ] Insertar datos semilla en `dim_sucursales`:
  ```sql
  INSERT INTO dwh.dim_sucursales (id_sucursal, nombre, ciudad, marca, activa) VALUES
  (6, 'Honda Motos Tijuana',  'Tijuana',  'Honda Motos', TRUE),
  (8, 'Honda Motos Mexicali', 'Mexicali', 'Honda Motos', TRUE);
  ```

### 0.2 Variables de entorno (.env)

- [ ] Configurar `.env` con credenciales reales:
  ```
  PG_HOST / PG_PORT / PG_USER / PG_PASSWORD / PG_DATABASE
  MYSQL_HOST=108.175.209.183  (hmcrm)
  METRICS_HOST=108.175.209.183 (metrics)
  SICOFI_HOST=108.175.209.183 (sicofi)
  SUCURSALES_PERMITIDAS=6,8
  FECHA_INICIO=2024-01-01
  ```

### 0.3 Branding frontend

- [ ] `frontend/src/lib/constants.ts` — cambiar nombre a "Honda Motos", tagline "Dashboard Postventa & Ventas"
- [ ] `frontend/src/app/globals.css` — colores Honda (rojo #CC0000 primary, gris oscuro #333 secondary, rojo claro accent)
- [ ] `frontend/public/` — agregar logo Honda Motos
- [ ] `frontend/tailwind.config.ts` — ajustar paleta Tremor a colores Honda

### 0.4 Dealer Profile KPIs — COMPLETADO

Exploración ejecutada 2026-03-31. Resultado completo en `docs/dealer_profile_kpis.md`.

**Hallazgos**:
- Son **60 KPIs** activos (no 51 como decía CLAUDE.md — corregir)
- 12 KPIs sin datos para Honda Motos (seguros, créditos, ext. garantía, flujos de piso)
- 7 KPIs de seminuevos: actividad ~0 (0.13 unidades/mes promedio, $0 en marzo 2026)
- 63% del inventario de refacciones en TJ y 64% en MX es obsoleto o tec. obsoleto

**Clasificación final**:
- **P1 (27 KPIs)**: Venta nuevos (7), servicio operativo (14), OS abiertas (4), UIO (2)
- **P2 (14 KPIs)**: Gastos (8), servicio financiero (6)
- **Descartar (19 KPIs)**: Sin datos (12), seminuevos sin actividad (7)

**Pendiente**:
- [ ] Ajustar `extract_dealer_profile.sql` para filtrar solo IDs de P1+P2 (ver docs/dealer_profile_kpis.md para lista exacta)
- [ ] Crear DDL de `fact_dealer_profile` con columna `prioridad` (ver estructura en docs/dealer_profile_kpis.md)

---

## Fase 1: ETL Base — Ventas (Dias 2-3)

> **Regla**: Cada ETL incluye sus filtros de calidad de datos en la transformacion. No se cargan datos sucios al DWH.

### 1.1 ETL Ventas (UPSERT incremental)

- [ ] Crear `etl/scripts/etl_ventas.py` basado en `etl_ejemplo.py`
  - Source: `hmcrm` via `extract_ventas.sql` (ya existe)
  - Target: `dwh.fact_ventas`
  - Key: `id_oportunidad` (VIN + fecha)
  - **Transform (calidad de datos)**:
    - Normalizar modelo (ya implementado en SQL con REGEXP_REPLACE)
    - Excluir mui 7 (Ensenada) — `WHERE mui IN (6, 8)` en el query ya esta, verificar
    - Filtrar registros tipo "Descuentos X modelo" con montos negativos — excluir del conteo de unidades, tratar como ajuste separado o descartar si no aportan al analisis
    - Deduplicar por VIN + fecha (el EDA detecto duplicados potenciales)
- [ ] Crear `etl/scripts/etl_plan_ventas.py`
  - Source: `hmcrm` via `extract_plan_ventas.sql` (ya existe)
  - Target: `dwh.fact_plan`
  - UPSERT por (anio_mes, id_sucursal)
  - Transform: unpivot 12 columnas mensuales a filas

### 1.2 ETL Flujos de Piso (UPSERT)

- [ ] Crear `etl/scripts/etl_flujos_piso.py`
  - Source: `hmcrm` via `extract_flujos_piso.sql` (ya existe)
  - Target: `dwh.fact_flujos_piso`

### 1.3 ETL Inventario / Aging (Snapshot)

- [ ] Crear `etl/scripts/etl_inventario.py` basado en `etl_snapshot_ejemplo.py`
  - Source: `hmcrm` via `extract_llegadavin_inventario.sql`
  - Target: `dwh.fact_inventario` (calcular dias_inventario = hoy - fecha_llegada)

### 1.4 Validacion post-carga

- [ ] Ejecutar `etl_validation.py` (ver Fase 1.5) tras cada ETL con `--full`
- [ ] Refresh `mv_kpis_mensual` y validar numeros vs fuente

### 1.5 Validador ETL (crear una sola vez, usar siempre)

- [ ] Crear `etl/scripts/etl_validation.py` — script de validacion post-carga:
  ```
  Checks por tabla:
  - Row count DWH vs row count source (tolerancia configurable, ej. 2%)
  - Sumas de control en columnas numericas clave (monto, cantidad, horas)
  - Deteccion de duplicados por business key
  - Rango de fechas esperado (no datos del futuro, no gaps mayores a X dias)
  - Nulls en columnas NOT NULL logicas
  - Valores fuera de rango (montos negativos donde no deberia, mui no valido)

  Output:
  - Tabla de resultados: tabla | check | status | expected | actual | detail
  - Exit code 0 si todo OK, 1 si hay warnings, 2 si hay errores criticos
  - Log a etl_validation.log
  ```
- [ ] Integrar en `cron_etl.sh`: correr validacion despues de cada ETL, enviar alerta si falla

---

## Fase 2: ETL Base — Postventa (Dias 3-4)

> Misma regla: filtros de calidad en cada transform, validacion post-carga.

### 2.1 ETL Servicio KPIs (UPSERT)

- [ ] Crear `etl/scripts/etl_servicio_kpi.py`
  - Source: `metrics` via `extract_oskpi.sql` (ya existe)
  - Target: `dwh.fact_servicio_kpi`
  - **Transform (calidad de datos)**:
    - Solo mui IN (6, 8) — ya filtrado en SQL
    - Marcas "NO HONDA" e "ITALIKA": agregar columna `es_honda BOOLEAN` al fact. El servicio es multimarca — los KPIs de OS totales incluyen todo, pero los reportes de marca Honda deben poder filtrar
    - `costo` siempre en cero — no cargar esa columna, usar `venta` y `costo_refaccion`/`venta_total_ref`

### 2.2 ETL OS Abiertas (Snapshot)

- [ ] Crear `etl/scripts/etl_os_abierta.py`
  - Source: `metrics` via `extract_os_abierta.sql` (ya existe)
  - Target: `dwh.fact_os_abierta`
  - Patron DELETE+INSERT por fecha_snapshot

### 2.3 ETL Inventario Refacciones (Snapshot)

- [ ] Crear `etl/scripts/etl_inv_refacciones.py`
  - Source: `metrics` via `extract_inv_refacciones.sql` (ya existe)
  - Target: `dwh.fact_inv_refacciones`
  - **Transform (calidad de datos)**:
    - `existencia` es VARCHAR en origen — CAST a INTEGER en la transformacion (no en el DWH)
    - Validar que el CAST no falle (registros con texto en existencia → log y skip)

### 2.4 ETL UIO (UPSERT)

- [ ] Crear `etl/scripts/etl_uio.py`
  - Source: `metrics` via `extract_UIO.sql` (ya existe)
  - Target: `dwh.fact_uio`

### 2.5 ETL Dealer Profile (UPSERT)

- [ ] Crear `etl/scripts/etl_dealer_profile.py`
  - Source: `metrics` via `extract_dealer_profile.sql` (ya existe, ajustado en 0.4)
  - Target: `dwh.fact_dealer_profile`
  - Solo cargar KPIs del subset curado (P1 + P2 de fase 0.4)

### 2.6 ETL Presupuestos Sicofi (UPSERT)

- [ ] Crear `etl/scripts/etl_ppto_servicio.py`
  - Source: `sicofi` via `extract_pptoSicofi.sql` (ya existe)
  - Target: `dwh.fact_ppto_servicio`
- [ ] Crear `etl/scripts/etl_ppto_edr.py`
  - Source: `sicofi` via `extract_ppto_estado_resultados.sql` (ya existe)
  - Target: `dwh.fact_ppto_edr`

### 2.7 Orquestacion

- [ ] Actualizar `cron_etl.sh` con los nuevos scripts
- [ ] Actualizar `refresh_vistas.py` con las nuevas MVs
- [ ] Integrar `etl_validation.py` al final del cron

---

## Fase 3: API — Endpoints (Dia 4-5)

### 3.1 Modulo Ventas

- [ ] `POST /api/v1/ventas/resumen` — KPIs mensuales: unidades vendidas, cumplimiento vs plan, MoM, YoY (lee `mv_kpis_mensual` o `mv_cumplimiento_ventas`)
- [ ] `GET /api/v1/ventas/tendencia` — Venta diaria acumulada vs plan prorrateado (CTE con generate_series, patron de `example_service.py`)
- [ ] `GET /api/v1/ventas/por-modelo` — Ranking de modelos por unidades
- [ ] `GET /api/v1/ventas/flujos` — Flujos de piso diarios/mensuales (FreshUp + Internet)
- [ ] `GET /api/v1/ventas/detalle` — Drill-down tabla de VINs vendidos por sucursal+mes

### 3.2 Modulo Postventa

- [ ] `GET /api/v1/postventa/servicio-kpis` — KPIs mensuales servicio desde fact_servicio_kpi + dealer profile P1:
  - fact_servicio_kpi: OS count, horas MO, venta MO, venta total (diario, calculado)
  - DP id 29: Servicio $ | id 33: Facturación MO | id 34: Facturación Ref
  - DP id 30: Cantidad O/S público | id 48: Total Horas MO | id 57: Horas MO público
  - DP id 49: Ticket promedio público | id 69: Ticket promedio hrs. público
  - DP id 36: MO x O/S público | id 37: REF x O/S público
  - DP id 41: TEMOC | id 47: Técnicos | id 44: Productividad por taller
  - DP id 38: Tasa de absorción (>100% = sano, clave para gerencia)
  - Cumplimiento vs ppto servicio (cruce con fact_ppto_servicio)
- [ ] `GET /api/v1/postventa/os-abiertas` — OS fuera de SLA agregado por tipo + dealer profile P1:
  - fact_os_abierta: snapshot diario con detalle por tipo y SLA
  - DP id 76: Total | id 71: Público | id 72: Garantía | id 74: Interno (cifra oficial Honda mensual)
- [ ] `GET /api/v1/postventa/os-abiertas/detalle` — Drill-down OS individuales (fact_os_abierta detalle)
- [ ] `GET /api/v1/postventa/refacciones` — Distribucion inventario refacciones por categoria
- [ ] `GET /api/v1/postventa/uio` — Units In Operation por cohort y sucursal:
  - fact_uio: UIO, UIO_MP, UIO_AP (cohorts calculados)
  - DP id 81: Units In Operations | id 80: Units Not Active (cifra oficial Honda)

### 3.3 Modulo Financiero

- [ ] `GET /api/v1/financiero/edr` — Estado de Resultados presupuestado
  - **Nota sobre datos reales**: `sicofi.balanza` NO tiene datos para HONDA MOTOS (ver CLAUDE.md). Solo existe `balanza_ppto` (presupuestos). Esto significa:
    - **V1 (ahora)**: Mostrar solo presupuesto por seccion/rama/tipo. Sin columna "Real". Label claro: "Presupuesto Estado de Resultados".
    - **V2 (cuando haya datos reales)**: Agregar fuente de contabilidad real. Esto requiere: (a) que el cliente suba la balanza real a sicofi, o (b) conectar a otra fuente contable. El endpoint ya debe estar diseñado para aceptar un flag `incluir_real: bool` que active la columna cuando exista.
    - **Proteccion**: Si el query de reales retorna 0 filas, mostrar solo ppto sin error. No fallar si la tabla/vista no existe — usar `try/except` en el service.
- [ ] `GET /api/v1/financiero/dealer-profile` — KPIs dealer profile P2 con semaforizacion:
  - **Gastos (8 KPIs)**:
    - id 60: Total gastos | id 61: Fijos | id 62: Variables | id 63: Financieros | id 64: Otros
    - id 58: Punto de equilibrio (%) | id 68: ROS — Return on Sales (%)
    - id 65: Utilidad Neta ($)
  - **Servicio financiero (6 KPIs)**:
    - id 31: Utilidad Bruta servicio
    - id 43: Inventario refacciones total ($)
    - id 51: Inv. nuevo (sub_valor=%) | id 52: Inv. movimiento | id 53: Inv. tec. obsoleto | id 54: Inv. obsoleto
  - Semaforizacion: verde (meta), amarillo (alerta), rojo (critico) — umbrales por KPI
  - Comparativo mes actual vs anterior (delta MoM)
- [ ] `GET /api/v1/financiero/ventas-kpis` — KPIs dealer profile P1 de ventas nuevos:
  - id 1: Ventas $ | id 2: Ventas # (cifra oficial Honda, validacion cruzada con fact_ventas)
  - id 3: Utilidad bruta | id 5: Margen promedio (no disponibles de otra fuente)
  - id 4: Precio promedio | id 6: Dias venta promedio | id 7: Inventario disponible

### 3.4 Modulo Inventario

- [ ] `GET /api/v1/inventario/aging` — Distribucion de aging por sucursal (0-30, 31-60, 61-90, 90+ dias)
- [ ] `GET /api/v1/inventario/detalle` — Drill-down por VIN con dias en piso

### 3.5 Infraestructura API

- [ ] Crear services: `ventas_service.py`, `postventa_service.py`, `financiero_service.py`, `inventario_service.py`
- [ ] Registrar routers nuevos en `api/router.py`
- [ ] Params comunes: `anio_mes: str`, `mui: int | None` (filtro sucursal)

---

## Fase 4: Frontend — Tablero Resumen (Dia 5-6)

### 4.1 Pagina Resumen (Home)

Adaptar `(dashboard)/page.tsx` existente para Honda Motos:

- [ ] **KPI Cards superiores** (6 cards, patron `KPICard`):
  - Ventas # (DP id 2) + delta MoM
  - Cumplimiento vs Plan (%) + delta vs mes anterior
  - Utilidad Neta (DP id 65) + delta MoM
  - Servicio $ (DP id 29) + delta MoM
  - Tasa de absorción (DP id 38) — verde si >100%, rojo si <100%
  - ROS (DP id 68) + delta MoM
- [ ] **Grid por sucursal** (patron `DataGrid<BranchKPI>`):
  - Tijuana y Mexicali como cards
  - Cada card: ventas #/$, cumplimiento, servicio $, utilidad neta, tasa absorción
  - Click abre detail panel con tabla de transacciones del mes
- [ ] **Filtros globales**:
  - `MonthPicker` en header (ya existe)
  - `AgencyPills` para filtrar Tijuana/Mexicali/Todas

### 4.2 Navegacion

- [ ] Actualizar `Sidebar.tsx` con secciones reales:
  - Resumen (home)
  - Ventas
  - Postventa
  - Inventario
  - Financiero

---

## Fase 5: Frontend — Tableros por Modulo (Dias 6-10)

### 5.1 Pagina Ventas (`/ventas`)

- [ ] Crear `src/app/(dashboard)/ventas/page.tsx`
- [ ] KPI row (desde fact_ventas + dealer profile P1):
  - Ventas # (DP id 2) + delta MoM | Cumplimiento vs plan (%)
  - Ventas $ (DP id 1) | Utilidad bruta (DP id 3)
  - Precio promedio (DP id 4) | Margen promedio (DP id 5)
  - Dias venta promedio (DP id 6) | Inventario disponible (DP id 7)
- [ ] Chart: linea de venta acumulada diaria vs plan prorrateado (Recharts `LineChart`) — desde fact_ventas
- [ ] Chart: barras de ventas por modelo (Recharts `BarChart`) — desde fact_ventas
- [ ] Tabla: detalle de VINs vendidos (drill-down desde DataGrid) — desde fact_ventas
- [ ] Subtab o seccion: Flujos de piso (FreshUp vs Internet, tendencia diaria) — desde fact_flujos_piso

### 5.2 Pagina Postventa (`/postventa`)

- [ ] Crear `src/app/(dashboard)/postventa/page.tsx`
- [ ] KPI row (dealer profile P1 servicio):
  - Servicio $ (DP id 29) | Cantidad O/S público (DP id 30) + delta MoM
  - Facturación MO (DP id 33) | Facturación Ref (DP id 34)
  - Ticket promedio $ (DP id 49) | Ticket promedio hrs (DP id 69)
  - Tasa de absorción (DP id 38) — destacar si >100% (verde) o <100% (rojo)
  - Cumplimiento vs ppto servicio (cruce DP id 29 con fact_ppto_servicio)
- [ ] Metricas operativas (dealer profile P1 servicio):
  - MO x O/S (DP id 36) | REF x O/S (DP id 37) | TEMOC (DP id 41)
  - Total Horas MO (DP id 48) | Técnicos (DP id 47) | Productividad (DP id 44)
- [ ] Semaforo OS abiertas (dealer profile P1 + fact_os_abierta):
  - Total (DP id 76) | Público (DP id 71) | Garantía (DP id 72) | Interno (DP id 74)
  - Colores por SLA: Público >3 dias = rojo, Garantía >45 = rojo, Interno >31 = rojo
- [ ] Chart: tendencia mensual de OS y venta servicio (Recharts `ComposedChart` — barras + linea)
- [ ] UIO: card con datos de fact_uio (3 cohorts) + dealer profile (DP id 81: UIO, DP id 80: Not Active)
- [ ] Inventario refacciones: pie/donut chart (dealer profile P2):
  - Movimiento (DP id 52) | Nuevo (DP id 51) | Tec. obsoleto (DP id 53) | Obsoleto (DP id 54)
  - sub_valor tiene el % — usar para el chart. Total $ = DP id 43
  - **Alerta visual**: 63% TJ / 64% MX es obsoleto+tec.obsoleto — resaltar en rojo
- [ ] Drill-down: tabla de OS abiertas individuales (fact_os_abierta detalle)

### 5.3 Pagina Inventario (`/inventario`)

- [ ] Crear `src/app/(dashboard)/inventario/page.tsx`
- [ ] KPI row: unidades en piso, edad promedio, unidades >90 dias
- [ ] Chart: barras stacked de aging por rango (0-30, 31-60, 61-90, 90+)
- [ ] Tabla: detalle por VIN con modelo, dias en piso, sucursal

### 5.4 Pagina Financiero (`/financiero`)

- [ ] Crear `src/app/(dashboard)/financiero/page.tsx`
- [ ] **Seccion 1: Resumen Ejecutivo** (dealer profile P2 — Gastos):
  - KPI cards principales:
    - Utilidad Neta (DP id 65): TJ $580K, MX $189K — el numero mas importante
    - ROS (DP id 68): TJ 13.9%, MX 10.2% — rentabilidad sobre ventas
    - Punto de equilibrio (DP id 58): TJ -19.7% (superávit), MX 5.1%
  - Desglose de gastos (barras stacked o tabla):
    - Total (DP id 60) | Fijos (DP id 61) | Variables (DP id 62) | Financieros (DP id 63) | Otros (DP id 64)
  - Comparativo TJ vs MX lado a lado
  - Delta MoM en cada KPI
- [ ] **Seccion 2: Rentabilidad Servicio** (dealer profile P2 — Servicio financiero):
  - Utilidad Bruta servicio (DP id 31)
  - Inventario refacciones total (DP id 43) con breakdown:
    - Donut chart: Nuevo (DP id 51) | Movimiento (DP id 52) | Tec. obsoleto (DP id 53) | Obsoleto (DP id 54)
    - sub_valor = porcentaje del total
    - **Alerta**: >60% obsoleto en ambas sucursales — banner rojo
- [ ] **Seccion 3: Estado de Resultados Presupuestado** (fact_ppto_edr):
  - Tabla con columnas: Línea | Presupuesto (V1) | por seccion/rama/tipo
  - Diseñar layout para columna "Real" futura sin refactor
  - Banner informativo: "Datos contables reales no disponibles — mostrando presupuesto"
- [ ] **Seccion 4: KPIs Ventas Nuevos** (dealer profile P1 — Venta autos nuevos):
  - Grid de 7 KPIs con semaforizacion:
    - Ventas $ (DP id 1) | Ventas # (DP id 2) — cruce con fact_ventas para validacion
    - Utilidad bruta (DP id 3) | Margen promedio (DP id 5) — datos exclusivos de DP
    - Precio promedio (DP id 4) | Dias venta promedio (DP id 6) | Inventario (DP id 7)
  - Semaforizacion: verde/amarillo/rojo con umbrales por KPI
  - Comparativo mes actual vs anterior

---

## Fase 6: Refinamiento (Dias 10-12)

### 6.1 UX / Visual

- [ ] Responsive testing en mobile y tablet
- [ ] Loading states con `LoadingState` en cada pagina
- [ ] Error handling con fallback a mock data (patron del boilerplate)
- [ ] Animaciones de transicion entre paginas (framer-motion)

### 6.2 Performance

- [ ] Verificar que las MVs se refrescan correctamente tras ETL
- [ ] Indices adicionales si hay queries lentos
- [ ] Paginacion en tablas de detalle si >500 filas

---

## Fase 7: UAT + Deploy (Dias 12-15)

- [ ] Demo con datos reales al cliente
- [ ] Ajustes segun feedback
- [ ] Configurar cron en servidor de produccion
- [ ] Deploy backend (uvicorn + nginx)
- [ ] Deploy frontend (next build + next start o Vercel)
- [ ] Monitoreo: verificar `audit.log` y `etl.log`

---

## Riesgos y Mitigaciones

### R1: Calidad de datos — MITIGADO

Los filtros de calidad se aplican en la fase de transformacion de cada ETL, no al final:

| Problema | ETL donde se resuelve | Accion |
|----------|----------------------|--------|
| Descuentos con montos negativos | `etl_ventas.py` (Fase 1.1) | Excluir del conteo de unidades |
| `existencia` VARCHAR en refacciones | `etl_inv_refacciones.py` (Fase 2.3) | CAST a INT en transform, log y skip si falla |
| mui 7 Ensenada | Todos los queries SQL | Ya filtrado con `WHERE mui IN (6, 8)` — verificar en cada extract |
| Marcas "NO HONDA" / "ITALIKA" en servicio | `etl_servicio_kpi.py` (Fase 2.1) | Columna `es_honda` en fact para filtrar en reportes |
| `costo` siempre en cero en os_proceso | `etl_servicio_kpi.py` (Fase 2.1) | No cargar columna; usar `venta` y `venta_total_ref` |

### R2: Sin datos reales de contabilidad

`sicofi.balanza` no tiene datos para HONDA MOTOS. Solo existen presupuestos (`balanza_ppto`).

- **Impacto**: El Estado de Resultados en V1 solo muestra presupuesto, sin comparativo real vs ppto
- **Mitigacion**: Diseñar el endpoint y el frontend para funcionar solo con ppto. Agregar flag para activar columna "Real" cuando exista. No fallar si no hay datos reales.
- **Siguiente paso**: Preguntar al cliente si/cuando va a subir la balanza real, o si hay otra fuente contable.

### R3: Sin validacion post-ETL — MITIGADO

- `etl_validation.py` (Fase 1.5) corre despues de cada carga
- Compara row counts, sumas de control, detecta duplicados
- Integrado en cron para ejecucion automatica
- Exit codes permiten alertas automaticas

### R4: Dealer Profile — RESUELTO

Eran 60 KPIs (no 51). Tras análisis (ver `docs/dealer_profile_kpis.md`):
- 19 descartados (12 sin datos, 7 seminuevos sin actividad)
- 41 se cargan: 27 P1 (operativo diario) + 14 P2 (financiero mensual)
- Hallazgo para el cliente: 63-64% del inventario de refacciones es obsoleto

---

## Resumen de Archivos a Crear

```
data-pipeline/
  ddl/
    002_honda_motos.sql              # Dims y facts nuevos
  etl/scripts/
    etl_ventas.py                    # UPSERT ventas
    etl_plan_ventas.py               # UPSERT plan
    etl_flujos_piso.py               # UPSERT flujos
    etl_inventario.py                # Snapshot inventario
    etl_servicio_kpi.py              # UPSERT servicio KPIs
    etl_os_abierta.py                # Snapshot OS abiertas
    etl_inv_refacciones.py           # Snapshot refacciones
    etl_uio.py                       # UPSERT UIO
    etl_dealer_profile.py            # UPSERT dealer profile (subset curado)
    etl_ppto_servicio.py             # UPSERT ppto servicio
    etl_ppto_edr.py                  # UPSERT ppto EdR
    etl_validation.py                # Validaciones post-carga

backend/app/
  api/endpoints/
    ventas.py                        # Endpoints ventas
    postventa.py                     # Endpoints postventa
    inventario.py                    # Endpoints inventario
    financiero.py                    # Endpoints financiero
  services/
    ventas_service.py                # Queries ventas
    postventa_service.py             # Queries postventa
    inventario_service.py            # Queries inventario
    financiero_service.py            # Queries financiero

frontend/src/app/(dashboard)/
    ventas/page.tsx                  # Tablero ventas
    postventa/page.tsx               # Tablero postventa
    inventario/page.tsx              # Tablero inventario
    financiero/page.tsx              # Tablero financiero

docs/
    dealer_profile_kpis.md           # Mapeo curado de KPIs dealer profile
```

## Orden de Ejecucion Recomendado

> Cada fase se construye sobre la anterior. No avanzar sin verificar datos.

```
Fase 0 (setup + descubrimiento)
  |
  ├── 0.4 (dealer profile discovery) ─── se resuelve antes de Fase 2.5
  |
  v
Fase 1 (ETL ventas + validador)
  |
  v
Fase 3.1 (API ventas)  ──>  Fase 4 (Resumen home)
  |
  v
Fase 2 (ETL postventa)
  |
  v
Fase 3.2-3.4 (API postventa + financiero + inventario)
  |
  v
Fase 5 (tableros por modulo)
  |
  v
Fase 6 (refinamiento UX + performance)
  |
  v
Fase 7 (UAT + deploy)
```

**Ruta critica**: Fase 0 > 1 > 3.1 > 4 = primer demo funcional con ventas en ~5 dias.
