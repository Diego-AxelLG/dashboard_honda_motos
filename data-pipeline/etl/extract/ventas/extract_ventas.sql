-- =============================================================================
-- EXTRACT: Ventas diarias por modelo/VIN
-- Fuente: hmcrm.vw_ventas_totales
-- Agencias: Honda Motos Tijuana (mui 6), Mexicali (mui 8)
-- Excluye: Tecate, Ensenada y cualquier otra ciudad
-- =============================================================================

SELECT
    dat_fecha_facturacion AS fecha,
    CASE
        WHEN hus_ciudad LIKE '%Mexicali%' THEN 8
        ELSE 6
    END AS mui,
    'Nuevo' AS tipo_auto,
    CASE
        WHEN data_modelo LIKE 'GL150 CARGO' OR data_modelo LIKE 'CARGO GL150' THEN 'CARGO GL150'
        WHEN data_modelo LIKE '%DIO%' OR data_modelo LIKE '%navi%' OR data_modelo LIKE '%Wave%' OR data_modelo LIKE '%CGL%125%TOOL%'
            THEN REPLACE(REGEXP_REPLACE(data_modelo, '\\b(moto |motocicleta |honda |2024 |2025 |2026 |)\\b', ''), ' ', '')
        ELSE REGEXP_REPLACE(data_modelo, '\\b(moto |motocicleta |honda |2024 |2025 |2026 |)\\b', '')
    END AS modelo,
    data_vin AS vin,
    CASE WHEN dats_compra = 'CONTADO' THEN 1 ELSE 0 END AS venta_contado,
    hus_IDhuser AS id_vendedor,
    TRIM(CONCAT_WS(' ', hus_nombre, hus_apellido)) AS nombre_vendedor,
    hus_status AS status_vendedor
FROM hmcrm.vw_ventas_totales
WHERE datco_snuevo = 'si'
  AND hus_ciudad IN ('Tijuana', 'Mexicali')
  AND dat_fecha_facturacion >= '{{ fecha_inicio }}'
ORDER BY dat_fecha_facturacion
