-- =============================================================================
-- EXTRACT: Estado de Resultados — P&L Reales
-- Fuente: sicofi.catalogo_balanza + sicofi.balanza
-- Agencias: Honda Motos Tijuana (term 4 → MUI 6), Mexicali (term 6 → MUI 8)
--
-- NOTA: catalogo_balanza usa marca='HONDA MOTOS' pero balanza usa marca='HONDA'
--       con terminaciones 4 (Tijuana), 5 (Ensenada, cerrada), 6 (Mexicali)
-- =============================================================================

SELECT
    CAST(CONCAT_WS('-', b.anio_ejercicio, b.mesi, '01') AS DATE) AS Fecha,
    CASE
        WHEN b.terminacion = 4 THEN 6   -- Honda Motos Tijuana
        WHEN b.terminacion = 6 THEN 8   -- Honda Motos Mexicali
    END AS Mui,
    UPPER(TRIM(cb.seccion)) AS Seccion,
    UPPER(TRIM(cb.rama))    AS Rama,
    UPPER(TRIM(cb.tipo))    AS Tipo,
    ROUND(SUM(b.abono - b.cargo), 2) AS Monto
FROM sicofi.catalogo_balanza cb
INNER JOIN sicofi.balanza b
    ON cb.cuenta = b.cuenta AND b.marca = 'HONDA'
WHERE
    cb.marca = 'HONDA MOTOS'
    AND b.terminacion IN (4, 6)
    AND cb.seccion IN ('INGRESOS', 'COSTOS', 'GASTOS')
    AND b.anio_ejercicio >= 2024
GROUP BY b.anio_ejercicio, b.mesi, b.terminacion, cb.seccion, cb.rama, cb.tipo
HAVING SUM(b.abono - b.cargo) != 0
ORDER BY Mui, Fecha, Seccion, Rama, Tipo;
