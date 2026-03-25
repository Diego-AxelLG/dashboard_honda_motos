-- ============================================================================
-- TEMPLATE: Adaptar a la estructura del CRM/ERP del cliente
-- Los placeholders {{ }} son inyectados por inject_params() en Python
-- ============================================================================
-- Patrones demostrados:
--   1. CASE WHEN para mapear IDs del sistema origen → IDs del DWH (sucursales)
--   2. CASE WHEN para normalizar nombres de producto/modelo
--   3. CASE WHEN para derivar flags booleanos desde campos del origen
--   4. JOINs a tablas de dimensión del CRM (clientes, vendedores, productos)
--   5. Cálculos derivados (días entre fechas, montos fallback)
--   6. Placeholders {{ fecha_inicio }} y {{ sucursales_permitidas }}
-- ============================================================================

SELECT
    -- =========================================================================
    -- CLAVES DE NEGOCIO
    -- =========================================================================
    -- id_oportunidad es la clave UNIQUE en fact_ventas del DWH.
    -- El UPSERT en Python usa ON CONFLICT (id_oportunidad) DO UPDATE.
    v.id                            AS id_oportunidad,
    DATE(v.fecha_cierre)            AS fecha,

    -- =========================================================================
    -- MAPEO DE SUCURSALES: CRM id_branch → DWH id_sucursal
    -- =========================================================================
    -- El sistema origen usa un ID interno (id_branch) que no coincide con
    -- el ID del DWH (id_sucursal). Este CASE WHEN es el puente entre ambos.
    -- Agregar una fila por cada sucursal del cliente.
    -- El ELSE captura sucursales no mapeadas para detectar datos nuevos.
    CASE
        WHEN v.id_branch = 10 THEN 1   -- Sucursal Centro
        WHEN v.id_branch = 20 THEN 2   -- Sucursal Norte
        WHEN v.id_branch = 30 THEN 3   -- Sucursal Sur
        WHEN v.id_branch = 40 THEN 4   -- Sucursal Oriente
        WHEN v.id_branch = 50 THEN 5   -- Sucursal Poniente
        ELSE v.id_branch                -- No mapeado (revisar si aparece)
    END                                 AS id_sucursal,

    -- =========================================================================
    -- FOREIGN KEYS DIRECTAS (no requieren mapeo)
    -- =========================================================================
    v.id_user                       AS id_vendedor,

    -- =========================================================================
    -- NORMALIZACION DE MODELO / PRODUCTO
    -- =========================================================================
    -- El CRM guarda texto libre ("CIVIC TOURING 2025", "civic tour", etc.).
    -- Normalizamos a un catálogo limpio para dim_modelos.
    -- LIKE con LOWER() absorbe variaciones de mayúsculas y abreviaciones.
    CASE
        WHEN LOWER(p.nombre) LIKE '%sedan basico%'    THEN 'Sedán Básico'
        WHEN LOWER(p.nombre) LIKE '%sedan premium%'   THEN 'Sedán Premium'
        WHEN LOWER(p.nombre) LIKE '%suv compact%'     THEN 'SUV Compacta'
        WHEN LOWER(p.nombre) LIKE '%suv mediana%'     THEN 'SUV Mediana'
        WHEN LOWER(p.nombre) LIKE '%pickup%'           THEN 'Pickup'
        WHEN LOWER(p.nombre) LIKE '%electrico%'
          OR LOWER(p.nombre) LIKE '%ev%'               THEN 'Eléctrico'
        ELSE 'Otro'
    END                                 AS modelo,

    -- =========================================================================
    -- FLAGS BOOLEANOS DERIVADOS
    -- =========================================================================
    -- Convertir valores del CRM (strings, ints, enums) a TRUE/FALSE
    -- para columnas booleanas del DWH.
    CASE
        WHEN v.tipo_unidad != 'Seminuevo' THEN TRUE
        ELSE FALSE
    END                                 AS es_nuevo,

    -- =========================================================================
    -- MONTOS Y CALCULOS
    -- =========================================================================
    -- COALESCE previene NULLs que romperían agregaciones (SUM, AVG).
    COALESCE(v.monto_total, 0)      AS monto,

    -- Días de inventario: diferencia entre fecha de venta y fecha de ingreso.
    -- DATEDIFF es MySQL; en PostgreSQL sería (v.fecha_cierre - inv.fecha_ingreso).
    CAST(
        DATEDIFF(v.fecha_cierre, inv.fecha_ingreso) AS SIGNED
    )                                   AS dias_inventario,

    -- =========================================================================
    -- DATOS ENRIQUECIDOS DESDE JOINS
    -- =========================================================================
    TRIM(CONCAT(
        COALESCE(c.nombre, ''), ' ', COALESCE(c.apellido, '')
    ))                                  AS nombre_cliente,
    c.email                             AS email_cliente,
    vend.nombre                         AS nombre_vendedor

-- =========================================================================
-- TABLAS ORIGEN
-- =========================================================================
-- Tabla principal: transacciones de venta del CRM.
FROM sistema_crm.ventas v

-- JOIN a clientes: enriquecer con nombre, email.
-- LEFT JOIN porque algunas ventas (mostrador, contado rápido) no tienen cliente.
LEFT JOIN sistema_crm.clientes c
    ON c.id = v.id_cliente

-- JOIN a productos/catálogo: obtener nombre del modelo para normalización.
LEFT JOIN sistema_crm.productos p
    ON p.id = v.id_producto

-- JOIN a vendedores: obtener nombre para validación (el id_vendedor ya viene directo).
LEFT JOIN sistema_crm.vendedores vend
    ON vend.id = v.id_user

-- JOIN a inventario: calcular días de inventario.
-- Subquery con GROUP BY + MAX porque un producto puede tener múltiples ingresos.
LEFT JOIN (
    SELECT
        id_producto,
        MAX(fecha_ingreso) AS fecha_ingreso
    FROM sistema_crm.inventario
    WHERE fecha_ingreso IS NOT NULL
    GROUP BY id_producto
) inv
    ON inv.id_producto = v.id_producto

-- =========================================================================
-- FILTROS
-- =========================================================================
WHERE
    -- Solo ventas confirmadas (excluir canceladas, pendientes, etc.)
    v.status = 1

    -- Ventana de fechas: inject_params() reemplaza el placeholder.
    -- --full usa FECHA_INICIO (.env), --dias N calcula hoy - N.
    AND v.fecha_cierre >= '{{ fecha_inicio }}'

    -- Filtro de sucursales: solo las configuradas en .env.
    -- El CASE WHEN de arriba mapea id_branch → id_sucursal,
    -- pero el filtro WHERE opera sobre el ID original del CRM.
    AND v.id_branch IN ({{ sucursales_permitidas }})

-- Orden cronológico para carga consistente.
ORDER BY v.fecha_cierre;
