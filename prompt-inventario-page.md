# Prompt para Claude Code — Página de Inventario Honda Motos

## Contexto

Tengo un dashboard de Honda Autos con una página de inventario que quiero replicar visualmente para Honda Motos. Honda Motos tiene 2 sucursales: Tijuana (mui=6) y Mexicali (mui=8). Los datos ya están en `dwh.fact_inventario` con el ETL funcionando (patrón DELETE+INSERT por snapshot diario).

Lee primero estos archivos antes de hacer cambios:
- `frontend/src/app/(dashboard)/inventario/page.tsx` (si existe)
- `backend/app/services/inventario_service.py` (si existe)
- `backend/app/api/endpoints/inventario.py` (si existe)
- `data-pipeline/ddl/` (para ver el schema actual de fact_inventario)
- `frontend/src/lib/api.ts`

## Datos disponibles en `dwh.fact_inventario`

Columnas actuales (snapshot diario, DELETE+INSERT):

| Columna | Tipo | Notas |
|---------|------|-------|
| fecha_snapshot | date | Siempre el día actual (último snapshot) |
| id_sucursal | int | 6=Tijuana, 8=Mexicali |
| vin | varchar(25) | Identificador único de la moto |
| modelo | varchar(150) | UPPER (XR190L, NAVI110, CARGO GL150...) |
| color | varchar(60) | ROJO, NEGRO, AZUL, "VERDE AUDAZ"... |
| anio | int | 2023–2026 |
| dias_inventario | int | Días desde llegada |
| dias_apartado | int (null) | null si Disponible |
| estatus | varchar | Disponible / Apartado / Facturado |
| cantidad | int | Siempre 1 |

Columnas por agregar (extensión ETL ya propuesta, proceder):

| Columna | Tipo | Fuente | Notas |
|---------|------|--------|-------|
| asesor_nombre | varchar(150) | v_apartado_inv | Solo para Apartados, null si Disponible |
| asesor_id | int | v_apartado_inv | Para agrupar |
| cliente_nombre | varchar(200) | v_apartado_inv | Cliente del apartado |
| fecha_apartado | date | v_apartado_inv | Cuándo se apartó |
| facturado | boolean | vw_ventas_totales | true si tiene fecha_facturacion |
| fecha_facturacion | date | vw_ventas_totales | null si no facturado |
| tipo_compra | varchar(20) | vw_ventas_totales | CONTADO/FINANCIAMIENTO |
| status_proceso | varchar(30) | vw_ventas_totales | proceso/aprobado/liberado |

**PRIMERO extiende el ETL y DDL para agregar estas columnas antes de tocar backend/frontend.**

También existe `dwh.mv_aging_inventario` que ya tiene buckets de aging por sucursal.

## Layout objetivo (replicar estilo Honda Autos)

```
┌──────────────────────────────────────────────────────────────────┐
│ Inventario                                [MonthPicker] [Pills]  │
│ Stock actual por sucursal                                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Card Total Honda Motos ──┐ ┌─ Card Tijuana ──┐ ┌─ Card Mxl ─┐
│  │                           │ │                  │ │            │
│  │  Total Honda Motos   185  │ │ Honda Motos  148 │ │ Honda   37 │
│  │              STOCK        │ │ Tijuana  STOCK   │ │ Mxl STOCK  │
│  │                           │ │                  │ │            │
│  │  MODELO   D  A  F UDS MES │ │  (misma tabla)   │ │ (misma)   │
│  │  XR190L  30  8  1  41 1.1 │ │                  │ │            │
│  │  NAVI110 20  5  — 27 0.7  │ │                  │ │            │
│  │  ...                      │ │                  │ │            │
│  │  TOTAL   135 47 3 185 2.0 │ │                  │ │            │
│  │                           │ │                  │ │            │
│  │  ◐ 34%  30 uds +90 días  │ │  ◐ %  N uds +90 │ │ ◐ %  N +90│
│  │                           │ │                  │ │            │
│  └───────────────────────────┘ └──────────────────┘ └────────────┘
│                                                                  │
│  (click en card despliega las dos tablas de abajo)               │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Inventario — Honda Motos Tijuana              148 unidades      │
│  ┌──────────────────────────────────────────────────────────┐  ✕ │
│  │ Modelo | Color | Año | Estatus | Dias Inv. | Dias Apt. | │    │
│  │        |       |     |         |  Rango    |           | │    │
│  │ XR190L | ROJO  |2026 | Disp.   |   45      |    —      | │    │
│  │ ...    |       |     |         |           |           | │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Apartados — Honda Motos Tijuana               28 unidades       │
│  ┌──────────────────────────────────────────────────────────┐  ✕ │
│  │ Asesor | Modelo | Color | Estatus | Cliente |Dias Inv.| │    │
│  │        |        |       |         |         |Dias Apt.| │    │
│  │ Enrique| XR190L | ROJO  | Apart.  | Juan P. |  63  35 | │    │
│  │ ...    |        |       |         |         |         | │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Anatomía de cada Card de sucursal

### 1. Header
- **Título** a la izquierda (ej. "Honda Motos Tijuana")
- **Número grande** a la derecha con label "STOCK" debajo
- Card clickeable — al hacer click despliega las tablas de detalle abajo

### 2. Tabla resumen por modelo
Tabla compacta dentro de la card con columnas:

| Col | Significado | Color |
|-----|-------------|-------|
| MODELO | Nombre del modelo | normal |
| D | Disponibles | verde |
| A | Apartados | amarillo/naranja |
| F | Facturados (en piso) | rojo |
| UDS | Total unidades | bold |
| MESES | Meses de inventario = UDS / promedio ventas mensuales del modelo | badge de color |

**MESES badge colores:**
- Verde: < 2.0 meses (sano)
- Amarillo: 2.0–3.0 meses (atención)
- Rojo: > 3.0 meses (exceso)
- Gris `—`: sin ventas del modelo (no se puede calcular)

**Fila TOTAL** al final con sumas y promedio ponderado de meses.

**Para calcular MESES:** necesitas el promedio de ventas mensuales por modelo de los últimos 3–6 meses. Usa `fact_ventas` agrupado por modelo y sucursal, dividiendo entre el número de meses con datos. Si un modelo no tiene ventas → mostrar `—`.

### 3. Indicador de aging (pie de card)
- **Donut/circle** pequeño mostrando % de unidades con +90 días
- Texto: "N uds +90 días"
- Datos de `mv_aging_inventario` o calculados directo de `fact_inventario WHERE dias_inventario > 90`

### 4. Interacción click → tablas desplegables
Al hacer click en una card, se despliegan DOS tablas debajo (o en un modal/drawer):

#### Tabla 1: "Inventario — {Sucursal}"
Subtítulo: "N unidades en stock"
Columnas:

| Columna | Fuente | Notas |
|---------|--------|-------|
| Modelo | modelo | bold |
| Color | color | normal |
| Año | anio | normal |
| Estatus | estatus | badge: verde=Disponible, naranja=Apartado, rojo=Facturado |
| Dias Inv. | dias_inventario | rojo si >90 |
| Dias Apt. | dias_apartado | rojo si >45, gris `—` si null |
| Rango | bucket de aging | badge: 0-30, 31-60, 61-90, +90 |

Ordenar por `dias_inventario DESC` (los más viejos primero).
Botón ✕ para cerrar la tabla.

#### Tabla 2: "Apartados — {Sucursal}"
Subtítulo: "N unidades apartadas"
Solo filas con estatus = 'Apartado'.
Columnas:

| Columna | Fuente | Notas |
|---------|--------|-------|
| Asesor | asesor_nombre | bold |
| Modelo | modelo | bold |
| Color | color | normal |
| Estatus | estatus | siempre "Apartado" |
| Cliente | cliente_nombre | normal |
| Dias Inv. | dias_inventario | rojo si >90 |
| Dias Apt. | dias_apartado | rojo si >45 |

Ordenar por `dias_apartado DESC` (los más tiempo apartados primero).
Botón ✕ para cerrar la tabla.

## Endpoints backend necesarios

### 1. `GET /api/v1/inventario/resumen-stock`
Retorna el resumen por modelo y sucursal para las cards. Parámetros: `mui` (opcional).

```json
{
  "fecha_snapshot": "2026-04-14",
  "sucursales": [
    {
      "mui": 6,
      "sucursal": "Honda Motos Tijuana",
      "total_stock": 148,
      "disponible": 117,
      "apartado": 28,
      "facturado": 3,
      "unidades_90_plus": 21,
      "pct_90_plus": 14.2,
      "modelos": [
        {
          "modelo": "XR190L",
          "disponible": 30,
          "apartado": 8,
          "facturado": 1,
          "total": 41,
          "meses_inventario": 1.1
        }
      ]
    }
  ],
  "total": { ... mismo shape agregado }
}
```

Query: agrupa `fact_inventario` por `(id_sucursal, modelo)` con COUNTs condicionales por estatus. Para `meses_inventario`, JOIN con promedio mensual de `fact_ventas` por modelo (últimos 3-6 meses).

### 2. `GET /api/v1/inventario/detalle`
Retorna el detalle VIN por VIN. Parámetros: `mui` (requerido).

```json
[{
  "vin": "3H1...",
  "modelo": "XR190L",
  "color": "ROJO",
  "anio": 2026,
  "estatus": "Disponible",
  "dias_inventario": 45,
  "dias_apartado": null,
  "rango": "+90"
}]
```

### 3. `GET /api/v1/inventario/apartados`
Retorna solo las unidades apartadas con info de asesor. Parámetros: `mui` (requerido).

```json
[{
  "asesor_nombre": "Enrique Vazquez",
  "modelo": "XR190L",
  "color": "ROJO",
  "estatus": "Apartado",
  "cliente_nombre": "Juan Perez",
  "dias_inventario": 63,
  "dias_apartado": 35
}]
```

## Orden de implementación

1. **DDL** — ALTER TABLE fact_inventario ADD columnas (asesor_nombre, asesor_id, cliente_nombre, fecha_apartado, facturado, fecha_facturacion, tipo_compra, status_proceso)
2. **ETL** — Extender etl_inventario.py con LEFT JOINs a v_apartado_inv y vw_ventas_totales
3. **Backend** — Crear los 3 endpoints en inventario_service.py + inventario.py
4. **Frontend** — Construir la página con cards + tablas desplegables
5. **Smoke test** — Verificar con ambas sucursales

## Estilo

- Cards clickeables con hover `shadow-md`, transición suave
- Tabla dentro de card: compacta, `text-xs`, sin bordes entre celdas, solo líneas horizontales sutiles
- Números D/A/F en colores: verde `var(--success)`, naranja `var(--warning)`, rojo `var(--danger)`
- Badges de MESES: redondeados, fondo de color, texto blanco
- Donut de aging: SVG pequeño o `conic-gradient` CSS
- Tablas desplegables: con animación slide-down, borde azul/brand al card seleccionado
- Dias Inv. y Dias Apt. en rojo cuando exceden umbral
- Responsive: cards en fila horizontal desktop, stack vertical mobile

## Notas importantes

- NO uses el puerto 8000, el backend corre en 8001
- Ensenada (mui=7) no existe
- El MonthPicker NO aplica para inventario (siempre es snapshot de hoy), pero mantén las AgencyPills para filtrar sucursal
- `cantidad` siempre es 1, no la uses — cuenta filas con COUNT(*)
- `fact_inventario` es DELETE+INSERT diario, siempre usar `fecha_snapshot = (SELECT MAX(fecha_snapshot) FROM dwh.fact_inventario)` para obtener el snapshot más reciente
- Para MESES de inventario: si no hay ventas del modelo en los últimos 6 meses, mostrar `—` no infinito
- Usa CSS variables del proyecto, patrón `"use client"`, SQL con `CAST(:param AS type)`
