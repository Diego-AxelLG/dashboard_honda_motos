-- =============================================================================
-- EXTRACT: Presupuesto Estado de Resultados completo desde Sicofi
-- INGRESOS + COSTOS + GASTOS por rama/tipo
-- Fuente: sicofi.balanza_ppto
-- Agencias: Honda Motos Tijuana (term 1 = mui 6), Honda Motos Mexicali (term 2 = mui 8)
-- =============================================================================

SELECT
    DATE_FORMAT(CONCAT_WS('-', anio_ejercicio, mes, '01'), '%Y-%m-01') AS Fecha,
    CASE
        WHEN terminacion = 1 THEN 6  -- Honda Motos Tijuana
        WHEN terminacion = 2 THEN 8  -- Honda Motos Mexicali
    END AS Mui,
    UPPER(TRIM(seccion)) AS Seccion,
    UPPER(TRIM(rama))    AS Rama,
    UPPER(TRIM(tipo))    AS Tipo,
    ROUND(SUM(mensual), 2) AS Monto
FROM sicofi.balanza_ppto
WHERE
    anio_ejercicio IN (YEAR(CURRENT_DATE()), YEAR(CURRENT_DATE()) - 1)
    AND marca = 'HONDA MOTOS'
    AND terminacion IN (1, 2)
    AND seccion NOT IN ('', '-')
GROUP BY
    anio_ejercicio, mes, terminacion,
    seccion, rama, tipo
HAVING SUM(mensual) != 0
ORDER BY Mui, Fecha, Seccion, Rama, Tipo;
