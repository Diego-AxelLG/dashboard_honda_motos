# BI Dashboard — Frontend Boilerplate

## Stack

- **Next.js 14** (App Router), React 18, TypeScript strict
- **Tremor v3** + Recharts para visualizaciones y charts
- **TailwindCSS** con variables CSS semanticas (tema claro/oscuro)
- **Axios** para API client con retry automatico (3 reintentos en 5xx)
- **Framer Motion** para animaciones (login, transiciones)

## Personalizacion de Marca (5 minutos)

| Paso | Archivo | Que cambiar |
|------|---------|-------------|
| 1 | `src/app/globals.css` | Variables CSS: `--brand-primary`, `--brand-secondary`, `--brand-accent` y toda la paleta de colores |
| 2 | `public/` | Reemplazar logo/favicon |
| 3 | `src/lib/constants.ts` | `CLIENT_NAME` y `CLIENT_TAGLINE` — se propagan a sidebar, header, login y titulo de pagina |

```css
/* globals.css — solo cambiar estos 3 valores para recolorear todo el dashboard */
:root {
  --brand-primary: #3b82f6;    /* Botones, pills activos, acentos */
  --brand-secondary: #1e40af;  /* Sidebar activo fondo */
  --brand-accent: #60a5fa;     /* Sidebar activo texto, highlights */
}
```

## Estructura de Archivos

```
src/
├── app/
│   ├── globals.css              ← Paleta de colores (brand + light/dark)
│   ├── layout.tsx               ← Root layout (ThemeProvider + LayoutShell)
│   ├── (dashboard)/
│   │   └── page.tsx             ← Resumen ejecutivo (template con mock data)
│   └── login/
│       └── page.tsx             ← Autenticacion (glassmorphism + particles)
├── components/
│   ├── layout/
│   │   ├── LayoutShell.tsx      ← Shell principal (sidebar + header + main)
│   │   ├── Sidebar.tsx          ← Navegacion lateral (4 rutas genericas)
│   │   ├── Header.tsx           ← Header movil con hamburger menu
│   │   └── ThemeToggle.tsx      ← Boton claro/oscuro
│   ├── login/
│   │   └── ParticleField.tsx    ← Canvas animado con particulas interactivas
│   └── ui/
│       ├── index.ts             ← Barrel export
│       ├── KPICard.tsx          ← Tarjeta de indicador con delta badge
│       ├── AgencyPills.tsx      ← Filtro horizontal tipo pill
│       ├── DataGrid.tsx         ← Grid clickeable + detail panel
│       ├── MonthPicker.tsx      ← Selector de mes/anio (controlado)
│       └── LoadingState.tsx     ← Skeletons (cards/table) y spinner
└── lib/
    ├── api.ts                   ← Axios instance + retry interceptor
    ├── constants.ts             ← CLIENT_NAME, CLIENT_TAGLINE
    └── utils.ts                 ← cn(), fmtCurrency(), fmtNumber(), fmtPct(), fmtDate()
```

## Patrones Reutilizables

### Grid + Detail Panel

El patron principal del dashboard: un grid de tarjetas clickeables que expande un panel de detalle debajo al seleccionar.

```tsx
import { DataGrid } from "@/components/ui";

<DataGrid<MyItem>
  items={data}
  getId={(item) => item.id}
  selectedId={selectedId}
  onSelect={(item) => setSelectedId(selectedId === item.id ? null : item.id)}
  renderCard={(item, isSelected) => <MyCard item={item} />}
  renderDetail={(item) => <MyDetailTable item={item} />}
/>
```

### KPI Cards

Tarjetas con valor principal, formato automatico y badge de cambio porcentual.

```tsx
import { KPICard } from "@/components/ui";

<KPICard title="Ventas"   value={142}       format="number"   delta={12.5} />
<KPICard title="Ingresos" value={2_350_000} format="currency" delta={-3.2} />
<KPICard title="Cumpl."   value={92}        format="percent"  delta={4.0}  />
```

### Agency Pills (filtros)

Filtro generico por sucursal/categoria. Siempre incluye "Todas".

```tsx
import { AgencyPills } from "@/components/ui";

<AgencyPills
  options={[
    { label: "Tijuana", value: 1 },
    { label: "Mexicali", value: 2 },
  ]}
  selected={selected}
  onChange={setSelected}
/>
```

### Month Picker

Selector de mes controlado por props (sin contexto global).

```tsx
import { MonthPicker } from "@/components/ui";

<MonthPicker value={mes} onChange={setMes} />
```

### Loading States

Skeletons que replican la forma de los componentes reales.

```tsx
import { LoadingState } from "@/components/ui";

<LoadingState variant="cards" count={4} columns={4} />  {/* Grid skeleton */}
<LoadingState variant="table" count={5} />               {/* Table skeleton */}
<LoadingState variant="spinner" />                        {/* Spinner */}
```

## Desarrollo

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # Build de produccion
npm run lint   # ESLint
```

## Proxy API

`next.config.js` tiene un rewrite que proxea `/api/*` al backend en `:8000` durante desarrollo:

```js
// Solo en dev — en produccion el frontend es estatico (output: "export")
{
  source: "/api/:path*",
  destination: "http://127.0.0.1:8000/api/:path*",
}
```

Para apuntar a otro backend, definir `NEXT_PUBLIC_API_URL` en `.env.local`:

```bash
NEXT_PUBLIC_API_URL=https://api.micliente.com
```

## Tema Claro / Oscuro

El toggle esta en el header (desktop: esquina superior derecha, movil: dentro del header). Usa `next-themes` con clase CSS (`.dark`). Todas las variables semanticas se redefinen en `.dark { ... }` dentro de `globals.css`.

### Variables CSS disponibles

| Variable | Uso | Tailwind class |
|----------|-----|----------------|
| `--brand-primary` | Botones, acentos | `bg-brand`, `text-brand` |
| `--brand-secondary` | Fondo activo sidebar | `bg-brand-secondary` |
| `--brand-accent` | Texto activo sidebar | `text-brand-accent` |
| `--bg-main` | Fondo principal | `bg-surface-main` |
| `--bg-card` | Fondo de tarjetas | `bg-surface-card` |
| `--bg-card-hover` | Hover en tarjetas | `bg-surface-card-hover` |
| `--bg-sidebar` | Fondo sidebar/header | `bg-surface-sidebar` |
| `--border-color` | Bordes sutiles | `border-border` |
| `--text-primary` | Texto principal | `text-content` |
| `--text-secondary` | Texto secundario | `text-content-secondary` |
| `--text-muted` | Labels, hints | `text-content-muted` |
| `--success` | Positivo, cumplido | `text-success` |
| `--warning` | Alerta, parcial | `text-warning` |
| `--danger` | Negativo, error | `text-danger` |
