# Data Pipeline — Boilerplate ETL

Pipeline ETL para data warehouse Kimball. Extrae de MySQL (CRM/ERP), transforma con pandas y carga a PostgreSQL con UPSERT. Orquestado con cron + flock (sin Airflow por simplicidad).

## Arquitectura

```
MySQL (CRM/ERP)                PostgreSQL (DWH)
┌─────────────┐    ETL Python    ┌──────────────────────┐
│ sistema_crm │ ──────────────── │ dwh schema           │
│  .ventas    │   1. SQL extract │  dim_tiempo           │
│  .clientes  │   2. pandas df   │  dim_sucursales       │
│  .tickets   │   3. UPSERT/     │  dim_vendedores       │
│  ...        │      DELETE+INS  │  fact_ventas          │
└─────────────┘                  │  fact_inventario      │
                                 │  fact_plan            │
                                 │  mv_kpis_mensual (MV) │
                                 └──────────────────────┘
```

| Componente | Tecnología |
|-----------|-----------|
| Lenguaje | Python 3.10+ |
| Extracción | SQL con placeholders Jinja (`{{ param }}`) |
| Transformación | pandas DataFrame |
| Carga | SQLAlchemy `pg_insert` + `ON CONFLICT DO UPDATE` |
| Esquema DWH | Kimball star schema en schema `dwh` |
| Orquestación | `cron` + `flock` (previene ejecuciones concurrentes) |
| Vistas | Materialized views para KPIs pre-calculados |

## Estructura de archivos

```
data-pipeline/
├── README.md                       # Este archivo
├── requirements.txt                # Dependencias Python
├── refresh_vistas.py               # Refresca materialized views
├── cron_etl.sh                     # Script de cron con flock
├── ddl/
│   └── 001_schema_base.sql         # DDL Kimball genérico (dims + facts + MV)
└── etl/
    ├── __init__.py
    ├── utils.py                    # DatabaseConnector, logger, read_sql_file
    ├── extract/
    │   ├── extract_ventas.sql              # Query simple de extracción
    │   ├── extract_ventas_ejemplo.sql      # Query con CASE WHEN, JOINs, mapeos
    │   └── extract_tickets_abiertos.sql    # Query para snapshot diario
    └── scripts/
        ├── etl_ejemplo.py                  # ETL incremental (UPSERT)
        └── etl_snapshot_ejemplo.py         # ETL snapshot (DELETE+INSERT)
```

## Patrones clave

### 1. UPSERT por clave de negocio (`etl_ejemplo.py`)

Para tablas transaccionales donde cada registro tiene un ID único del sistema origen.

```python
# ON CONFLICT (id_oportunidad) DO UPDATE — actualiza si ya existe
stmt = pg_insert(table).values(data)
stmt = stmt.on_conflict_do_update(
    index_elements=["id_oportunidad"],
    set_={col: stmt.excluded[col] for col in keys if col != "id_oportunidad"},
)
```

Usar cuando: ventas, contactos, citas, planes — registros que se crean una vez y se actualizan.

### 2. Snapshot diario DELETE+INSERT (`etl_snapshot_ejemplo.py`)

Para tablas que capturan el estado actual del sistema origen cada día.

```python
# Misma transacción: si INSERT falla, DELETE se revierte
with pg_engine.begin() as conn:
    conn.execute(text("DELETE FROM dwh.fact_X WHERE fecha_snapshot = :fs"), {"fs": hoy})
    df.to_sql("fact_X", conn, schema="dwh", if_exists="append", index=False)
```

Usar cuando: tickets abiertos, inventario actual, cuentas por cobrar — registros que **desaparecen** del origen al resolverse. UPSERT no sirve porque nunca eliminaría los resueltos.

### 3. Inyección segura de parámetros

Los archivos SQL usan placeholders Jinja que `inject_params()` reemplaza con valores validados:

```sql
-- En el archivo .sql
WHERE v.fecha >= '{{ fecha_inicio }}'
  AND v.id_branch IN ({{ sucursales_permitidas }})
```

```python
# En Python — validate_param() verifica formato antes de inyectar
query = inject_params(query, {
    "fecha_inicio": "2024-01-01",           # Solo acepta YYYY-MM-DD
    "sucursales_permitidas": "1, 2, 3",     # Solo acepta dígitos + comas
})
```

### 4. Vistas materializadas

KPIs pre-calculados que la API lee directamente. Se refrescan después de cada ETL:

```python
# refresh_vistas.py
VIEWS = ["dwh.mv_kpis_mensual"]
conn.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
```

La MV requiere un índice único para `REFRESH CONCURRENTLY` (sin lock de lectura).

## Scripts disponibles

### `etl_ejemplo.py` — ETL incremental estándar

```bash
python etl/scripts/etl_ejemplo.py                # Incremental (últimos 90 días)
python etl/scripts/etl_ejemplo.py --full          # Carga completa desde FECHA_INICIO
python etl/scripts/etl_ejemplo.py --dias 180      # Ventana personalizada
```

Flujo: conectar → extraer SQL → transformar DataFrame → UPSERT PostgreSQL → registrar en `etl_last_run`.

### `etl_snapshot_ejemplo.py` — Snapshot diario

```bash
python etl/scripts/etl_snapshot_ejemplo.py        # Snapshot del día
python etl/scripts/etl_snapshot_ejemplo.py --seco  # Dry run (extrae sin cargar)
```

Flujo: conectar → extraer estado actual → DELETE snapshot de hoy → INSERT datos frescos → registrar.

### `refresh_vistas.py` — Refresca materialized views

```bash
.venv/bin/python3 data-pipeline/refresh_vistas.py
```

Ejecutar siempre después de cada ETL para que la API sirva datos actualizados.

## Variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# --- PostgreSQL (destino) ---
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=secret
PG_DATABASE=mi_dwh

# --- MySQL (origen) ---
MYSQL_HOST=crm.ejemplo.com
MYSQL_USER=readonly
MYSQL_PASSWORD=secret
MYSQL_DATABASE=sistema_crm

# --- ETL ---
DIAS_VENTANA=90                     # Default para carga incremental
FECHA_INICIO=2024-01-01             # Inicio para --full
SUCURSALES_PERMITIDAS=1, 2, 3       # IDs de sucursales a procesar
```

## Cron setup

Editar crontab (`crontab -e`) para ejecución automática:

```bash
# ETL principal cada hora en punto
0 * * * *  /ruta/proyecto/data-pipeline/cron_etl.sh main

# ETL secundario (snapshots) cada hora a los :30
30 * * * *  /ruta/proyecto/data-pipeline/cron_etl.sh secondary
```

`cron_etl.sh` usa `flock` para prevenir ejecuciones concurrentes. Si el ETL anterior no terminó, la nueva instancia se salta sin error.

Logs rotativos en `data-pipeline/logs/` (limpieza automática >30 días).

## DDL

Ejecutar los scripts en `ddl/` en orden numérico contra la base destino:

```bash
psql -U postgres -d mi_dwh -f data-pipeline/ddl/001_schema_base.sql
# psql -U postgres -d mi_dwh -f data-pipeline/ddl/002_seed_dimensions.sql
# ... agregar más scripts conforme crece el proyecto
```

`001_schema_base.sql` crea: schema `dwh`, `dim_tiempo` (2020-2030), `dim_sucursales`, `dim_vendedores`, `fact_ventas`, `fact_inventario`, `fact_plan`, y `mv_kpis_mensual`.

## Setup rápido

```bash
# 1. Crear virtualenv
python -m venv .venv
source .venv/bin/activate    # Linux/Mac
# .venv\Scripts\activate     # Windows

# 2. Instalar dependencias
pip install -r data-pipeline/requirements.txt

# 3. Configurar .env
cp data-pipeline/.env.example .env
# Editar .env con las credenciales reales

# 4. Crear schema y tablas
psql -U postgres -d mi_dwh -f data-pipeline/ddl/001_schema_base.sql

# 5. Ejecutar ETL
PYTHONPATH=. .venv/bin/python3 data-pipeline/etl/scripts/etl_ejemplo.py

# 6. Refrescar vistas
PYTHONPATH=. .venv/bin/python3 data-pipeline/refresh_vistas.py
```
