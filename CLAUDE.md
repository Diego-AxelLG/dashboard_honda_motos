# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Dashboard de BI para **Honda Motos** — dos sucursales: **Tijuana (mui 6)** y **Mexicali (mui 8)**.
Ensenada (mui 7) esta cerrada y excluida de todo.

Stack: Next.js 14 + FastAPI + PostgreSQL DWH (Kimball) + Python ETL desde 3 MySQL sources + CSVs manuales.

## IMPORTANTE

**NUNCA usar el puerto 8000.** En ese puerto corre otro dashboard (ops-platform). Usar un puerto diferente para el backend (`--port 8001`).

## Comandos

```bash
# --- Frontend ---
cd frontend && npm install && npm run dev    # Dev en :3000, proxy a :8001
npm run build                                 # Build produccion (static export)
npm run lint                                  # ESLint

# --- Backend (ejecutar desde raiz del proyecto) ---
source venv/bin/activate
uvicorn backend.app.main:app --reload --port 8001  # Dev en :8001, docs en /docs
# Health check: curl http://localhost:8001/api/v1/health/

# --- ETL (ejecutar desde raiz del proyecto) ---
source venv/bin/activate
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py --full
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_plan_csv.py        # Plan motos + postventa desde CSV
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_postventa_financiero.py --full
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ppto_derivado.py [--force]  # Ppto 2026 = real 2025 x 1.10
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_cobranza.py        # CxC + transición compromisos
# ... demas scripts en data-pipeline/etl/scripts/

# Refresh vistas materializadas
PYTHONPATH=data-pipeline python data-pipeline/refresh_vistas.py

# Orquestacion cron (con flock para evitar concurrencia)
./data-pipeline/cron_etl.sh main        # Ventas, plan_csv, flujos, inventario
./data-pipeline/cron_etl.sh secondary   # Postventa+financiero, ppto_derivado, OS, cobranza, refacciones, UIO

# Cron activo: cada hora 24/7 (15 * * * * main, 20 * * * * secondary)

# --- DDL (orden importa) ---
# Se ejecuta via Python (psql no tiene acceso directo):
# source venv/bin/activate && PYTHONPATH=data-pipeline python -c "..."
# DDLs (en orden): 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009
```

## Arquitectura

```
backend/app/
  main.py              # FastAPI + middlewares (CORS, rate limit 60/s sólo en prod, audit log, security headers)
  core/config.py       # pydantic-settings lee PG_*, CORS_ORIGINS, ENVIRONMENT de .env
  core/database.py     # SQLAlchemy engine + SessionLocal + get_db() dependency
  api/router.py        # Monta sub-routers en /api/v1/{modulo}
  api/endpoints/       # Handlers: ventas, postventa, financiero, inventario, auth, health, cinco_alas, cobranza
  services/            # financiero_service, postventa_service, ventas_service, inventario_service, cobranza_service

frontend/src/
  app/(dashboard)/     # Pages: /, /ventas, /postventa, /inventario, /financiero, /cinco-alas, /cobranza
  app/login/           # Login con ParticleField animado
  components/ui/       # KPICard, DataGrid<T>, AgencyPills, MonthPicker, LoadingState, UltimaActualizacion
  components/cobranza/ # CXCTable, CXCDetailPanel, OSAbiertasTable, OSAbiertasDetailPanel, CompromisoSection
  components/layout/   # LayoutShell (sidebar+header), Sidebar, Header, ThemeToggle
  lib/api.ts           # Axios client con retry 3x en 5xx; funciones tipadas por endpoint
  lib/constants.ts     # CLIENT_NAME, CLIENT_TAGLINE, AGENCIES (para white-label)
  lib/utils.ts         # Formatters: fmtCurrency, fmtNumber, fmtPct, fmtDate (es-MX)

data-pipeline/
  etl/utils.py         # DatabaseConnector (singleton), read_sql_file, inject_params
  etl/extract/ventas/  # SQL: extract_ventas (incluye id_vendedor), extract_flujos_piso, extract_inventario_detallado, extract_llegadavin_inventario
                       # NOTA: extract_plan_ventas.sql ya no se usa — el plan viene del CSV
  etl/extract/postventa/  # SQL: extract_estado_resultados (>=2024), extract_ppto_estado_resultados (>=2024),
                          #      extract_contable_servicio, extract_venta_mo, extract_kpis_postventa,
                          #      extract_os_abierta, extract_os_abierta_detalle, extract_inv_refacciones, extract_UIO
  etl/scripts/         # ETL scripts: etl_ventas (puebla dim_vendedores e id_vendedor),
                       #   etl_plan_csv (carga Plan_5_alas + plan_postventa desde CSV),
                       #   etl_flujos_piso, etl_inventario,
                       #   etl_postventa_financiero (orquestador unificado),
                       #   etl_ppto_derivado (genera ppto 2026 = real 2025 x 1.10),
                       #   etl_os_abierta, etl_inv_refacciones, etl_uio
                       # NOTA: etl_plan_ventas.py queda en disco pero NO está en cron (reemplazado por etl_plan_csv.py)
  csv/                 # Plan_5_alas.csv (motos), plan_postventa_2026.csv (3 bloques: mostrador/MO/taller)
  ddl/                 # 9 archivos DDL (ejecutar en orden numerico)
  scripts/             # EDA, exploracion, audit_integridad.py
  cron_etl.sh          # Orquestador con flock
  refresh_vistas.py    # Refresh de 3 MVs
```

## Patrones criticos de desarrollo

### Backend — SQL en servicios
- Usar `CAST(:param AS type)` en SQL, **nunca** `:param::type` (SQLAlchemy escapa `::`)
- Queries complejos van como raw SQL con `text()`, no ORM
- Dependency injection: `db: Session = Depends(get_db)`

### Backend — Rate limit
- `RateLimitMiddleware` en `main.py` aplica 60 req/min/IP **solo en producción** (`ENVIRONMENT='production'`).
- En dev se bypassa porque todo el tráfico llega por proxy desde Next.js como 127.0.0.1, lo que saturaría el bucket.
- Si añades nuevos middlewares condicionales, usa la misma checazón `_is_prod`.

### Backend — Endpoints con timestamp ISO
- Para devolver `timestamptz` al frontend, usa `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`.
- `CAST(... AS text)` produce `+00` (sin minutos) que rompe `new Date()` en V8/Safari → `NaN`.

### ETL — Dos patrones de carga
- **UPSERT** (datos transaccionales): `ON CONFLICT DO UPDATE` — usado en ventas, plan, KPIs, presupuestos, contable
- **DELETE+INSERT** (snapshots): borrar fecha_snapshot del dia + insertar — usado en inventario, OS abiertas
- CLI args: `--full` (historico completo), `--dias N` (ventana deslizante, default 90)
- Ventas: dedup por VIN (una moto cancelada y re-vendida cuenta como 1 venta, la mas reciente)

### ETL — Plan via CSV (no hmcrm)
- El plan de motos vino históricamente de hmcrm; se reemplazó por **CSV manual** (`Plan_5_alas.csv`) porque hmcrm tenía valores inflados.
- `etl_plan_csv.py` hace **DELETE 2026 + INSERT** del CSV (sobreescribe limpio).
- El `modelo` en `fact_plan` es `'TOTAL'` (sin desagregar) cuando viene del CSV.
- `etl_plan_ventas.py` (hmcrm) sigue en disco pero está fuera del cron — no correrlo.

### ETL — Ppto / plan derivado
`etl_ppto_derivado.py` genera DOS cosas para el año destino (default 2026) a partir del real del año origen (default 2025) × factor (default 1.10):

1. **`fact_ppto_estado_resultados`** (financiero) desde `fact_estado_resultados`.
   - Aplica a TODAS las secciones (INGRESOS, COSTOS, GASTOS) preservando granularidad rama/tipo/sucursal.
   - **Convención de signos**: el real tiene COSTOS/GASTOS negativos (signo contable); el ppto los necesita positivos (convención balanza_ppto). El script invierte signos: `CASE WHEN seccion IN ('COSTOS','GASTOS') THEN -monto ELSE monto END * factor`.

2. **`fact_plan_postventa` con `tipo='ots'`** (operación postventa) desde `fact_postventa_kpis.cantidad`.
   - Agrega por mes/mui (la fuente es diaria) y multiplica por el factor.
   - Comparte tabla con los otros tipos de plan postventa (mostrador/MO/taller que sí vienen del CSV).

**Política común**: `ON CONFLICT DO UPDATE` — el derivado SIEMPRE GANA. Si en el futuro llega ppto real 2026 desde sicofi (o un CSV de plan OTs), este script lo sobreescribe en la siguiente corrida. La regla del negocio es: 2026 = real 2025 × 1.10 fija.

`--force`: borra el año destino completo antes del INSERT (útil si una rama/tipo desapareció en 2025 y quieres limpiar huérfanos en 2026).

### Frontend — Patron de pagina
- `"use client"` + useState para mes/mui/loading/data + fetchError
- useEffect fetch cuando cambian filtros (anio_mes, mui)
- AgencyPills + MonthPicker arriba, KPICards + DataGrid abajo
- LoadingState con skeletons mientras carga
- Banner de error rojo cuando API falla (sin datos mock)
- next.config.js hace proxy `/api/*` → `:8001` en dev
- `<UltimaActualizacion etls={[...]}/>` en cada page muestra "Hace N min" del ETL más viejo de los relevantes
- `MonthPicker min`:
  - `/ventas`, `/inventario`, `/financiero`: `min="2024-01"` (acceso histórico)
  - `/`, `/postventa`: `min="2026-01"` (solo año fiscal vigente)

## Bases de datos origen

Todas en el mismo host. Credenciales en `.env` con prefijos.
**NOTA**: passwords contienen `*)`, no usar `source .env` en bash (python-dotenv los carga).

| Prefijo     | Schema   | Contenido                                           |
|-------------|----------|-----------------------------------------------------|
| `METRICS_`  | metrics  | Servicio, OS, refacciones, UIO                      |
| `SICOFI_`   | sicofi   | Contabilidad: balanza, presupuestos, catalogos      |
| `HMCRM_`    | hmcrm    | CRM: contactos, ventas, inventario (plan ya NO)     |

Conectores en `etl/utils.py`: `postgres`, `mysql`, `metrics`, `hmcrm`, `sicofi`

**Fuentes manuales**:
- `data-pipeline/csv/Plan_5_alas.csv` — plan motos por mes/sucursal (sin modelo)
- `data-pipeline/csv/plan_postventa_2026.csv` — plan postventa $$$, 3 bloques apilados (Refacciones Mostrador / Mano de Obra / Refacciones Taller)

**Fuentes derivadas** (no requieren input manual):
- `fact_plan_postventa` con `tipo='ots'` — derivado de `fact_postventa_kpis.cantidad` 2025 × 1.10 por `etl_ppto_derivado.py`

## Identificadores de sucursal (MUI = marca_unidad_id)

| Sistema | Tijuana (mui 6) | Mexicali (mui 8) | Ensenada (NO USAR) |
|---------|-----------------|-------------------|---------------------|
| metrics | `marca_unidad_id = 6` | `marca_unidad_id = 8` | `7` (cerrada) |
| sicofi balanza_ppto | `HONDA MOTOS` term `1` | term `2` | term `3` |
| sicofi balanza (reales) | cb=`HONDA MOTOS` b=`HONDA` term `4` | term `6` | term `5` |
| hmcrm | `hus_ciudad='Tijuana'` / `plv_id_agencia=1` | `hus_ciudad='Mexicali'` / `plv_id_agencia=2` | — |
| servicio_ventas (prefijo factura) | `SMT` | `SMM` | — |

## DWH PostgreSQL — Schema `dwh` (Kimball)

DDLs en `data-pipeline/ddl/` (ejecutar en orden 001 → … → 008).

### Tablas de hechos

| Tabla | Patron | Fuente | Conflict keys |
|-------|--------|--------|---------------|
| `fact_ventas` | UPSERT | hmcrm | id_oportunidad (=VIN) |
| `fact_plan` | DELETE+INSERT (2026) | **CSV manual** | anio_mes, id_sucursal, modelo |
| `fact_plan_postventa` | UPSERT | **CSV manual** + `etl_ppto_derivado` (tipo='ots') | anio_mes, id_sucursal, tipo |
| `fact_flujos_piso` | UPSERT | hmcrm | fecha, id_sucursal |
| `fact_inventario` | DELETE+INSERT | hmcrm | fecha_snapshot |
| `fact_os_abierta` | DELETE+INSERT | metrics | fecha_snapshot |
| `fact_os_abierta_detalle` | DELETE+INSERT | metrics | fecha_snapshot |
| `fact_inv_refacciones` | UPSERT | metrics | fecha_snapshot, id_sucursal |
| `fact_uio` | UPSERT | metrics | fecha_snapshot, id_sucursal |
| `fact_estado_resultados` | UPSERT | sicofi.balanza | fecha, mui, seccion, rama, tipo |
| `fact_ppto_estado_resultados` | UPSERT (sicofi) + UPSERT 2026 derivado | sicofi.balanza_ppto + `etl_ppto_derivado` | fecha, mui, seccion, rama, tipo |
| `fact_postventa_kpis` | UPSERT | metrics | fecha, mui |
| `fact_contable_servicio` | UPSERT | sicofi.balanza | fecha, mui, tipo |
| `fact_ticket_promedio` | UPSERT | CSV manual | fecha, mui |
| `fact_cxc_detalle` | DELETE+INSERT | sicofi.cxc_intelisis | fecha_snapshot, id_sucursal, movimiento |
| `fact_compromiso_cxc` | INSERT-only (estado mutado por ETL) | UI + ETL desde observaciones | índice parcial único (mov, id_sucursal) WHERE estado='activo' |
| `fact_compromiso_os` | INSERT-only (estado mutado por ETL) | UI + ETL desde situacion | índice parcial único (numero_ot, id_sucursal) WHERE estado='activo' |

### Dimensiones

| Tabla | Notas |
|-------|-------|
| `dim_sucursales` | Seed (TJ=6, MX=8) |
| `dim_tiempo` | Calendario |
| `dim_vendedores` | **Poblada** desde `etl_ventas` (extracción `hus_IDhuser` de hmcrm). `activo=true` cuando `hus_status='Empleado'` |

### Tabla de control

`dwh.etl_last_run` — últimas corridas exitosas. Filas activas:
`ventas, plan_csv, flujos_piso, inventario, postventa_financiero, ppto_derivado, os_abierta, cobranza, inv_refacciones, uio`.

Eliminadas históricamente (no usar): `plan_ventas, estado_resultados, contable_servicio` (los dos últimos quedaban huérfanos porque `etl_postventa_financiero` solo registra bajo su propio nombre).

### Vistas materializadas
- `mv_kpis_mensual` — ventas + plan + cumplimiento + YoY
- `mv_cumplimiento_ventas` — ventas vs plan por modelo
- `mv_aging_inventario` — distribucion aging por sucursal

## API Endpoints

Base: `/api/v1/`. Params comunes: `anio_mes: str` (YYYY-MM), `mui: int` (6 o 8, opcional).

- **ventas/**: resumen, tendencia, por-modelo, flujos, detalle (incluye campo `asesor`), cumplimiento-pacing, **por-asesor-modelo** (agregado por asesor + modelo + sucursal con `unidades, contado, financiado`)
- **postventa/**: summary (OTs, horas, venta total/MO contable, ticket, plan), trend, ots-tendencia, os-abiertas, os-abiertas/detalle, refacciones, uio, **plan** (mano_obra, refacciones_mostrador, refacciones_taller, ots por sucursal)
- **financiero/**: financials (UB, UO, absorcion, gastos desglosados, ppto incluyendo `ppto_ub_postventa` y `ppto_ingresos_servicio`, EdR detalle, acumulado YTD)
- **inventario/**: aging, resumen-stock (incluye `vta_3m` y `vta_3m_total`), detalle, apartados
- **health/**: GET / (status check), **GET /etl** (last_run por etl_name; usa `to_char` ISO 8601 para evitar NaN en parser JS)
- **cinco-alas/**: catalogo, evaluacion, evaluaciones, precalculo, resumen-actual
- **cobranza/**: cxc (summary), cxc/detalle, cxc/compromisos (GET historial + POST crear), cxc/compromisos/{id} (PATCH editar), os-abiertas (summary), os-abiertas/detalle, os-abiertas/compromisos (GET + POST), os-abiertas/compromisos/{id} (PATCH)

### Formulas financieras (de fact_estado_resultados)
- **Utilidad Bruta** = SUM(monto) WHERE seccion IN ('INGRESOS','COSTOS')
- **Utilidad Operacion** = SUM(monto) WHERE seccion IN ('INGRESOS','COSTOS','GASTOS')
- **Tasa Absorcion** = UB Postventa / (Gastos Fijos + Comisiones Servicio + Otros Gastos) × 100
- En ppto (balanza_ppto / derivado) los montos son positivos → resta explicita: Ingresos - Costos - Gastos

### Ingresos contables (fact_contable_servicio)
- `tipo='Ingreso'` = TOTAL postventa (mostrador + taller + MO) — sin filtro de tipo en SQL.
- `tipo='MO'` = solo Mano de Obra — subset (`cb.tipo='MO'`).
- Refacciones derivado = `Ingreso − MO`.

### Inventario — Meses de inventario
- `vta_3m` = promedio mensual de ventas de los últimos 3 meses por (sucursal, modelo).
- `meses_inventario = total_stock / vta_3m`. Si `vta_3m = 0` o NULL → meses = NULL (mostrar `—`).

## Alertas de calidad de datos

- **Tecate**: 191 registros en hmcrm — excluidos con `hus_ciudad IN ('Tijuana', 'Mexicali')`
- **VINs duplicados**: deduplicados por VIN en ETL (venta cancelada + re-venta = 1 venta, la mas reciente)
- **VINs sin asesor**: ~6 ventas históricas tienen `id_vendedor=NULL` (no estaban asignadas en hmcrm). Aparecen como "Sin asignar" en el ranking.
- **servicio_ventas**: telefono 77% vacio, numero_cliente 52% vacio, marca incluye "NO HONDA"/"ITALIKA"
- **os_proceso.costo**: 100% cero — usar `venta` y `costo_refaccion`/`venta_total_ref`
- **refacciones_inventario.existencia**: VARCHAR, requiere CAST
- **sicofi.balanza**: datos Honda Motos bajo marca='HONDA' con terminaciones 4/5/6 (no 'HONDA MOTOS' directo)
- **sicofi.balanza_ppto**: cubre 2024-2025; **2026 NO existe en la fuente**, se genera con `etl_ppto_derivado` (real 2025 × 1.10).
- **Plan motos**: el de hmcrm estaba inflado (~10-15% más que la meta real). Reemplazado por CSV `Plan_5_alas.csv`.

## Convenciones

- MUI = marca_unidad_id (identificador universal de sucursal)
- Queries SQL usan `mui` como alias de salida para el ID de sucursal
- Endpoints API: `/api/v1/<modulo>/<accion>`
- Frontend components: PascalCase, un archivo por componente
- Branding Honda: rojo `#CC0000` primary, gris `#333` secondary, rojo `#E53935` accent
- CSS variables en `frontend/src/app/globals.css` (light + dark mode)
- White-label: cambiar `CLIENT_NAME`/`CLIENT_TAGLINE` en `constants.ts` + CSS vars + logo en `public/`

## Operación / runbook

### Cuando llega CSV nuevo de plan (motos o postventa)
1. Reemplazar archivo en `data-pipeline/csv/`. Mantener nombres exactos: `Plan_5_alas.csv`, `plan_postventa_2026.csv`.
2. Año actual hardcoded a 2026 en `etl_plan_csv.py:ANIO`. Cambiar al rolar año.
3. Esperar al próximo cron (15 min máx) o correr manual: `PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_plan_csv.py`.

### Cuando se quiere refrescar el ppto derivado tras cambios en real 2025
- `PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ppto_derivado.py` — UPSERT idempotente (sobreescribe).
- Con `--force` para limpiar filas huérfanas (rama/tipo que ya no existe en 2025).

### Cobranza — sistema de compromisos
- **Tablas:** `fact_cxc_detalle` (snapshot diario desde sicofi), `fact_compromiso_cxc`, `fact_compromiso_os`.
- **Umbrales CxC (en extract):** dias_vencido > 30 (general), > 60 (Siniestros/Garantias). Solo `cxc.cxc_marca='HONDA MOTOS'`, sucursales 1→6 / 2→8.
- **Compromisos:** UI crea con `registrado_por='dashboard'` (15/30/45/60 d); ETL crea con `registrado_por='CRM'` (60 d fijos) cuando detecta cambios en `observaciones` (CxC) o `situacion` (OS) entre snapshots.
- **Máquina de estados:** activo → vencido (fecha pasada Y sigue en snapshot) → cumplido (ya no aparece en snapshot = se cobró/cerró).
- **Garantía 1 activo:** índice parcial único `(key, id_sucursal) WHERE estado='activo'` previene duplicados entre UI y CRM.
- **Page `/cobranza`:** AgencyPills + 2 tablas pivot (CxC por categoria, OS por tipo_orden). Click en fila abre drill-down con compromisos. **NO usa MonthPicker** (siempre último snapshot).
- **OS-abiertas en cobranza vs postventa:** ambos endpoints existen. El de `/postventa/os-abiertas` queda para la página de postventa (vista simple); el de `/cobranza/os-abiertas` filtra `monto_venta > 1` y trae el JOIN de compromisos. NO consolidar.
- **Categoria 'Facturas empleados':** se excluye del cálculo de "Saldo total" en CxCTable y muestra "Descuento via nomina" en lugar de formulario de compromiso (regla del negocio: descuento por nómina).

### Cuando se rola año fiscal
1. Actualizar `ANIO_ORIGEN` y `ANIO_DESTINO` en `etl_ppto_derivado.py`.
2. Actualizar `ANIO` en `etl_plan_csv.py`.
3. Reemplazar CSVs con datos del nuevo año.
4. Considerar actualizar `min` de los `MonthPicker` en `/` y `/postventa`.
