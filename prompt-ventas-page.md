# Prompt para Claude Code — Rediseño visual de la página /ventas Honda Motos

## Contexto

Tengo dos dashboards: Honda Autos y Honda Motos. La página de "Análisis de Ventas" de autos tiene un layout que quiero replicar en la página `/ventas` de motos. Los datos de motos ya están completos — solo necesito reacomodar el layout y agregar las líneas de mes anterior / año pasado al chart de tendencia.

Lee primero los archivos actuales antes de hacer cambios:
- `frontend/src/app/(dashboard)/ventas/page.tsx`
- `backend/app/services/ventas_service.py`
- `backend/app/api/endpoints/ventas.py`
- `frontend/src/lib/api.ts`

## Layout objetivo (el de autos)

```
┌──────────────────────────────────────────────────────────────────┐
│ Ventas                                    [MonthPicker] [Pills]  │
│ Evolución diaria, ventas por modelo y KPIs del mes               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Evolución Diaria de Ventas                    [X% vs Plan badge]│
│  Subtítulo: "Acumulado del mes actual vs plan vs mes anterior    │
│              vs año pasado"                                      │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  Chart FULL WIDTH, alto ~350px                           │    │
│  │  4 líneas:                                               │    │
│  │    — Mes actual (azul/rojo sólido, brand-primary)        │    │
│  │    — Plan (rojo punteado)                                │    │
│  │    — Mes anterior (gris sólido)                          │    │
│  │    — Año pasado (gris punteado)                          │    │
│  │                                                          │    │
│  │  Eje X: día del mes (01, 02, ... hasta hoy)              │    │
│  │  Legend abajo: ● Mes actual ○ Plan ○ Mes anterior ○ Año  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐    │
│  │  Ventas por Modelo      │  │  KPIs del Mes               │    │
│  │  "Mix completo —        │  │  "Resumen al día de hoy"    │    │
│  │   mes actual"           │  │                             │    │
│  │                         │  │  ┌──────────┐ ┌──────────┐  │    │
│  │  [Bar horizontal        │  │  │Unidades  │ │% Cumpl.  │  │    │
│  │   stacked igual         │  │  │Vendidas  │ │vs Plan   │  │    │
│  │   al actual]            │  │  │ 37 / 115 │ │Diario    │  │    │
│  │                         │  │  │          │ │ 68.5%    │  │    │
│  │                         │  │  └──────────┘ └──────────┘  │    │
│  │                         │  │  ┌──────────┐ ┌──────────┐  │    │
│  │                         │  │  │Var. MoM  │ │Var. YoY  │  │    │
│  │                         │  │  │ -15.9%   │ │  0.0%    │  │    │
│  │                         │  │  └──────────┘ └──────────┘  │    │
│  └─────────────────────────┘  └─────────────────────────────┘    │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  [ Ventas ] [ Flujos de Piso ]  (tabs, solo para la sección     │
│                                  de abajo)                       │
├──────────────────────────────────────────────────────────────────┤
│  Tab Ventas:                                                     │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Detalle VINs Vendidos                      37 registros │    │
│  │  FECHA | SUCURSAL | MODELO | VIN | TIPO                  │    │
│  │  [paginación igual que ahora]                             │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Tab Flujos:                                                     │
│  [chart de flujos igual que ahora]                               │
└──────────────────────────────────────────────────────────────────┘
```

## Cambios específicos vs el layout actual de motos

### 1. ELIMINAR — fila de 3 KPI cards sueltas arriba
Las 3 KPIs (Ventas #, Cumplimiento, Var. YoY) se eliminan de arriba. Su información se mueve a la card "KPIs del Mes" a la derecha del chart de modelos.

### 2. CHART DE TENDENCIA — de 2 líneas a 4, full width
Actualmente el chart "Venta Acumulada vs Plan" tiene 2 líneas y comparte fila con "Ventas por Modelo". Cambios:
- Hacerlo **full width** como elemento principal de la página
- Agregar **2 líneas nuevas**: mes anterior y año pasado (acumulado al mismo día)
- Agregar **badge** arriba a la derecha: "X% vs Plan Mensual" (el cumplimiento mensual, en rojo si <100, verde si ≥100)
- Cambiar título a "Evolución Diaria de Ventas"
- Subtítulo: "Acumulado del mes actual vs plan vs mes anterior vs año pasado"
- Eje X solo hasta el día actual del mes (no mostrar días futuros con línea plana)

### 3. NUEVA CARD "KPIs del Mes" — a la derecha de Ventas por Modelo
Card con título "KPIs del Mes", subtítulo "Resumen al día de hoy", conteniendo 4 mini-KPIs en grid 2×2:

| KPI | Valor | Formato | Color |
|-----|-------|---------|-------|
| **Unidades Vendidas** | `37 / 115` (ventas / meta) | número grande + meta en gris | normal |
| **% Cumplimiento vs Plan Diario** | `68.5%` (ritmo vs plan prorrateado) | porcentaje grande | rojo si <100, verde si ≥100 |
| **Var. MoM** | `-15.9%` (vs mes anterior mismo día) | porcentaje grande | rojo si negativo, verde si positivo |
| **Var. YoY** | `0.0%` (vs año anterior mismo día) | porcentaje grande | rojo si negativo, verde si positivo |

Estos datos vienen del endpoint `/ventas/cumplimiento-pacing` que ya retorna todo esto. Actualmente ese endpoint lo usa solo el Resumen Ejecutivo — ahora también lo consume `/ventas`.

### 4. VENTAS POR MODELO — se queda, se mueve
El chart horizontal stacked se mantiene igual, solo se mueve a la fila de abajo (compartiendo espacio con KPIs del Mes). Agregar subtítulo "Mix completo — mes actual".

### 5. TABS — se mueven abajo
Los tabs (Ventas / Flujos de Piso) ahora solo controlan la sección inferior (detalle vs flujos). El chart de tendencia y la fila modelo+KPIs quedan siempre visibles arriba, fuera de los tabs.

### 6. DETALLE — se mantiene igual
Tabla de VINs vendidos con paginación, sin cambios.

## Cambios backend — endpoint /ventas/tendencia

El endpoint actual retorna solo `ventas_acumuladas` y `plan_prorrateado`. Necesita 2 campos nuevos:

```json
{
  "fecha": "2026-04-01",
  "ventas_acumuladas": 5,
  "plan_prorrateado": 4,
  "ventas_mes_anterior": 3,    // NUEVO — acumulado del mismo día del mes anterior
  "ventas_anio_anterior": 7    // NUEVO — acumulado del mismo día del año anterior
}
```

**Implementación:** en `ventas_service.py`, extender la query de tendencia para hacer LEFT JOIN con las ventas acumuladas del mes anterior y del mismo mes del año pasado. Usar la misma lógica de `generate_series` + window function, pero parametrizada para los otros dos periodos. El día máximo de las series históricas debe ser `min(cutoff_day, dias_del_mes_anterior)`.

**IMPORTANTE:** Solo generar puntos hasta el día actual del mes (para mes actual). Para meses pasados, generar todos los días. Esto ya se puede inferir del dato: si `fecha > today()`, no incluir.

## Cambios frontend — page.tsx

### Nuevos imports / estado
- Importar `getVentasCumplimientoPacing` de `api.ts` (o como se llame la función)
- Agregar estado `pacing` para guardar la respuesta

### fetchData
- Agregar `getVentasCumplimientoPacing(params)` al `Promise.all`
- El endpoint de tendencia ahora retorna 4 campos por punto

### Render
1. Header con título "Ventas", subtítulo "Evolución diaria, ventas por modelo y KPIs del mes"
2. MonthPicker + AgencyPills a la derecha (sin cambios)
3. Chart de tendencia full width con 4 líneas + badge
4. Fila: Ventas por Modelo (izquierda) + KPIs del Mes card (derecha), `grid-cols-1 lg:grid-cols-2`
5. Tabs debajo solo para detalle/flujos
6. Sección de detalle/flujos según tab activo

## Estilo de las 4 líneas del chart

| Línea | Color | Estilo | Grosor |
|-------|-------|--------|--------|
| Mes actual | `var(--brand-primary)` | sólida | 2.5px |
| Plan | rojo / `var(--danger)` | dashed `strokeDasharray="8 4"` | 2px |
| Mes anterior | `var(--text-muted)` | sólida | 1.5px |
| Año pasado | `var(--text-muted)` con opacidad 0.5 | dashed `strokeDasharray="4 4"` | 1.5px |

El badge "X% vs Plan Mensual":
- Fondo rojo claro + texto rojo si cumplimiento < 100%
- Fondo verde claro + texto verde si cumplimiento ≥ 100%
- Posición: arriba a la derecha del chart card

## Estilo de KPIs del Mes

- Card con mismo estilo que las demás (border, radius, shadow)
- Título "KPIs del Mes" bold, subtítulo "Resumen al día de hoy" en gris
- Grid 2×2 de mini-cards dentro:
  - Cada mini-card con borde gris sutil, padding, border-radius
  - Label arriba en `text-xs text-muted uppercase`
  - Valor grande en `text-2xl font-bold`
  - Colores: rojo para negativos/bajo plan, verde para positivos/sobre plan
  - "Unidades Vendidas" muestra `37 / 115` donde 115 es la meta, en gris más pequeño

## Notas importantes

- NO uses el puerto 8000, el backend corre en 8001
- Ensenada (mui=7) no existe, no incluir
- Mantén el `"use client"` y el patrón de fetch existente
- Usa CSS variables del proyecto, no colores hardcoded
- El chart de tendencia debe usar `ResponsiveContainer` de Recharts
- Mantén los tabs de Flujos de Piso funcionales
- Mantén la paginación del detalle sin cambios
