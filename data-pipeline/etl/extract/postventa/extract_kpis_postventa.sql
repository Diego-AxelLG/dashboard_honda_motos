-- =============================================================================
-- EXTRACT: KPIs Postventa — OTs + Horas MO (DMS)
-- Fuente: metrics.servicio_ventas
-- Agencias: Honda Motos Tijuana (MUI 6), Mexicali (MUI 8)
-- Solo prefijos SMT (Tijuana) y SMM (Mexicali), tipo_orden Publico
-- =============================================================================

SELECT
    sv.marca_unidad_id AS MUI,
    sv.fecha_factura AS fecha,
    ROUND(COUNT(*), 0) AS Cantidad,
    ROUND(SUM(sv.total_hrs_mo), 2) AS Horas_MO,
    ROUND(SUM(sv.venta_mo - sv.descuento_mo), 2) AS Venta_MO,
    ROUND(SUM(
        sv.venta_mo + sv.venta_tot + sv.venta_partes + sv.venta_materiales
      - sv.descuento_mo - sv.descuento_tot - sv.descuento_partes - sv.descuento_materiales
    ), 2) AS Venta_Total_Sin_IVA
FROM servicio_ventas AS sv
    RIGHT JOIN (
        SELECT MAX(id) AS id, numero_ot
        FROM servicio_ventas
        WHERE
            fecha_factura >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') - INTERVAL 27 MONTH
            AND fecha_factura <= LAST_DAY(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'))
            AND marca_unidad_id IN (6, 8)
            AND LOWER(LEFT(factura, 3)) IN ('smt', 'smm')
            AND tipo_orden = 'Publico'
        GROUP BY numero_ot, tipo_orden
        ORDER BY fecha_factura DESC
    ) AS sv2 ON sv.id = sv2.id
WHERE
    sv.fecha_factura >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') - INTERVAL 24 MONTH
    AND sv.fecha_factura <= LAST_DAY(DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'))
GROUP BY
    sv.marca_unidad_id,
    DATE_FORMAT(sv.fecha_factura, '%Y-%m-%d');
