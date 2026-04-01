-- =============================================================================
-- EXTRACT: Detalle individual de Ordenes de Servicio Abiertas (fuera de SLA)
-- Fuente: metrics.os_proceso
-- Agencias: Honda Motos Tijuana (6), Honda Motos Mexicali (8)
-- =============================================================================

SELECT
    op.marca_unidad_id AS mui,
    CURRENT_DATE AS fecha_snapshot,
    op.numero_ot,
    op.vin,
    CASE
        WHEN op.tipo_orden = 'Garantia' THEN 'Garantia con +45 dias'
        WHEN op.tipo_orden = 'Publico' THEN 'Publico con +3 dias'
        WHEN op.tipo_orden = 'Interno' THEN 'Interno con +31 dias'
        WHEN op.tipo_orden = 'Seguro' THEN 'Seguro con +60 dias'
        WHEN op.tipo_orden = 'Extension Garantia' THEN 'Extension Garantia con +45 dias'
    END AS tipo_orden,
    op.nombre_asesor,
    op.nombre_cliente,
    op.fecha_apertura,
    DATEDIFF(CURDATE(), op.fecha_apertura) AS dias_abierta,
    COALESCE(op.venta, 0) AS monto_venta,
    op.situacion,
    op.taller
FROM metrics.os_proceso op
WHERE
    DATEDIFF(CURRENT_DATE(), op.registro) <= 30
    AND op.marca_unidad_id IN (6, 8)
    AND op.tipo_orden != ''
    AND (
        (op.tipo_orden = 'Publico'
            AND DATEDIFF(CURDATE(), op.fecha_apertura) > 3)
        OR (op.tipo_orden = 'Garantia'
            AND DATEDIFF(CURDATE(), op.fecha_apertura) > 45)
        OR (op.tipo_orden = 'Interno'
            AND DATEDIFF(CURDATE(), op.fecha_apertura) > 31)
        OR (op.tipo_orden = 'Seguro'
            AND DATEDIFF(CURDATE(), op.fecha_apertura) > 60)
        OR (op.tipo_orden = 'Extension Garantia'
            AND DATEDIFF(CURDATE(), op.fecha_apertura) > 45)
    );
