-- =============================================================================
-- EXTRACT: Units In Operation (VINs unicos atendidos en servicio)
-- Fuente: metrics.servicio_ventas
-- Agencias: Honda Motos Tijuana (6), Honda Motos Mexicali (8)
-- =============================================================================

WITH sv_clean AS (
    SELECT *, TRIM(vin) AS vin_clean
    FROM metrics.servicio_ventas
    WHERE LOWER(LEFT(factura, 3)) IN ('smt', 'smm')
      AND tipo_orden = 'Publico'
      AND taller <> 'Hojalateria y Pintura'
      AND marca_unidad_id IN (6, 8)
)
SELECT
    marca_unidad_id AS mui,
    COUNT(DISTINCT CASE WHEN DATEDIFF(CURRENT_DATE, fecha_factura) BETWEEN 0 AND 365 THEN vin_clean END) AS UIO,
    COUNT(DISTINCT CASE WHEN DATEDIFF(CURRENT_DATE, fecha_factura) BETWEEN 31 AND 396 THEN vin_clean END) AS UIO_MP,
    COUNT(DISTINCT CASE WHEN DATEDIFF(CURRENT_DATE, fecha_factura) BETWEEN 366 AND 730 THEN vin_clean END) AS UIO_AP
FROM sv_clean
GROUP BY marca_unidad_id;
