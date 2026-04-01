-- =============================================================================
-- EXTRACT: Ordenes de Servicio Abiertas (fuera de SLA) - Agregado
-- Fuente: metrics.os_proceso
-- Agencias: Honda Motos Tijuana (6), Honda Motos Mexicali (8)
-- =============================================================================

SELECT
    op.marca_unidad_id AS mui,
    CURRENT_DATE AS fecha_snapshot,
    CASE
        WHEN op.tipo_orden = 'Garantia' THEN 'Garantia con +45 dias'
        WHEN op.tipo_orden = 'Publico' THEN 'Publico con +3 dias'
        WHEN op.tipo_orden = 'Interno' THEN 'Interno con +31 dias'
        WHEN op.tipo_orden = 'Seguro' THEN 'Seguro con +60 dias'
        WHEN op.tipo_orden = 'Extension Garantia' THEN 'Extension Garantia con +45 dias'
    END AS tipo_orden,
    COUNT(
        CASE
            WHEN op.tipo_orden = 'Publico'
                AND DATEDIFF(CURDATE(), op.fecha_apertura) > 3 THEN op.numero_ot
            WHEN op.tipo_orden = 'Garantia'
                AND DATEDIFF(CURDATE(), op.fecha_apertura) > 45 THEN op.numero_ot
            WHEN op.tipo_orden = 'Extension Garantia'
                AND DATEDIFF(CURDATE(), op.fecha_apertura) > 45 THEN op.numero_ot
            WHEN op.tipo_orden = 'Seguro'
                AND DATEDIFF(CURDATE(), op.fecha_apertura) > 60 THEN op.numero_ot
            WHEN op.tipo_orden = 'Interno'
                AND DATEDIFF(CURDATE(), op.fecha_apertura) > 31 THEN op.numero_ot
        END
    ) AS cantidad_os
FROM metrics.os_proceso op
WHERE
    DATEDIFF(CURRENT_DATE(), op.registro) <= 30
    AND op.marca_unidad_id IN (6, 8)
    AND op.tipo_orden != ''
GROUP BY
    op.marca_unidad_id,
    op.tipo_orden;
