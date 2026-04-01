-- =============================================================================
-- EXTRACT: Inventario de Refacciones
-- Fuente: metrics.refacciones_inventario
-- Agencias: Honda Motos Tijuana (6), Honda Motos Mexicali (8)
-- =============================================================================

SELECT
    ri.marca_unidad_id AS mui,
    MAX(ri.registro) AS fecha_snapshot,
    ROUND(SUM(IF(
        DATEDIFF(CURRENT_DATE(), ri.ultima_compra) <= 180
        AND ri.ultima_venta != '0000-00-00', ri.costo, 0
    )), 2) AS movimiento,
    ROUND(SUM(IF(
        DATEDIFF(CURRENT_DATE(), ri.ultima_compra) <= 180
        AND ri.ultima_venta = '0000-00-00', ri.costo, 0
    )), 2) AS nuevo,
    ROUND(SUM(IF(
        DATEDIFF(CURRENT_DATE(), ri.ultima_compra) BETWEEN 180 AND 365, ri.costo, 0
    )), 2) AS tec_obsoleto,
    ROUND(SUM(IF(
        DATEDIFF(CURRENT_DATE(), ri.ultima_compra) >= 365, ri.costo, 0
    )), 2) AS obsoleto
FROM metrics.refacciones_inventario ri
WHERE
    ri.registro = (SELECT MAX(registro) FROM metrics.refacciones_inventario WHERE marca_unidad_id IN (6, 8))
    AND ri.almacen NOT LIKE 'RD%'
    AND ri.existencia != 0
    AND ri.marca_unidad_id IN (6, 8)
GROUP BY
    ri.marca_unidad_id;
