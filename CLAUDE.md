# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Dashboard de BI para **Honda Motos** — dos sucursales: **Tijuana (mui 6)** y **Mexicali (mui 8)**.
Ensenada (mui 7) esta cerrada y excluida de todo.

Stack: Next.js 14 + FastAPI + PostgreSQL DWH (Kimball) + Python ETL desde 3 MySQL sources.

## IMPORTANTE

**NUNCA usar el puerto 8000.** En ese puerto corre otro dashboard. Usar un puerto diferente para el backend (ej. `--port 8001`).

## Comandos

```bash
# --- Frontend ---
cd frontend && npm install && npm run dev    # Dev en :3000, proxy a :8001
npm run build                                 # Build produccion (static export)
npm run lint                                  # ESLint

# --- Backend (ejecutar desde raiz del proyecto) ---
source venv/bin/activate
uvicorn backend.app.main:app --reload --port 8001  # Dev en :8001, docs en /docs
# Health check: curl http://localhost:8001/api/v1/health

# --- ETL (ejecutar desde raiz del proyecto) ---
source venv/bin/activate
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_ventas.py --full
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_plan_ventas.py
PYTHONPATH=data-pipeline python data-pipeline/etl/scripts/etl_postventa_financiero.py --full
# ... demas scripts en data-pipeline/etl/scripts/

# Refresh vistas materializadas
PYTHONPATH=data-pipeline python data-pipeline/refresh_vistas.py

# Orquestacion cron (con flock para evitar concurrencia)
./data-pipeline/cron_etl.sh main        # Ventas, plan, flujos, inventario
./data-pipeline/cron_etl.sh secondary   # Postventa+financiero, OS, refacciones, UIO

# Cron activo: cada 2hrs al :15/:20, ventana 6am-8pm

# --- DDL (orden importa) ---
# Se ejecuta via Python (psql no tiene acceso directo):
# source venv/bin/activate && PYTHONPATH=data-pipeline python -c "..."
# DDLs: 001_schema_base.sql → 002_honda_motos.sql → 003_honda_motos_all_facts.sql → 004_refactor_financiero_postventa.sql
```

## Arquitectura

```
backend/app/
  main.py              # FastAPI + middlewares (CORS, rate limit 60/s, audit log, security headers)
  core/config.py       # pydantic-settings lee PG_*, CORS_ORIGINS, ENVIRONMENT de .env
  core/database.py     # SQLAlchemy engine + SessionLocal + get_db() dependency
  api/router.py        # Monta sub-routers en /api/v1/{modulo}
  api/endpoints/       # Handlers: ventas, postventa, financiero, inventario, auth, health
  services/            # financiero_service, postventa_service, ventas_service, inventario_service

frontend/src/
  app/(dashboard)/     # Pages: /, /ventas, /postventa, /inventario, /financiero
  app/login/           # Login con ParticleField animado
  components/ui/       # KPICard, DataGrid<T>, AgencyPills, MonthPicker, LoadingState
  components/layout/   # LayoutShell (sidebar+header), Sidebar, Header, ThemeToggle
  lib/api.ts           # Axios client con retry 3x en 5xx; funciones tipadas por endpoint
  lib/constants.ts     # CLIENT_NAME, CLIENT_TAGLINE, AGENCIES (para white-label)
  lib/utils.ts         # Formatters: fmtCurrency, fmtNumber, fmtPct, fmtDate (es-MX)

data-pipeline/
  etl/utils.py         # DatabaseConnector (singleton), read_sql_file, inject_params
  etl/extract/ventas/  # SQL: extract_ventas, extract_plan_ventas, extract_flujos_piso, extract_llegadavin_inventario
  etl/extract/postventa/  # SQL: extract_estado_resultados, extract_ppto_estado_resultados,
                          #      extract_contable_servicio, extract_venta_mo, extract_kpis_postventa,
                          #      extract_os_abierta, extract_os_abierta_detalle, extract_inv_refacciones, extract_UIO
  etl/scripts/         # ETL scripts: etl_ventas, etl_plan_ventas, etl_flujos_piso, etl_inventario,
                       #   etl_postventa_financiero (orquestador unificado), etl_os_abierta,
                       #   etl_inv_refacciones, etl_uio
  ddl/                 # 4 archivos DDL (ejecutar en orden numerico)
  scripts/             # EDA, exploracion, audit_integridad.py
  cron_etl.sh          # Orquestador con flock
  refresh_vistas.py    # Refresh de 3 MVs
```

## Patrones criticos de desarrollo

### Backend — SQL en servicios
- Usar `CAST(:param AS type)` en SQL, **nunca** `:param::type` (SQLAlchemy escapa `::`)
- Queries complejos van como raw SQL con `text()`, no ORM
- Dependency injection: `db: Session = Depends(get_db)`

### ETL — Dos patrones de carga
- **UPSERT** (datos transaccionales): `ON CONFLICT DO UPDATE` — usado en ventas, plan, KPIs, presupuestos, contable
- **DELETE+INSERT** (snapshots): borrar fecha_snapshot del dia + insertar — usado en inventario, OS abiertas
- CLI args: `--full` (historico completo), `--dias N` (ventana deslizante, default 90)
- Ventas: dedup por VIN (una moto cancelada y re-vendida cuenta como 1 venta, la mas reciente)

### Frontend — Patron de pagina
- `"use client"` + useState para mes/mui/loading/data + fetchError
- useEffect fetch cuando cambian filtros (anio_mes, mui)
- AgencyPills + MonthPicker arriba, KPICards + DataGrid abajo
- LoadingState con skeletons mientras carga
- Banner de error rojo cuando API falla (sin datos mock)
- next.config.js hace proxy `/api/*` → `:8001` en dev

## Bases de datos origen

Todas en el mismo host. Credenciales en `.env` con prefijos.
**NOTA**: passwords contienen `*)`, no usar `source .env` en bash (python-dotenv los carga).

| Prefijo     | Schema   | Contenido                                           |
|-------------|----------|-----------------------------------------------------|
| `METRICS_`  | metrics  | Servicio, OS, refacciones, UIO                      |
| `SICOFI_`   | sicofi   | Contabilidad: balanza, presupuestos, catalogos      |
| `HMCRM_`    | hmcrm    | CRM: contactos, ventas, plan, inventario            |

Conectores en `etl/utils.py`: `postgres`, `mysql`, `metrics`, `hmcrm`, `sicofi`

## Identificadores de sucursal (MUI = marca_unidad_id)

| Sistema | Tijuana (mui 6) | Mexicali (mui 8) | Ensenada (NO USAR) |
|---------|-----------------|-------------------|---------------------|
| metrics | `marca_unidad_id = 6` | `marca_unidad_id = 8` | `7` (cerrada) |
| sicofi balanza_ppto | `HONDA MOTOS` term `1` | term `2` | term `3` |
| sicofi balanza (reales) | cb=`HONDA MOTOS` b=`HONDA` term `4` | term `6` | term `5` |
| hmcrm | `hus_ciudad='Tijuana'` / `plv_id_agencia=1` | `hus_ciudad='Mexicali'` / `plv_id_agencia=2` | — |
| servicio_ventas (prefijo factura) | `SMT` | `SMM` | — |

## DWH PostgreSQL — Schema `dwh` (Kimball)

DDLs en `data-pipeline/ddl/` (ejecutar en orden 001 → 002 → 003 → 004).

### Tablas de hechos

| Tabla | Patron | Fuente | Conflict keys |
|-------|--------|--------|---------------|
| `fact_ventas` | UPSERT | hmcrm | id_oportunidad (=VIN) |
| `fact_plan` | UPSERT | hmcrm | anio_mes, id_sucursal, modelo |
| `fact_flujos_piso` | UPSERT | hmcrm | fecha, id_sucursal |
| `fact_inventario` | DELETE+INSERT | hmcrm | fecha_snapshot |
| `fact_os_abierta` | DELETE+INSERT | metrics | fecha_snapshot |
| `fact_os_abierta_detalle` | DELETE+INSERT | metrics | fecha_snapshot |
| `fact_inv_refacciones` | UPSERT | metrics | fecha_snapshot, id_sucursal |
| `fact_uio` | UPSERT | metrics | fecha_snapshot, id_sucursal |
| `fact_estado_resultados` | UPSERT | sicofi.balanza | fecha, mui, seccion, rama, tipo |
| `fact_ppto_estado_resultados` | UPSERT | sicofi.balanza_ppto | fecha, mui, seccion, rama, tipo |
| `fact_postventa_kpis` | UPSERT | metrics | fecha, mui |
| `fact_contable_servicio` | UPSERT | sicofi.balanza | fecha, mui, tipo |
| `fact_ticket_promedio` | UPSERT | CSV manual | fecha, mui |

### Tablas eliminadas (refactor 2026-04-01)
- `fact_dealer_profile` → reemplazada por fact_estado_resultados + fact_contable_servicio + fact_postventa_kpis
- `fact_servicio_kpi` → reemplazada por fact_postventa_kpis
- `fact_ppto_servicio` → subsumida por fact_ppto_estado_resultados
- `fact_ppto_edr` → reemplazada por fact_ppto_estado_resultados

### Vistas materializadas
- `mv_kpis_mensual` — ventas + plan + cumplimiento + YoY
- `mv_cumplimiento_ventas` — ventas vs plan por modelo
- `mv_aging_inventario` — distribucion aging por sucursal

## API Endpoints

Base: `/api/v1/`. Params comunes: `anio_mes: str` (YYYY-MM), `mui: int` (6 o 8, opcional).

- **ventas/**: resumen, tendencia, por-modelo, flujos, detalle, cumplimiento-pacing (devuelve `{total, sucursales[]}` con ventas al 'mismo día' vs plan prorrateado, mes anterior y año anterior — usado por las cards por sucursal del Resumen Ejecutivo)
- **postventa/**: summary (OTs, horas, venta total/MO contable, ticket, plan), trend, os-abiertas, os-abiertas/detalle, refacciones, uio
- **financiero/**: financials (UB, UO, absorcion, gastos desglosados, ppto, EdR detalle, acumulado YTD)
- **inventario/**: aging, detalle
- **health/**: GET / (status check)

### Formulas financieras (de fact_estado_resultados)
- **Utilidad Bruta** = SUM(monto) WHERE seccion IN ('INGRESOS','COSTOS')
- **Utilidad Operacion** = SUM(monto) WHERE seccion IN ('INGRESOS','COSTOS','GASTOS')
- **Tasa Absorcion** = UB Postventa / (Gastos Fijos + Comisiones Servicio + Otros Gastos) × 100
- En ppto (balanza_ppto) los montos son positivos → resta explicita: Ingresos - Costos - Gastos

## Alertas de calidad de datos

- **Tecate**: 191 registros en hmcrm — excluidos con `hus_ciudad IN ('Tijuana', 'Mexicali')`
- **VINs duplicados**: deduplicados por VIN en ETL (venta cancelada + re-venta = 1 venta, la mas reciente)
- **servicio_ventas**: telefono 77% vacio, numero_cliente 52% vacio, marca incluye "NO HONDA"/"ITALIKA"
- **os_proceso.costo**: 100% cero — usar `venta` y `costo_refaccion`/`venta_total_ref`
- **refacciones_inventario.existencia**: VARCHAR, requiere CAST
- **sicofi.balanza**: datos Honda Motos bajo marca='HONDA' con terminaciones 4/5/6 (no 'HONDA MOTOS' directo)
- **sicofi.balanza_ppto**: falta 2023, `acumulado` siempre cero (usar `mensual`)

## Convenciones

- MUI = marca_unidad_id (identificador universal de sucursal)
- Queries SQL usan `mui` como alias de salida para el ID de sucursal
- Endpoints API: `/api/v1/<modulo>/<accion>`
- Frontend components: PascalCase, un archivo por componente
- Branding Honda: rojo `#CC0000` primary, gris `#333` secondary, rojo `#E53935` accent
- CSS variables en `frontend/src/app/globals.css` (light + dark mode)
- White-label: cambiar `CLIENT_NAME`/`CLIENT_TAGLINE` en `constants.ts` + CSS vars + logo en `public/`
