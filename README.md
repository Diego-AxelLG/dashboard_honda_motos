# BI Dashboard Boilerplate

Plataforma de inteligencia de negocios lista para desplegar. Conecta sistemas operativos (CRM, ERP, contabilidad) y centraliza KPIs en un dashboard ejecutivo en tiempo real.

Extraído y generalizado del proyecto Grupo Optima (7 agencias, 3 marcas, +60K registros de ventas).

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| ETL | Python, pandas, SQLAlchemy, cron + flock |
| DWH | PostgreSQL 15, esquema Kimball (star schema) |
| API | FastAPI, Pydantic v2, SQLAlchemy (sync) |
| UI | Next.js 14, React 18, TypeScript, TailwindCSS, Tremor v3, Recharts |

## Quickstart (nuevo cliente)

```
1. Clonar este repo y renombrar el proyecto
2. Crear .env con credenciales del cliente (ver .env.example)
3. Ejecutar DDL base:
     psql -U postgres -d <db> -f data-pipeline/ddl/001_schema_base.sql
4. Adaptar SQL de extracción (etl/extract/) a la estructura del CRM/ERP origen
5. Personalizar marca:
     - Colores: frontend/src/app/globals.css (CSS variables)
     - Logo: frontend/public/
     - Nombre: frontend/src/lib/constants.ts
     - Sucursales: frontend/src/lib/constants.ts + backend config
6. Levantar:
     uvicorn backend.app.main:app --reload
     cd frontend && npm install && npm run dev
7. Primer demo funcional en ~5 días
```

## Estructura

```
_boilerplate/
├── README.md                           # Este archivo
│
├── data-pipeline/                      # ETL + DWH schema
│   ├── README.md                       # Arquitectura ETL, patrones, setup
│   ├── requirements.txt                # pandas, sqlalchemy, psycopg2, etc.
│   ├── cron_etl.sh                     # Orquestación cron con flock
│   ├── refresh_vistas.py               # Refresca materialized views
│   ├── ddl/
│   │   └── 001_schema_base.sql         # Schema Kimball: dims + facts + MV
│   └── etl/
│       ├── utils.py                    # DatabaseConnector, logger, read_sql_file
│       ├── extract/
│       │   ├── extract_ventas.sql              # Query simple de extracción
│       │   ├── extract_ventas_ejemplo.sql      # Con CASE WHEN, JOINs, mapeos
│       │   └── extract_tickets_abiertos.sql    # Para snapshot diario
│       └── scripts/
│           ├── etl_ejemplo.py                  # ETL incremental (--full, --dias N)
│           └── etl_snapshot_ejemplo.py         # DELETE+INSERT por fecha
│
├── backend/                            # API REST (FastAPI)
│   ├── README.md
│   ├── requirements.txt
│   └── app/
│       ├── main.py                     # Entrypoint FastAPI + CORS
│       ├── core/
│       │   ├── config.py               # pydantic-settings (lee PG_* de .env)
│       │   └── database.py             # Engine + get_db dependency
│       ├── api/
│       │   ├── router.py               # Router principal (monta endpoints)
│       │   └── endpoints/
│       │       ├── health.py           # GET /health + última actualización ETL
│       │       ├── resumen.py          # KPIs + charts (ejemplo con raw SQL)
│       │       └── auth.py             # Placeholder autenticación
│       ├── middleware/
│       │   └── audit_log.py            # Logging de requests
│       └── services/
│           ├── example_service.py      # Patrón de servicio con queries
│           └── matrix_service.py       # Ejemplo pandas en endpoint
│
└── frontend/                           # Dashboard (Next.js 14)
    ├── README.md
    ├── package.json
    ├── next.config.js                  # Proxy API en dev
    ├── tailwind.config.ts              # Tema dark + colores custom
    ├── tsconfig.json
    ├── postcss.config.js
    └── src/
        ├── app/
        │   ├── layout.tsx              # Root layout + LayoutShell
        │   ├── globals.css             # CSS variables (colores de marca)
        │   ├── login/page.tsx          # Login con ParticleField
        │   └── (dashboard)/page.tsx    # Página Resumen (home)
        ├── components/
        │   ├── layout/
        │   │   ├── LayoutShell.tsx     # Sidebar + Header wrapper
        │   │   ├── Sidebar.tsx         # Navegación lateral responsive
        │   │   ├── Header.tsx          # Top bar + MonthPicker
        │   │   └── ThemeToggle.tsx     # Dark/light mode
        │   ├── login/
        │   │   └── ParticleField.tsx   # Fondo animado interactivo
        │   └── ui/
        │       ├── index.ts            # Re-exports
        │       ├── KPICard.tsx         # Tarjeta de KPI reutilizable
        │       ├── DataGrid.tsx        # Grid + Detail Panel (drill-down)
        │       ├── AgencyPills.tsx     # Filtro por sucursal (pills)
        │       ├── MonthPicker.tsx     # Selector de mes global
        │       └── LoadingState.tsx    # Skeleton loading
        └── lib/
            ├── api.ts                  # Cliente Axios centralizado
            ├── constants.ts            # Sucursales, marcas, colores
            └── utils.ts               # Formatters (moneda, %, fechas)
```

## Tiempo estimado por fase

| Fase | Días |
|------|------|
| Setup infra + marca (colores, logo, sucursales) | 1 |
| Conectar fuente de datos + ETL base | 2-3 |
| Primer tablero funcional (Resumen con KPIs) | 1-2 |
| Tableros adicionales (Ventas, Inventario, etc.) | 2-3 c/u |
| UAT + ajustes con el cliente | 2-3 |

Primer demo con datos reales: **~5 días hábiles** desde kick-off.

## Patrones incluidos

### Grid + Detail Panel (drill-down)
Grilla de tarjetas por sucursal. Click en una tarjeta expande un panel con tabla de registros individuales. El panel hace su propio fetch con el ID de la sucursal seleccionada.

### White-label (cambio de marca en 5 min)
- **Colores**: CSS variables en `globals.css` (`--brand-primary`, `--brand-secondary`)
- **Logo**: archivo en `frontend/public/`
- **Nombre y sucursales**: `frontend/src/lib/constants.ts`
- **Tema oscuro/claro**: `ThemeToggle.tsx` + Tailwind `dark:` variants

### ETL incremental + snapshot
- **Incremental** (UPSERT): para datos transaccionales con clave de negocio (`etl_ejemplo.py`)
- **Snapshot** (DELETE+INSERT): para estado actual de sistemas origen (`etl_snapshot_ejemplo.py`)
- **Ventana deslizante**: `--full`, `--dias N`, default 90 días

### Star schema Kimball
- `dim_tiempo` (2020-2030), `dim_sucursales`, `dim_vendedores`
- `fact_ventas`, `fact_inventario`, `fact_plan`
- Agregar dimensiones y hechos según el negocio del cliente

### SQL crudo optimizado
La API usa `text()` de SQLAlchemy para queries complejas con CTEs y window functions. El ORM se usa solo para operaciones simples. Nunca `CAST(:param::type)` — siempre `CAST(:param AS type)` (SQLAlchemy trata `::` como escape).

### Vistas materializadas
KPIs pre-calculados en `mv_kpis_mensual`. Se refrescan después de cada ETL con `refresh_vistas.py`. Requieren índice único para `REFRESH CONCURRENTLY`.

## Variables de entorno

```env
# PostgreSQL (destino)
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=
PG_DATABASE=

# MySQL (origen)
MYSQL_HOST=
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=

# ETL
DIAS_VENTANA=90
FECHA_INICIO=2024-01-01
SUCURSALES_PERMITIDAS=1, 2, 3

# Frontend
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Convenciones

| Concepto | Convención |
|----------|-----------|
| Schema DWH | `dwh` en PostgreSQL |
| Dimensiones | `dwh.dim_*` |
| Hechos | `dwh.fact_*` |
| Vistas materializadas | `dwh.mv_*` |
| DDL | Numerados: `001_`, `002_`, ... ejecutar en orden |
| Endpoints API | `/api/v1/<modulo>/<accion>` |
| Componentes UI | PascalCase, un archivo por componente |
| API client | Centralizado en `src/lib/api.ts` |
| Backend imports | Absolutos: `from backend.app.core.database import get_db` |
| ETL SQL | Placeholders Jinja: `{{ param }}` |
