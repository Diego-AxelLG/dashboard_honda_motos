## Arquitectura

- **FastAPI** + **SQLAlchemy sync** + **Pydantic v2**
- Conexion a PostgreSQL via `pydantic-settings` leyendo variables `PG_*` del `.env` en la raiz del repo
- Uvicorn **debe correr desde la raiz del proyecto** para que `pydantic-settings` encuentre el `.env`
- Docs interactivos (`/docs`, `/redoc`) se deshabilitan automaticamente cuando `ENVIRONMENT=production`
- Middlewares incluidos: CORS, security headers, rate limiting (in-memory por IP), audit log a archivo

## Patrones Establecidos

### 1. Inyeccion de sesion con `Depends(get_db)`

Todas las rutas reciben la sesion de DB como dependencia. El generador garantiza el cierre:

```python
from fastapi import Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db

@router.get("/items")
def list_items(db: Session = Depends(get_db)):
    rows = db.execute(sql, params).mappings().all()
    return [dict(r) for r in rows]
```

### 2. SQL crudo con `text()` — regla de CAST

Para consultas complejas (CTEs, window functions), usamos `text()` con parametros nombrados:

```python
from sqlalchemy import text

sql = text("""
WITH resumen AS (
    SELECT
        producto,
        COUNT(*) AS total
    FROM dwh.fact_ventas
    WHERE fecha >= CAST(:mes_inicio AS date)
      AND fecha <  CAST(:mes_fin AS date)
    GROUP BY producto
)
SELECT * FROM resumen ORDER BY total DESC
""")

rows = db.execute(sql, {"mes_inicio": "2026-01-01", "mes_fin": "2026-02-01"}).mappings().all()
```

> **IMPORTANTE**: Nunca usar `:param::type` — SQLAlchemy trata `::` como escape de `:`, rompiendo los casts de PostgreSQL. Siempre usar `CAST(:param AS type)`.

### 3. Pandas para transformaciones complejas

Cuando el endpoint necesita cruzar multiples queries y calcular KPIs derivados, usamos `pd.read_sql()` con una conexion raw:

```python
import pandas as pd
import numpy as np
from sqlalchemy import Connection

def build_matrix(conn: Connection, sucursal_id: int | None = None) -> list[dict]:
    params = {}
    if sucursal_id is not None:
        params["sucursal_id"] = sucursal_id

    df_stock  = pd.read_sql(stock_sql, conn, params=params)
    df_ventas = pd.read_sql(ventas_sql, conn, params=params)

    df = df_stock.merge(df_ventas, on="producto", how="outer")
    df["stock"] = df["stock"].fillna(0).astype(int)
    df["ratio"] = np.where(df["ventas"] > 0, df["stock"] / df["ventas"], np.nan)
    df = df.replace({np.nan: None})

    return df.to_dict(orient="records")
```

En el endpoint, se obtiene la conexion desde el engine:

```python
from backend.app.core.database import engine

@router.get("/matrix")
def get_matrix(db: Session = Depends(get_db)):
    with engine.connect() as conn:
        return build_matrix(conn)
```

### 4. Estructura de carpetas

```
backend/
├── requirements.txt
└── app/
    ├── main.py              # Instancia FastAPI + middlewares + montaje de routers
    ├── core/
    │   ├── config.py        # Settings (pydantic-settings, lee .env)
    │   └── database.py      # engine, SessionLocal, get_db
    ├── middleware/
    │   └── audit_log.py     # Logging de trafico a archivo
    ├── api/
    │   ├── router.py        # Router central que monta todos los sub-routers
    │   └── endpoints/       # Un archivo por dominio (auth, health, kpis...)
    ├── services/            # Logica de negocio y queries complejas
    └── schemas/             # Modelos Pydantic (request/response)
```

- **endpoints/**: definicion de rutas, validacion de params, llamada a services
- **services/**: queries SQL, transformaciones pandas, calculos de KPIs
- **schemas/**: modelos Pydantic para serializar respuestas y validar requests

## Variables de Entorno

Crear un archivo `.env` en la raiz del proyecto:

```env
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=secreto
PG_DATABASE=mi_proyecto
```

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `PG_HOST` | `localhost` | Host de PostgreSQL |
| `PG_PORT` | `5432` | Puerto |
| `PG_USER` | `postgres` | Usuario |
| `PG_PASSWORD` | (vacio) | Password |
| `PG_DATABASE` | `mi_proyecto` | Nombre de la base de datos |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3001` | Origenes permitidos (comma-separated) |
| `ENVIRONMENT` | `development` | `production` deshabilita `/docs` y `/redoc` |

## Como Arrancar

```bash
pip install -r requirements.txt
uvicorn backend.app.main:app --reload
```

Verificar que funciona:

```bash
curl http://localhost:8000/api/v1/health
# {"status": "ok"}
```
