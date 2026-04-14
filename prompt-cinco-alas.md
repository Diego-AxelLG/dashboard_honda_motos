# Prompt para Claude Code — Módulo "Evaluación 5 Alas" Honda Motos

## Contexto

Honda de México evalúa trimestralmente a sus distribuidores con el programa "5 Alas". La evaluación es **por grupo** (ambas sucursales: Tijuana + Mexicali combinadas), NO por sucursal individual. Cubre 4 áreas: Ventas, Servicio, Refacciones e Imagen Honda. El puntaje total determina cuántas "alas" obtiene el distribuidor y el % de incentivo económico.

Este módulo necesita:
1. **Captura manual trimestral** por el gerente (la mayoría de KPIs no son automáticos)
2. **Precálculo automático** de los KPIs que ya tenemos en el DWH (ventas RS, Niguri/inventario, retención)
3. **Links a evidencias** (URLs a Google Drive/fotos) por cada tema
4. **Página dedicada** `/cinco-alas` en el dashboard
5. **Indicador compacto** en el Resumen Ejecutivo

Lee primero los archivos existentes del proyecto antes de hacer cambios:
- `backend/app/api/router.py`
- `backend/app/services/`
- `frontend/src/app/(dashboard)/`
- `data-pipeline/ddl/`

## Sistema de puntuación 2026

### Área de Ventas (164 pts / -30 penalización)

| # | KPI | Detalle | Pts Max | Penalización | Tipo |
|---|-----|---------|---------|-------------|------|
| V1 | Ventas | Cumplimiento de Ventas RS | 120 | — | **AUTO** — ventas vs plan del trimestre, ya en DWH |
| V2 | Eventos Honda | Café con Honda, Safety Day, Cuatrimanía, Riders Club | 15 | — | Manual |
| V3 | Eventos Distribuidor | Activaciones, DEMOS, Publicidad, Eventos propios | 9 | — | Manual (nuevo 2026) |
| V4 | Prospección | Reporte de prospección en Sistema Honda | 10 | — | Manual |
| V5 | Niguri N-4 | Elaboración de Niguri y Revisión en N-4 | 10 | — | **SEMI-AUTO** — meses de inventario 1.3–1.9, calculable |
| V6 | Cobranza | Cumplimiento de pagos en tiempo | — | -30 | Manual |

**Regla V1:** 120 pts por alcanzar el objetivo de crecimiento vs año anterior que Honda fija por trimestre (boletín). Sin flotillas.

**Regla V5:** Stock entre 1.3 y 1.9 meses al día 15 de cada mes. Ya tenemos `fact_inventario` + ventas promedio para calcular meses de stock.

### Área de Servicio (140 pts / 0 penalización)

| # | KPI | Detalle | Pts Max | Tipo |
|---|-----|---------|---------|------|
| S1 | Entrenamiento técnico | Plan de capacitación técnicos | 40 | Manual |
| S2 | Retención 0-2 años | Retención de servicio 0-2 años de garantía | 45 | **SEMI-AUTO** — tenemos datos de retención en postventa |
| S3 | Retención 3-9 años | Retención de servicio 3-9 años de garantía | 15 | **SEMI-AUTO** — nuevo 2026, misma fuente |
| S4 | Capacidad de Servicio | Cumplimiento de capacidad | 30 | Manual |
| S5 | Encuestas D-CSI | % de respuesta de encuestas a clientes | 10 | Manual |

**Regla S2/S3:** Objetivos compartidos por JDT (Jefe de Territorio). Comparados por medio del JT.

### Área de Refacciones (60 pts / -30 penalización)

| # | KPI | Detalle | Pts Max | Penalización | Tipo |
|---|-----|---------|---------|-------------|------|
| R1 | Compra Refacciones | Cumplimiento compra de refacciones | 40 | — | Manual |
| R2 | Compra Aceite | Compra de aceite de motor | 10 | — | Manual |
| R3 | Compra Químicos | Compra de químicos | 10 | — | Manual |
| R4 | Pagos en Tiempo | Cumplimiento de pagos | — | -30 | Manual |

### Imagen Corporativa Honda (0 pts / -150 penalización)

Solo penalizaciones — si cumples todo obtienes 0, si no cumples te descuentan:

| # | KPI | Detalle | Penalización |
|---|-----|---------|-------------|
| I1 | Fachada exterior | Letrero Honda / Pintura exterior | -30 |
| I2 | Fachada servicio | Letrero de Servicio / Pintura servicio | -20 |
| I3 | Exhibición ventas | Sala interior: Motos, Refacciones, Accesorios | -40 |
| I4 | Pintura interior | Ventas, Servicio, Refacciones y Admón. | -20 |
| I5 | Imagen refacciones | Área de refacciones | -10 |
| I6 | Uniformes | Personal de todas las áreas | -10 |
| I7 | Papelería | Del distribuidor, todas las áreas | -10 |
| I8 | Señalética | Letrero interior, Ventas, Servicio, Refacciones | -10 |

### Escala de Alas e Incentivos

| Alas | Puntos (3 meses) | % Incentivo |
|------|-------------------|-------------|
| 5 | 356–364 | 6% |
| 4 | 333–355 | 4% |
| 3 | 302–332 | 3% |
| 2 | 271–301 | 2% |
| 1 | ≤270 | 0% |

**Total máximo posible:** 364 pts positivos, -210 en penalizaciones.

## DDL — Nuevas tablas

### `dwh.cinco_alas_evaluacion` — Evaluación trimestral (header)

```sql
CREATE TABLE dwh.cinco_alas_evaluacion (
  id              SERIAL PRIMARY KEY,
  anio            INTEGER NOT NULL,          -- 2026
  trimestre       INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  fecha_captura   TIMESTAMPTZ DEFAULT NOW(),
  capturado_por   VARCHAR(100),              -- nombre del gerente
  notas           TEXT,                       -- notas generales del trimestre
  UNIQUE (anio, trimestre)
);
```

### `dwh.cinco_alas_detalle` — Puntaje por KPI

```sql
CREATE TABLE dwh.cinco_alas_detalle (
  id              SERIAL PRIMARY KEY,
  evaluacion_id   INTEGER NOT NULL REFERENCES dwh.cinco_alas_evaluacion(id),
  area            VARCHAR(20) NOT NULL,       -- 'ventas', 'servicio', 'refacciones', 'imagen'
  kpi_codigo      VARCHAR(10) NOT NULL,       -- 'V1', 'V2', ..., 'S1', ..., 'R1', ..., 'I1', ...
  puntos_obtenidos NUMERIC(6,1) NOT NULL DEFAULT 0,
  puntos_maximo   NUMERIC(6,1) NOT NULL,      -- pts positivos max de la tabla
  penalizacion    NUMERIC(6,1) NOT NULL DEFAULT 0, -- valor negativo si aplica
  es_automatico   BOOLEAN DEFAULT FALSE,      -- true si fue precalculado
  notas           TEXT,                        -- notas del gerente sobre este KPI
  evidencia_url   TEXT,                        -- link a Google Drive / foto
  UNIQUE (evaluacion_id, kpi_codigo)
);
```

### `dwh.cinco_alas_catalogo` — Catálogo de KPIs (seed)

```sql
CREATE TABLE dwh.cinco_alas_catalogo (
  kpi_codigo       VARCHAR(10) PRIMARY KEY,
  area             VARCHAR(20) NOT NULL,
  nombre           VARCHAR(100) NOT NULL,
  detalle          TEXT,
  puntos_maximo    NUMERIC(6,1) NOT NULL DEFAULT 0,
  penalizacion_max NUMERIC(6,1) NOT NULL DEFAULT 0,  -- valor negativo
  es_automatico    BOOLEAN DEFAULT FALSE,
  orden            INTEGER NOT NULL              -- para ordenar en UI
);

-- Seed data
INSERT INTO dwh.cinco_alas_catalogo VALUES
  ('V1', 'ventas',       'Cumplimiento Ventas RS',            'Ventas a cliente final vs objetivo Honda', 120, 0, TRUE, 1),
  ('V2', 'ventas',       'Eventos Promoción Honda',           'Café con Honda, Safety Day, Cuatrimanía, Riders Club', 15, 0, FALSE, 2),
  ('V3', 'ventas',       'Eventos Promoción Distribuidor',    'Activaciones, DEMOS, Publicidad, Eventos', 9, 0, FALSE, 3),
  ('V4', 'ventas',       'Reporte Prospección',               'Prospección de ventas en Sistema Honda', 10, 0, FALSE, 4),
  ('V5', 'ventas',       'Niguri N-4',                        'Planeación mensual, stock 1.3–1.9 meses', 10, 0, TRUE, 5),
  ('V6', 'ventas',       'Cobranza',                          'Cumplimiento de pagos en tiempo', 0, -30, FALSE, 6),
  ('S1', 'servicio',     'Entrenamiento Técnico',             'Plan de capacitación para técnicos', 40, 0, FALSE, 7),
  ('S2', 'servicio',     'Retención 0-2 años',                'Retención de servicio 0-2 años garantía', 45, 0, TRUE, 8),
  ('S3', 'servicio',     'Retención 3-9 años',                'Retención de servicio 3-9 años garantía', 15, 0, TRUE, 9),
  ('S4', 'servicio',     'Capacidad de Servicio',             'Cumplimiento de capacidad', 30, 0, FALSE, 10),
  ('S5', 'servicio',     'Encuestas D-CSI',                   '% respuesta encuestas clientes', 10, 0, FALSE, 11),
  ('R1', 'refacciones',  'Compra Refacciones',                'Cumplimiento compra refacciones', 40, 0, FALSE, 12),
  ('R2', 'refacciones',  'Compra Aceite Motor',               'Compra de aceite', 10, 0, FALSE, 13),
  ('R3', 'refacciones',  'Compra Químicos',                   'Compra de químicos', 10, 0, FALSE, 14),
  ('R4', 'refacciones',  'Pagos en Tiempo',                   'Cumplimiento pagos refacciones', 0, -30, FALSE, 15),
  ('I1', 'imagen',       'Fachada Exterior',                  'Letrero Honda / Pintura exterior', 0, -30, FALSE, 16),
  ('I2', 'imagen',       'Fachada Servicio',                  'Letrero Servicio / Pintura servicio', 0, -20, FALSE, 17),
  ('I3', 'imagen',       'Exhibición Ventas',                 'Sala interior: Motos, Refacciones, Accesorios', 0, -40, FALSE, 18),
  ('I4', 'imagen',       'Pintura Interior',                  'Ventas, Servicio, Refacciones y Admón.', 0, -20, FALSE, 19),
  ('I5', 'imagen',       'Imagen Refacciones',                'Área de refacciones', 0, -10, FALSE, 20),
  ('I6', 'imagen',       'Uniformes Personal',                'Todas las áreas', 0, -10, FALSE, 21),
  ('I7', 'imagen',       'Papelería Distribuidor',            'Todas las áreas', 0, -10, FALSE, 22),
  ('I8', 'imagen',       'Señalética Interior',               'Letrero interior, todas las áreas', 0, -10, FALSE, 23);
```

## Backend — Endpoints

Registrar en router como `/api/v1/cinco-alas/`.

### 1. `GET /cinco-alas/catalogo`
Retorna el catálogo completo de KPIs para construir el formulario.

### 2. `GET /cinco-alas/evaluaciones`
Lista todas las evaluaciones guardadas (año, trimestre, puntaje total, alas). Para la tabla de historial.

### 3. `GET /cinco-alas/evaluacion?anio=2026&trimestre=2`
Retorna la evaluación específica con su detalle de KPIs. Si no existe, retorna el catálogo con valores en 0 + precálculos automáticos como sugerencia.

### 4. `POST /cinco-alas/evaluacion`
Guarda o actualiza una evaluación completa. Body:
```json
{
  "anio": 2026,
  "trimestre": 2,
  "capturado_por": "Diego",
  "notas": "Trimestre complicado por lluvias",
  "detalle": [
    {
      "kpi_codigo": "V1",
      "puntos_obtenidos": 120,
      "penalizacion": 0,
      "notas": "Cumplimos 115% de objetivo",
      "evidencia_url": "https://drive.google.com/..."
    },
    ...
  ]
}
```
Usa UPSERT sobre `(anio, trimestre)` para el header y `(evaluacion_id, kpi_codigo)` para el detalle.

### 5. `GET /cinco-alas/precalculo?anio=2026&trimestre=2`
Calcula automáticamente los KPIs que se pueden derivar del DWH:

- **V1 (Ventas RS):** `fact_ventas` del trimestre vs `fact_plan`. Retorna el % de cumplimiento y los puntos sugeridos (0 si no alcanza, 120 si cumple objetivo).
- **V5 (Niguri):** Promedio de meses de stock al día 15 de cada mes del trimestre. De `fact_inventario` snapshots + ventas promedio. Retorna si estuvo en rango 1.3–1.9 y puntos sugeridos.
- **S2/S3 (Retención):** Si tienes datos de retención en postventa, calcular el % y sugerir puntos.

Retorna solo los KPIs automáticos con sus valores sugeridos. El frontend los precarga en el formulario pero el gerente puede ajustarlos.

### 6. `GET /cinco-alas/resumen-actual`
Para el Resumen Ejecutivo. Retorna el resultado del trimestre actual (o el último cerrado):
```json
{
  "anio": 2026,
  "trimestre": 2,
  "puntos_positivos": 310,
  "penalizaciones": -20,
  "puntos_netos": 290,
  "alas": 2,
  "pct_incentivo": 2,
  "por_area": {
    "ventas": { "obtenido": 140, "maximo": 164, "penalizacion": 0 },
    "servicio": { "obtenido": 110, "maximo": 140, "penalizacion": 0 },
    "refacciones": { "obtenido": 40, "maximo": 60, "penalizacion": 0 },
    "imagen": { "obtenido": 0, "penalizacion": -20 }
  }
}
```

## Frontend — Página `/cinco-alas`

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ Evaluación 5 Alas                    [Año ▼] [Trimestre ▼]       │
│ Programa de evaluación Honda de México                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────── Score Card ────────────────────────────┐   │
│  │                                                           │   │
│  │   ★★★★☆    4 Alas    340 / 364 pts    Incentivo: 4%      │   │
│  │                                                           │   │
│  │   [====== Ventas 150/164 ======]  [=== Servicio 120/140]  │   │
│  │   [== Refacc 50/60 ==]  [Imagen: -20]                    │   │
│  │                                                           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ÁREA DE VENTAS                                    150 / 164 pts │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ KPI              │ Pts │ Max │ Penal │ Notas │ Evidencia  │   │
│  │ ✓ Ventas RS      │[120]│ 120 │       │ [...] │ [link]     │   │
│  │   Eventos Honda  │[ 15]│  15 │       │ [...] │ [link]     │   │
│  │   Eventos Dist.  │[  9]│   9 │       │ [...] │ [link]     │   │
│  │   Prospección    │[ 10]│  10 │       │ [...] │ [link]     │   │
│  │ ✓ Niguri N-4     │[  6]│  10 │       │ [...] │ [link]     │   │
│  │   Cobranza       │     │     │[  0 ] │ [...] │            │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ÁREA DE SERVICIO                                  120 / 140 pts │
│  ┌─── (misma estructura) ───┐                                    │
│                                                                  │
│  ÁREA DE REFACCIONES                                50 / 60 pts  │
│  ┌─── (misma estructura) ───┐                                    │
│                                                                  │
│  IMAGEN CORPORATIVA                              Penaliz: -20    │
│  ┌─── (misma estructura, solo penalizaciones) ───┐               │
│                                                                  │
│  [Guardar evaluación]                    [Notas generales ...]   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HISTORIAL                                                       │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ Trim   │ Ventas │ Serv. │ Refac. │ Imagen │ Total │Alas│     │
│  │ Q1 2026│ 140    │ 120   │  50    │  -20   │  290  │ 2★ │     │
│  │ Q4 2025│ 155    │ 130   │  55    │    0   │  340  │ 4★ │     │
│  │ ...    │        │       │        │        │       │    │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Componentes del formulario

Cada fila de KPI tiene:
- **Icono ✓** si es auto-calculado (con tooltip "Precalculado del DWH, puedes ajustar")
- **Input numérico** para puntos obtenidos (validar contra max)
- **Input numérico** para penalización (solo KPIs que tienen penalización, validar contra max negativo)
- **Textarea colapsable** para notas
- **Input de URL** para link de evidencia (con ícono de link externo que abre en nueva pestaña)

### Score Card (resumen visual arriba)

- **Estrellas/Alas:** 5 íconos (estrellas o alas estilizadas), llenas según el puntaje
- **Puntaje total:** "340 / 364 pts" en grande
- **% Incentivo:** según la escala
- **Barras por área:** 4 barras horizontales mostrando obtenido/máximo, con colores:
  - Verde: ≥90% del máximo
  - Amarillo: 70-89%
  - Rojo: <70%
  - Imagen: barra especial que muestra penalizaciones (rojo si hay, verde si 0)

### Validaciones en frontend

- Puntos obtenidos no pueden superar el máximo del KPI
- Penalizaciones no pueden superar el máximo negativo
- Al menos los KPIs automáticos deben tener valor antes de guardar
- Confirmación antes de sobrescribir una evaluación existente

### Historial

Tabla simple con todas las evaluaciones pasadas. Click en una fila carga esa evaluación en el formulario (modo lectura/edición).

## Resumen Ejecutivo — Indicador compacto

En la página principal (`/`), agregar debajo de las cards de sucursal (o como card adicional):

```
┌──────────────────────────────────────┐
│  5 Alas — Q2 2026                    │
│  ★★★★☆   340 pts   4%               │
│                                      │
│  V: 150  S: 120  R: 50  I: -20      │
└──────────────────────────────────────┘
```

Si no hay evaluación del trimestre actual, mostrar "Sin evaluar" con link a `/cinco-alas`.

Consumir el endpoint `GET /cinco-alas/resumen-actual`.

## Lógica de cálculo de Alas

```python
def calcular_alas(puntos_netos: int) -> tuple[int, int]:
    """Retorna (numero_alas, pct_incentivo)"""
    if puntos_netos >= 356: return (5, 6)
    if puntos_netos >= 333: return (4, 4)
    if puntos_netos >= 302: return (3, 3)
    if puntos_netos >= 271: return (2, 2)
    return (1, 0)
```

`puntos_netos = sum(puntos_obtenidos) + sum(penalizaciones)` — las penalizaciones son negativas.

## Orden de implementación

1. **DDL** — Crear las 3 tablas + seed del catálogo
2. **Backend** — Crear `cinco_alas_service.py` + `cinco_alas.py` con los 6 endpoints
3. **Backend precálculo** — Implementar lógica de V1, V5, S2, S3 desde el DWH
4. **Frontend** — Página `/cinco-alas` con formulario + score card + historial
5. **Frontend resumen** — Agregar indicador compacto en página principal
6. **Smoke test** — Crear evaluación Q1 2026, verificar cálculos y persistencia

## Notas importantes

- NO uses el puerto 8000, el backend corre en 8001
- La evaluación es POR GRUPO (no por sucursal) — no hay filtro de `mui` en estos endpoints
- Trimestre: Q1=ene-mar, Q2=abr-jun, Q3=jul-sep, Q4=oct-dic
- Los KPIs automáticos son SUGERENCIAS — el gerente puede editarlos si Honda evaluó diferente
- Usa `CAST(:param AS type)` en SQL, no `::type`
- Componente `"use client"` con el patrón de fetch del proyecto
- Usa CSS variables del proyecto para colores y theme
- La escala de alas y puntos es para 2026 — en el futuro podría cambiar, por eso el catálogo es una tabla separada (no hardcoded en frontend)
