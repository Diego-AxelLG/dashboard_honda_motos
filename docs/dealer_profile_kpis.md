# Dealer Profile KPIs — Honda Motos

**Fecha de análisis**: 2026-03-31
**Fuente**: `metrics.dealer_profile_valor` + `dealer_profile` + `dealer_profile_seccion`
**Sucursales**: Tijuana (mui 6), Mexicali (mui 8)
**Total KPIs activos en catálogo**: 60 (CLAUDE.md decía 51 — corregir)
**Datos disponibles desde**: 2018-01 (la mayoría)

---

## Resumen por sección

| Sección | KPIs | Con datos | Sin datos | Decisión |
|---------|------|-----------|-----------|----------|
| Venta autos nuevos | 11 | 7 | 4 | P1: 7, Descartar: 4 |
| Venta autos seminuevos | 7 | 7 | 0 | Descartar todos (actividad ~0) |
| Venta servicio | 23 | 20 | 3 | P1: 14, P2: 6, Descartar: 3 |
| Gastos | 8 | 8 | 0 | P2: 8 |
| OS Abiertas | 6 | 4 | 2 | P1: 4, Descartar: 2 |
| UIO | 2 | 2 | 0 | P1: 2 |
| Saldo unidades Flujo | 3 | 0 | 3 | Descartar todos |
| **Total** | **60** | **48** | **12** | **P1: 27, P2: 14, Descartar: 19** |

---

## DESCARTAR (19 KPIs)

### Sin datos para Honda Motos (12)

| ID | Nombre | Sección | Razón |
|----|--------|---------|-------|
| 8 | Seguros colocados | Venta autos nuevos | Sin datos (registros=0 para mui 6,8) |
| 9 | UDI | Venta autos nuevos | Sin datos |
| 10 | Créditos colocados | Venta autos nuevos | Sin datos |
| 11 | Extensión de garantía | Venta autos nuevos | Sin datos |
| 35 | Facturación TOT | Venta servicio | Sin datos |
| 55 | Facturación Garantías | Venta servicio | Sin datos |
| 56 | Facturación Seguro | Venta servicio | Sin datos |
| 73 | Seguro | OS Abiertas | Sin datos |
| 75 | Extension Garantia | OS Abiertas | Sin datos |
| 77 | Unidades Flujo Nuevo | Saldo unidades Flujo | Sin datos |
| 78 | Unidades Flujo Demo | Saldo unidades Flujo | Sin datos |
| 79 | Unidades Flujo Seminuevo | Saldo unidades Flujo | Sin datos |

### Sección seminuevos completa (7) — negocio inexistente

| ID | Nombre | Sección | Razón |
|----|--------|---------|-------|
| 15 | Ventas $ | Venta autos seminuevos | Avg $2,463 (vs $1.9M nuevos). 0.13 unidades/mes promedio. |
| 16 | Ventas # | Venta autos seminuevos | 0 unidades en marzo 2026 ambas sucursales |
| 17 | Utilidad bruta | Venta autos seminuevos | Avg $104 |
| 18 | Precio promedio | Venta autos seminuevos | Avg $1,268 (no hay volumen) |
| 19 | Margen promedio | Venta autos seminuevos | Avg $171 |
| 20 | Dias venta promedio | Venta autos seminuevos | 301 días promedio, solo 22 registros en 8 años |
| 21 | Inventario disponible | Venta autos seminuevos | Solo TJ, ~2 unidades. MX sin datos. |

---

## PRIORIDAD 1 — Dashboard principal (27 KPIs)

KPIs que el gerente necesita ver a diario/semanal. Se muestran en tableros de Resumen, Ventas, y Postventa.

### Venta autos nuevos (7)

| ID | Nombre | Valor ejemplo TJ Mar-26 | Valor ejemplo MX Mar-26 | Notas |
|----|--------|------------------------|------------------------|-------|
| 1 | Ventas $ | $3,309,444 | $1,554,426 | Redundante con fact_ventas pero es "cifra oficial Honda" |
| 2 | Ventas # | 86 | 38 | Idem — útil para validación cruzada |
| 3 | Utilidad bruta | $472,410 | $218,053 | No lo tenemos de otra fuente |
| 4 | Precio promedio | $38,482 | $40,906 | Derivable de ventas pero ya calculado |
| 5 | Margen promedio | $5,493 | $5,738 | No lo tenemos de otra fuente |
| 6 | Dias venta promedio | 28.9 | 41.3 | Indicador clave de rotación |
| 7 | Inventario disponible | 203 | 26 | Complementa fact_inventario |

### Venta servicio — operativo (14)

| ID | Nombre | Valor ejemplo TJ Mar-26 | Valor ejemplo MX Mar-26 | Notas |
|----|--------|------------------------|------------------------|-------|
| 29 | Servicio $ | $807,823 | $302,479 | Ingreso total servicio |
| 30 | Cantidad O/S público | 226 | 107 | OS cerradas del mes |
| 33 | Facturación MO | $166,841 | $75,153 | Mano de obra facturada |
| 34 | Facturación Ref | $162,255 | $83,507 | Refacciones facturadas |
| 48 | Total Horas MO | 518 | 247 | Capacidad utilizada |
| 57 | Horas MO público | 518 | 247 | Mismo valor que 48 en motos (todo es público) |
| 49 | Ticket promedio público | $1,437 | $1,483 | Ingreso promedio por OS |
| 69 | Ticket promedio hrs. público | 2.29 | 2.31 | Horas promedio por OS |
| 36 | MO x O/S público | $719 | $702 | MO promedio por OS |
| 37 | REF x O/S público | $718 | $780 | Refacciones promedio por OS |
| 41 | TEMOC | $314 | $305 | Ticket de MO equivalente en capacidad |
| 47 | Técnicos | 3 | 1 | Headcount taller |
| 44 | Productividad por taller | 90% | 129% | Horas productivas / horas disponibles |
| 38 | Tasa de absorción | 141% | 104% | Gastos fijos cubiertos por utilidad servicio (>100% = sano) |

**Nota sobre id 57 (Horas MO público) vs id 48 (Total Horas MO)**: En motos, virtualmente todo el servicio es público. Los valores son iguales. Podríamos descartar uno, pero mantenerlos permite detectar anomalías si aparece servicio interno.

### OS Abiertas (4)

| ID | Nombre | Valor ejemplo TJ Mar-26 | Valor ejemplo MX Mar-26 | Notas |
|----|--------|------------------------|------------------------|-------|
| 76 | Total | 66 | 53 | Suma de todos los tipos |
| 71 | Público | 24 | 9 | Las más urgentes (SLA 3 días) |
| 72 | Garantía | 2 | — | SLA 45 días |
| 74 | Interno | 40 | 44 | SLA 31 días |

**Nota**: Estos KPIs son el "conteo oficial Honda" al cierre del mes. Nuestro `fact_os_abierta` da el snapshot diario con más detalle (tipo, días abierta, asesor). Ambos se complementan: dealer profile para el semáforo mensual, fact para drill-down.

### UIO (2)

| ID | Nombre | Valor ejemplo TJ Mar-26 | Valor ejemplo MX Mar-26 | Notas |
|----|--------|------------------------|------------------------|-------|
| 81 | Units In Operations | 5,302 | 2,058 | VINs únicos con servicio (parque vehicular activo) |
| 80 | Units Not Active | 596 | 250 | VINs que dejaron de venir a servicio |

---

## PRIORIDAD 2 — Tablero financiero (14 KPIs)

KPIs que se revisan mensualmente. Se muestran en el tablero Financiero junto al Estado de Resultados presupuestado.

### Gastos (8)

| ID | Nombre | Valor ejemplo TJ Mar-26 | Valor ejemplo MX Mar-26 | Notas |
|----|--------|------------------------|------------------------|-------|
| 60 | Total gastos | $328,169 | $163,039 | Suma de fijos+variables+financieros+otros |
| 61 | Fijos | $198,968 | $92,285 | Nómina, renta, etc. |
| 62 | Variables | $83,452 | $66,722 | Comisiones, publicidad, etc. |
| 63 | Financieros | $22,906 | $0 | Intereses, comisiones bancarias |
| 64 | Otros | $22,842 | $4,032 | No clasificados |
| 58 | Punto de equilibrio | -19.7% | 5.1% | % de ventas necesario para cubrir gastos (negativo = superávit) |
| 68 | ROS (Return on Sales) | 13.9% | 10.2% | Utilidad neta / ventas totales |
| 65 | Utilidad Neta | $580,718 | $189,051 | Bottom line |

### Venta servicio — financiero (6)

| ID | Nombre | Valor ejemplo TJ Mar-26 | Valor ejemplo MX Mar-26 | Notas |
|----|--------|------------------------|------------------------|-------|
| 31 | Utilidad Bruta servicio | $380,359 | $134,037 | Ingreso - costo directo |
| 43 | Inventario refacciones (total $) | $1,796,654 | $700,717 | Valor total del inventario |
| 51 | Inv. nuevo | $136,514 (8%) | $39,009 (6%) | sub_valor = % del total |
| 52 | Inv. movimiento | $528,667 (29%) | $211,834 (30%) | Sano: con rotación |
| 53 | Inv. técnicamente obsoleto | $523,733 (29%) | $201,489 (29%) | 180-365 días sin movimiento |
| 54 | Inv. obsoleto | $607,740 (34%) | $248,386 (35%) | >365 días sin movimiento |

**Alerta**: 63% del inventario de refacciones en TJ y 64% en MX es obsoleto o técnicamente obsoleto. Esto es un hallazgo importante para el cliente.

---

## Notas de implementación

### Redundancia con facts propios

| Dealer Profile KPI | Fuente propia | Decisión |
|---------------------|---------------|----------|
| Ventas $ / # (id 1,2) | `fact_ventas` (extraído de hmcrm) | Mantener ambos. DP es "cifra Honda oficial" al cierre. fact_ventas tiene detalle diario por VIN. Mostrar DP en resumen mensual, fact_ventas en drill-down. |
| OS Abiertas (id 71-76) | `fact_os_abierta` (extraído de metrics) | Mantener ambos. DP = semáforo mensual. fact = snapshot diario con detalle. |
| UIO (id 80,81) | `fact_uio` (extraído de metrics) | Mantener ambos. Validación cruzada. |
| Inv. refacciones (id 43,51-54) | `fact_inv_refacciones` (extraído de metrics) | Mantener ambos. DP = consolidado mensual $. fact = detalle por parte. |

### Estructura recomendada para fact_dealer_profile

```sql
CREATE TABLE dwh.fact_dealer_profile (
    id              SERIAL PRIMARY KEY,
    fecha           DATE NOT NULL,          -- primer día del mes
    id_sucursal     INTEGER NOT NULL,       -- 6 o 8
    dealer_profile_id INTEGER NOT NULL,     -- FK al catálogo
    nombre          VARCHAR(100) NOT NULL,  -- nombre del KPI
    seccion         VARCHAR(100) NOT NULL,  -- sección
    valor           NUMERIC(14,2),
    sub_valor       NUMERIC(14,2),          -- % en inventario, 0 en el resto
    prioridad       SMALLINT NOT NULL,      -- 1 o 2
    UNIQUE (fecha, id_sucursal, dealer_profile_id)
);
```

### IDs a incluir en extract_dealer_profile.sql

```sql
-- P1 (27 KPIs): dashboard principal
AND v.dealer_profile_id IN (
    1, 2, 3, 4, 5, 6, 7,                    -- Venta nuevos
    29, 30, 33, 34, 36, 37, 38, 41,         -- Servicio operativo
    44, 47, 48, 49, 57, 69,                  -- Servicio operativo (cont.)
    71, 72, 74, 76,                          -- OS Abiertas
    80, 81                                   -- UIO
)

-- P2 (14 KPIs): tablero financiero
OR v.dealer_profile_id IN (
    31, 43, 51, 52, 53, 54,                 -- Servicio financiero
    58, 60, 61, 62, 63, 64, 65, 68          -- Gastos
)
```

Total: **41 KPIs** de 60 originales. Descartamos 19.
