# Resumen Ejecutivo — Frontend UI

Documentación de la página raíz del dashboard (`/`) — la vista consolidada "Resumen Ejecutivo" para Honda Motos.

- **Archivo principal:** `frontend/src/app/(dashboard)/page.tsx` (342 líneas)
- **Cliente API:** `frontend/src/lib/api.ts`
- **Formatters:** `frontend/src/lib/utils.ts`
- **Constantes (branding / agencias):** `frontend/src/lib/constants.ts`

---

## 1. Propósito

Página de entrada del dashboard. Presenta en un solo vistazo, para el mes seleccionado:

- Unidades vendidas vs meta (ritmo y cumplimiento).
- Variaciones vs mes anterior y año anterior (al mismo día del mes).
- Utilidad Bruta, Utilidad Operación, Tasa de Absorción.
- Venta de servicio (postventa).
- Acumulado YTD de UB/UO como footer.

Todo filtrable por mes y por sucursal (Todas / Tijuana / Mexicali).

---

## 2. Estructura del componente (`page.tsx:197-342`)

### 2.1 Directiva y estado (`page.tsx:1`, `198-206`)

```tsx
"use client";
```

| Estado | Tipo | Default | Propósito |
|---|---|---|---|
| `mes` | `string` | `getCurrentMonth()` (`page.tsx:92-94`) | Mes activo `YYYY-MM` |
| `mui` | `number \| null` | `null` | Filtro sucursal (6=TJ, 8=MX, null=Todas) |
| `loading` | `boolean` | `true` | Estado de carga global |
| `fetchError` | `boolean` | `false` | Bandera de error (solo si fallan los 4 endpoints) |
| `resumen` | `ResumenRow[]` | `[]` | Respuesta de `/ventas/resumen` |
| `pacing` | `CumplimientoPacing \| null` | `null` | Respuesta de `/ventas/cumplimiento-pacing` |
| `finKpis` | `FinKPI[]` | `[]` | `kpis` de `/financiero/financials` |
| `pvSummary` | `PVSummary[]` | `[]` | Respuesta de `/postventa/summary` |

### 2.2 Data fetching (`page.tsx:208-237`)

`fetchData` dispara las 4 llamadas **en paralelo** con `Promise.all` y `.catch(() => null)` individual, para permitir éxito parcial:

```tsx
const [res, pac, fin, pv] = await Promise.all([
  getVentasResumen(params).catch(() => null),
  getVentasCumplimientoPacing(params).catch(() => null),
  getFinancials(params).catch(() => null),
  getPostventaSummary(params).catch(() => null),
]);
if (!res && !fin && !pv && !pac) setFetchError(true);
```

Claves de diseño:

- **Siempre se pide la data consolidada** (sin filtro `mui`). El filtro por sucursal se aplica en cliente, por lo que cambiar de pill **no vuelve a consultar** el backend (comentario explícito en `page.tsx:211-212`).
- Dependencia del `useEffect`: `[mes]` (`page.tsx:237`). Solo el cambio de mes dispara fetch.
- `finally` (`page.tsx:232`) siempre limpia `loading`.

### 2.3 Tipos TypeScript (`page.tsx:15-86`)

- `ResumenRow` — fila del endpoint `ventas/resumen`.
- `FinKPI` — fila de `financiero/financials.kpis` (incluye `ytd_ub`, `ytd_uo`).
- `PacingRow` / `CumplimientoPacing` — payload de `ventas/cumplimiento-pacing` con `{ total, sucursales[], cutoff_day, dias_mes }`.
- `PVSummary` — fila de `postventa/summary`.
- `SucursalVM` (`page.tsx:71-86`) — **view model** interno (UI), no viene del backend; lo arma `buildVM()`.

---

## 3. Transformación de datos → `SucursalVM` (`page.tsx:241-297`)

### 3.1 YTD consolidado (`page.tsx:241-246`)

```tsx
const ytdFin = mui ? finKpis.filter(f => f.mui === mui) : finKpis;
const ytdUb = ytdFin.reduce((a, r) => a + (Number(r.ytd_ub) || 0), 0);
const ytdUo = ytdFin.reduce((a, r) => a + (Number(r.ytd_uo) || 0), 0);
const ytdScope = mui
  ? (ytdFin[0]?.sucursal ?? "Sucursal")
  : "Total Honda Motos";
```

### 3.2 `buildVM(key, muiId, titulo, pacingRow)` (`page.tsx:248-289`)

Para cada tarjeta a renderizar (Total, TJ, MX), agrega en cliente:

| Campo VM | Cómo se calcula |
|---|---|
| `unidades` | `SUM(resumen.total_ventas)` filtrado por `muiId` |
| `meta` | `SUM(resumen.meta)` |
| `pctCumplimiento` | `unidades / meta * 100` |
| `planProrrateado` | `pacingRow?.plan_prorrateado` |
| `ritmoVsPlanPct` | `pacingRow?.cumplimiento_vs_plan_pct` |
| `varVsMes` | `pacingRow?.var_vs_mes_anterior_pct` |
| `varVsAnio` | `pacingRow?.var_vs_anio_anterior_pct` |
| `utilidadBruta` | `SUM(finKpis.utilidad_bruta)` |
| `utilidadOperacion` | `SUM(finKpis.utilidad_operacion)` |
| `absorcionPct` | **Promedio simple** de `absorcion_pct` no-nulos (`page.tsx:266-269`). Hay un comentario explícito: para detalle fino usar `/financiero`, aquí es un indicador ejecutivo. |
| `servicio` | `SUM(pvSummary.venta_total)` |

### 3.3 Lógica de visibilidad (`page.tsx:291-297`)

```tsx
const totalVM = buildVM("total", null, "Total Honda Motos", pacing?.total);
const tjVM    = buildVM("tj", 6, "Tijuana",  pacing?.sucursales.find(s => s.mui === 6));
const mxVM    = buildVM("mx", 8, "Mexicali", pacing?.sucursales.find(s => s.mui === 8));

const visibleVMs =
  mui === null ? [totalVM, tjVM, mxVM] :
  mui === 6    ? [tjVM]                :
                 [mxVM];
```

---

## 4. Componentes UI usados

### 4.1 De `@/components/ui` (solo 3)

| Componente | Archivo | Uso en la página | Props relevantes |
|---|---|---|---|
| `LoadingState` | `components/ui/LoadingState.tsx` | `page.tsx:303` | `variant="cards"`, `count={3}`, `columns={3}` — 3 skeletons en grid |
| `MonthPicker` | `components/ui/MonthPicker.tsx` | `page.tsx:316` | `min="2024-01"`, `value={mes}`, `onChange={setMes}` — input nativo `<input type="month">` + botón "Hoy" |
| `AgencyPills` | `components/ui/AgencyPills.tsx` | `page.tsx:317` | `options={AGENCIES}`, `selected={mui}`, `onChange={setMui}` — pill "Todas" automática + pills de `constants.AGENCIES` |

**No se usa** `KPICard` ni `DataGrid` en esta página — la grilla de sucursales es custom (`SucursalCard`).

### 4.2 Subcomponentes definidos en `page.tsx`

#### `SucursalCard` (`page.tsx:132-191`)

Tarjeta por sucursal. Layout:

1. Header con título y dos `VarBadge` (vs mes ant. / vs año ant.).
2. Número grande de `unidades`.
3. Dos `ProgressBar`: cumplimiento mensual y ritmo vs plan prorrateado.
4. Grid 2-col con meta y plan prorrateado.
5. Sección financiera: UB, UO, Absorción (color por umbral), Venta servicio.

#### `VarBadge` (`page.tsx:96-112`)

Badge compacto con flecha ↑/↓/— y color semántico (`--success` / `--danger` / neutro). `null` o `0` → muestra `—`.

#### `ProgressBar` (`page.tsx:114-130`)

Barra horizontal. Color por umbral:
- `≥100%` → `var(--success)`
- `≥80%`  → `var(--warning)`
- `<80%`  → `var(--danger)`

Ancho clampado a 120% para que el overflow visual no rompa el layout. Transición `duration-500`.

---

## 5. Layout visible (`page.tsx:307-341`)

```
┌──────────────────────────────────────────────────────────┐
│  Resumen Ejecutivo                     [MonthPicker]     │
│  Vista consolidada — Honda Motos       [AgencyPills]     │
├──────────────────────────────────────────────────────────┤
│  [ Alert rojo si fetchError ]                            │
├──────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│  │  Total   │  │ Tijuana  │  │ Mexicali │                │
│  │  Card    │  │  Card    │  │  Card    │                │
│  └──────────┘  └──────────┘  └──────────┘                │
├──────────────────────────────────────────────────────────┤
│  Acumulado 2026 — Total: UB $X.XXX  UO $X.XXX            │
└──────────────────────────────────────────────────────────┘
```

- Grid responsive: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (`page.tsx:328`).
- Animación de entrada con `framer-motion` (`page.tsx:308`): `opacity/y` con `duration: 0.3`.
- Footer YTD solo se renderiza si `ytdUb !== 0 || ytdUo !== 0` (`page.tsx:333`).

---

## 6. Formatters y branding

### 6.1 Formatters (`lib/utils.ts`)

| Función | Uso en página | Locale |
|---|---|---|
| `fmtCurrency(n)` | `page.tsx:173,174,177,185,336,337` — UB/UO/Servicio/YTD | `es-MX`, MXN, 0 decimales |
| `fmtPct(n, d=1)` | `page.tsx:123,181` — ProgressBar, Absorción | 1 decimal |
| `fmtNumber`, `fmtDate` | (no usadas aquí) | `es-MX` |

### 6.2 Variables CSS (sin hex hardcoded)

Todo pinta a través de CSS vars definidas en `frontend/src/app/globals.css`:

- `--brand-primary` — rojo Honda (`#CC0000`), usado en pills activos y spinner.
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--bg-card`, `--bg-card-hover`, `--bg-skeleton`
- `--border-color`
- `--success` (verde), `--warning` (amarillo), `--danger` (rojo)

Esto mantiene dark mode y white-label automáticos. Para cambiar cliente, `constants.ts` expone `CLIENT_NAME`, `CLIENT_TAGLINE` y `AGENCIES`.

---

## 7. Estados de carga y error

### 7.1 Loading (`page.tsx:299-305`)

Primer render y cada cambio de mes:

```tsx
if (loading) return <LoadingState variant="cards" count={3} columns={3} />;
```

### 7.2 Error tolerante (`page.tsx:214-231`, `321-325`)

- Cada endpoint falla en silencio (`.catch(() => null)`), usando `res ?? []`, `fin?.kpis ?? []`, etc. como fallback.
- `fetchError` solo se setea si **los cuatro** fallan.
- Alerta roja con mensaje que apunta al puerto 8001:
  > *"No se pudieron cargar datos del servidor. Verifica que el backend esté corriendo en el puerto 8001."*
- Sin botón de retry — el usuario cambia de mes o recarga.

---

## 8. Detalles UX notables

- **No hay refetch al cambiar de sucursal.** Todo el pacing / financiero / postventa de las dos sucursales llega en una sola pasada y se filtra en cliente.
- **Proxy dev:** `next.config.js` redirige `/api/*` al backend en `localhost:8001`. Nunca al 8000 (en ese puerto corre otro dashboard).
- **Cliente Axios (`lib/api.ts`):** reintentos automáticos 3x en errores 5xx/red, con backoff.
- **Localización:** textos en español, formatters en `es-MX`.
- **Responsive:** filtros colapsan a columna en mobile (`flex-col sm:flex-row`).
- **Absorción promediada simple:** consciente y documentado — para detalle correcto existe la página `/financiero`.
