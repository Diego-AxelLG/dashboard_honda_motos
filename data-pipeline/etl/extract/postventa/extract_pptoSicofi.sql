-- =============================================================================
-- EXTRACT: Presupuesto Ingresos Servicio + MO desde Sicofi
-- Fuente: sicofi.balanza_ppto
-- Agencias: Honda Motos Tijuana (term 1 = mui 6), Honda Motos Mexicali (term 2 = mui 8)
-- =============================================================================

WITH BasePPTO AS (
    SELECT
        mensual,
        rama,
        tipo,
        CASE
            WHEN terminacion = 1 THEN 6  -- Honda Motos Tijuana
            WHEN terminacion = 2 THEN 8  -- Honda Motos Mexicali
        END AS Mui,
        DATE_FORMAT(CONCAT_WS('-', anio_ejercicio, mes, '01'), '%Y-%m-01') AS Fecha
    FROM sicofi.balanza_ppto
    WHERE
        anio_ejercicio IN (YEAR(CURRENT_DATE()), YEAR(CURRENT_DATE()) - 1)
        AND marca = 'HONDA MOTOS'
        AND terminacion IN (1, 2)
        AND seccion = 'INGRESOS'
)

SELECT
    Mui,
    Fecha,
    'IngresosServicio' AS TipoPPTO,
    ROUND(SUM(mensual), 2) AS PlanPPTO
FROM BasePPTO
WHERE rama IN ('SERVICIO')
  AND Mui IS NOT NULL
GROUP BY Mui, Fecha

UNION ALL

SELECT
    Mui,
    Fecha,
    'IngresosMO' AS TipoPPTO,
    ROUND(SUM(mensual), 2) AS PlanPPTO
FROM BasePPTO
WHERE tipo = 'MO'
  AND Mui IS NOT NULL
GROUP BY Mui, Fecha;
