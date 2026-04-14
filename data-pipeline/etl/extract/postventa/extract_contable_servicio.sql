-- =============================================================================
-- EXTRACT: Venta Total Servicio (contable)
-- Fuente: sicofi.catalogo_balanza + sicofi.balanza
-- Filtro: INGRESOS / SERVICIO
-- Agencias: Honda Motos Tijuana (term 4 → MUI 6), Mexicali (term 6 → MUI 8)
-- =============================================================================

SELECT
    CAST(CONCAT_WS('-', b.anio_ejercicio, b.mesi, '01') AS DATE) AS Fecha,
    ROUND(SUM(b.abono - b.cargo), 2) AS Monto,
    CASE
        WHEN b.terminacion = 4 THEN 6   -- Honda Motos Tijuana
        WHEN b.terminacion = 6 THEN 8   -- Honda Motos Mexicali
    END AS Mui,
    'Ingreso' AS Tipo
FROM sicofi.catalogo_balanza cb
INNER JOIN sicofi.balanza b
    ON cb.cuenta = b.cuenta AND b.marca = 'HONDA'
WHERE
    cb.marca = 'HONDA MOTOS'
    AND b.terminacion IN (4, 6)
    AND cb.seccion = 'INGRESOS'
    AND cb.rama = 'SERVICIO'
    AND b.anio_ejercicio IN (YEAR(CURRENT_DATE), YEAR(CURRENT_DATE) - 1)
GROUP BY b.terminacion, b.anio_ejercicio, b.mesi
ORDER BY Mui, Fecha;
