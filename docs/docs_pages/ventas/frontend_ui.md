# Ventas — Frontend UI

Documentación de la página `/ventas` del dashboard Honda Motos.

- **Archivo principal:** `frontend/src/app/(dashboard)/ventas/page.tsx`
- **Cliente API:** `frontend/src/lib/api.ts`
- **Formatters:** `frontend/src/lib/utils.ts`
- **Agencias / branding:** `frontend/src/lib/constants.ts`

---

## 1. Propósito

Vista operativa de ventas del mes: KPIs de unidades y cumplimiento, tendencia acumulada contra plan prorrateado, mix por modelo, detalle VIN por VIN y — en tab separado — los flujos de piso (FreshUp vs Internet).

---

## 2. Estructura del componente (`page.tsx:1-86`)

### 2.1 Directiva e imports (`page.tsx:1-15`)

```tsx
"use client";
```

- **React:** `useState`, `useEffect`, `useCallback`.
- **framer-motion:** `motion` para la animación de entrada.
- **Recharts:** `LineChart`, `BarChart`, `ComposedChart`, `Line`, `Bar`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`.
- **API:** `getVentasResumen`, `getVentasTendencia`, `getVentasPorModelo`, `getVentasFlujos`, `getVentasDetalle` desde `@/lib/api`.
- **Utils / constantes:** `fmtNumber`, `fmtDate`, `AGENCIES`.
- **UI:** `KPICard`, `LoadingState`, `AgencyPills`, `MonthPicker` desde `@/components/ui`.

### 2.2 Estado (`page.tsx:41-52`)

| Estado | Tipo | Default | Propósito |
|---|---|---|---|
| `mes` | `string` | `getCurrentMonth()` | Filtro `YYYY-MM` |
| `mui` | `number \| null` | `null` | Sucursal (6, 8, o todas) |
| `loading` | `boolean` | `true` | Loading global |
| `fetchError` | `boolean` | `false` | Bandera de error total |
| `tab` | `"ventas" \| "flujos"` | `"ventas"` | Tab activo |
| `page` | `number` | `0` | Paginación cliente del detalle |
| `resumen` | `Resumen[]` | `[]` | Respuesta de `/ventas/resumen` |
| `tendencia` | `Tendencia[]` | `[]` | Respuesta de `/ventas/tendencia` |
| `modelos` | `Modelo[]` | `[]` | Respuesta de `/ventas/por-modelo` |
| `flujos` | `Flujo[]` | `[]` | Respuesta de `/ventas/flujos` |
| `detalle` | `VentaDetalle[]` | `[]` | Respuesta de `/ventas/detalle` (hasta 500 filas) |

Constante: `PAGE_SIZE = 50` (`page.tsx:34`) — tamaño de página del detalle.

### 2.3 Data fetching (`page.tsx:54-86`)

Un solo `fetchData` en `useCallback`, disparado cuando cambian `mes` o `mui`. Al inicio resetea `page` a 0 (`page.tsx:57`).

```tsx
const params = { anio_mes: mes, ...(mui ? { mui } : {}) };
const [res, tend, mod, flu, det] = await Promise.all([
  getVentasResumen(params).catch(() => null),
  getVentasTendencia(params).catch(() => null),
  getVentasPorModelo(params).catch(() => null),
  getVentasFlujos(params).catch(() => null),
  getVentasDetalle(params).catch(() => null),
]);
const anyFailed = !res && !tend && !mod && !flu && !det;
if (anyFailed) setFetchError(true);
```

- **Paralelo con tolerancia parcial:** cada llamada tiene `.catch(() => null)`; `fetchError` solo se enciende si **las 5** fallan (`page.tsx:67-68`).
- **Fallbacks vacíos:** `res ?? []`, `tend ?? []`, etc. (`page.tsx:69-73`).
- **Catch outer** (`page.tsx:74-80`) resetea todo el estado si una excepción no controlada se escapa del `Promise.all`.
- **`finally`** siempre limpia `loading` (`page.tsx:82`).

> A diferencia del Resumen Ejecutivo (que siempre pide consolidado y filtra en cliente), aquí cambiar de pill de sucursal **sí refetchea** — porque el backend recibe `mui` en los params.

### 2.4 Tipos (`page.tsx:17-25` y similares)

Definidos inline en el archivo:

- `Resumen` — misma forma que `mv_kpis_mensual` row.
- `Tendencia` — `{ fecha, ventas_acumuladas, plan_prorrateado }`.
- `Modelo` — `{ modelo, unidades, contado, financiamiento }`.
- `Flujo` — `{ fecha, id_sucursal, freshup, internet, total }`.
- `VentaDetalle` — `{ fecha, id_sucursal, sucursal, modelo, vin, venta_contado }`.

---

## 3. Componentes UI

### 3.1 De `@/components/ui`

| Componente | Uso | Props relevantes |
|---|---|---|
| `LoadingState` | `page.tsx:97-104` (fallback inicial) | 2 bloques: `variant="cards" count={4}` + `variant="table" count={8}` |
| `MonthPicker` | `page.tsx:115` | `min="2024-01"`, `value={mes}`, `onChange={setMes}` |
| `AgencyPills` | `page.tsx:116` | `options={AGENCIES}`, `selected={mui}`, `onChange={setMui}` |
| `KPICard` | `page.tsx:127-131` | 3 tarjetas (Ventas #, Cumplimiento, Var. YoY) |

### 3.2 Sin componentes inline custom

A diferencia del Resumen, la página de Ventas **no define subcomponentes internos** (no hay `SucursalCard`, `VarBadge`, etc.). Todo se resuelve con `KPICard`, tablas HTML y Recharts directos.

---

## 4. Layout y secciones visibles (`page.tsx:97-240`)

```
┌─────────────────────────────────────────────────────────┐
│ Ventas                              [MonthPicker]        │
│ Tendencia, modelos y detalle        [AgencyPills]        │
├─────────────────────────────────────────────────────────┤
│ [ Alert rojo si fetchError ]                             │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│ │  Ventas #   │ │Cumplimiento │ │  Var. YoY   │          │
│ └─────────────┘ └─────────────┘ └─────────────┘          │
├─────────────────────────────────────────────────────────┤
│  [ Ventas ] [ Flujos de Piso ]   (tabs)                  │
├─────────────────────────────────────────────────────────┤
│  Tab Ventas:                                             │
│  ┌────────────────────┐  ┌────────────────────┐          │
│  │ Acumulada vs Plan  │  │  Ventas por Modelo │          │
│  │     (Line)         │  │     (Bar vertical) │          │
│  └────────────────────┘  └────────────────────┘          │
│  ┌─────────────────────────────────────────────┐         │
│  │  Detalle (tabla paginada 50)                │         │
│  │  Fecha | Sucursal | Modelo | VIN | Tipo     │         │
│  │  [← Anterior]  Página X de Y  [Siguiente →] │         │
│  └─────────────────────────────────────────────┘         │
│                                                          │
│  Tab Flujos:                                             │
│  ┌─────────────────────────────────────────────┐         │
│  │  FreshUp (bar) + Internet (bar) + Total (line)│       │
│  └─────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

### 4.1 Header + filtros (`page.tsx:109-118`)

Título **"Ventas"**, subtítulo *"Tendencia, modelos y detalle"*, `MonthPicker` y `AgencyPills` a la derecha. Responsive `flex-col sm:flex-row`.

### 4.2 Alert de error (`page.tsx:120-124`)

Solo si `fetchError=true`. Rojo `--danger`, texto:

> "No se pudieron cargar datos del servidor. Verifica que el backend esté corriendo en el puerto 8001."

### 4.3 KPIs (`page.tsx:127-131`)

Grid `grid-cols-1 sm:grid-cols-3` con 3 `KPICard`:

| Card | Valor | Formato | Fuente |
|---|---|---|---|
| **Ventas #** | `SUM(filtered.total_ventas)` | `number` | `resumen` filtrado por `mui` |
| **Cumplimiento** | `avg(pct_cumplimiento)` con subtitle "Meta: N" | `percent` | `resumen` |
| **Var. YoY** | `avg(var_pct_yoy)` | `percent` | `resumen` |

El `resumen` se filtra en cliente por `mui` en `page.tsx:89` (`filtered = mui ? resumen.filter(...) : resumen`) — **redundante** con el filtro del backend, pero sirve para KPIs consistentes si cambia algo en el medio.

### 4.4 Tabs (`page.tsx:134-141`)

Dos botones HTML custom con estado `tab`. El tab activo lleva color `--brand-primary` y borde inferior. Cambiar tab **no refetchea** — las dos vistas usan data ya cargada.

### 4.5 Tab "ventas" (`page.tsx:143-222`)

**Grid de charts (2 col en lg):**

1. **LineChart "Venta Acumulada vs Plan"** (`page.tsx:150-160`, alto 280px)
   - `ventas_acumuladas` → línea sólida `--brand-primary`, 2px.
   - `plan_prorrateado` → línea dasheada (`5 5`), `--text-muted`, 2px.
   - Eje X: último bloque de la fecha (día). Tooltip/Legend con estilos via CSS vars.
2. **BarChart "Ventas por Modelo"** (`page.tsx:166-176`, alto 280px)
   - Orientación horizontal (`layout="vertical"`), `YAxis` de categoría con `width=80`.
   - Stacked: `contado` (`--brand-primary`) + `financiamiento` (`--brand-accent`, con esquina superior derecha redondeada).

**Detalle (`page.tsx:181-221`):**

- Título + contador `fmtNumber(detalle.length)` de registros.
- Tabla HTML nativa con columnas: Fecha, Sucursal, Modelo, VIN, Tipo.
- Hover row con `bg-card-hover`.
- **Tipo:** badge de color:
  - `Contado` → verde `--success`
  - `Financiamiento` → naranja `--warning`
- **Paginación cliente:** `pagedDetalle = detalle.slice(page*50, (page+1)*50)` (`page.tsx:94`). `totalPages = Math.ceil(detalle.length / 50)` (`page.tsx:95`). Botones "← Anterior / Siguiente →" deshabilitados en los bordes, indicador "Página X de Y" en medio (`page.tsx:214-220`).

> El backend retorna hasta 500 filas (`LIMIT 500` en `get_detalle`). La paginación es completamente in-memory — no hace nuevas llamadas.

### 4.6 Tab "flujos" (`page.tsx:224-239`)

**ComposedChart** (alto 320px, `page.tsx:227-238`):

- Bar `freshup` → `--brand-primary`, esquina superior redondeada.
- Bar `internet` → `--brand-accent`, esquina superior redondeada.
- Line `total` → `--text-primary`, 2px, sin dots.
- Eje X: fecha abreviada al día.

---

## 5. Formatters, colores y animación

### 5.1 Formatters (`lib/utils.ts`)

- `fmtNumber` — registros en el detalle (`page.tsx:184`).
- `fmtDate` — fecha en cada fila de la tabla (`page.tsx:200`).
- `fmtCurrency` / `fmtPct` no se usan directamente aquí; los `KPICard` formatean internamente vía su prop `format`.

### 5.2 Variables CSS

| Var | Uso |
|---|---|
| `--brand-primary` | Tab activo, línea de tendencia, bar contado/freshup |
| `--brand-accent` | Bar financiamiento/internet |
| `--text-primary`, `--text-secondary`, `--text-muted` | Tipografía y líneas auxiliares |
| `--bg-card`, `--bg-card-hover` | Fondo tarjetas y hover de tabla |
| `--border-color` | Bordes, tooltips, gridlines |
| `--success`, `--warning`, `--danger` | Badges Contado/Financiamiento y alert de error |

### 5.3 Animación

`motion.div` envolvente con `initial={{ opacity: 0, y: 12 }}`, `animate={{ opacity: 1, y: 0 }}`, `duration: 0.3` (`page.tsx:107`).

---

## 6. Interactividad y UX

- **Cambiar mes** → refetch de los 5 endpoints.
- **Cambiar sucursal (pills)** → refetch completo (el backend recibe `mui`).
- **Cambiar de tab** → solo re-render, cero llamadas.
- **Paginar detalle** → solo cliente, slice del array.
- **Filas de detalle** → hover visual; no hay drill-down ni selección.

---

## 7. Estados de carga y error

### 7.1 Loading inicial (`page.tsx:97-104`)

```tsx
if (loading) return (
  <>
    <LoadingState variant="cards" count={4} />
    <LoadingState variant="table" count={8} />
  </>
);
```

Skeletons de KPIs encima de skeleton de tabla.

### 7.2 Error tolerante

- 5 `.catch(() => null)` individuales.
- `anyFailed` solo si todos son null → banner rojo arriba.
- Si al menos uno respondió, la página renderiza lo que haya y el resto queda como array vacío (charts en blanco, detalle vacío).
