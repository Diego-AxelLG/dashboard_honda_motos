-- =============================================================================
-- EXTRACT: Plan de ventas mensual por modelo
-- Fuente: hmcrm.plan_venta + modelos_plan_venta
-- Agencias: Honda Motos Tijuana (agencia 1 = mui 6), Mexicali (agencia 2 = mui 8)
-- =============================================================================

SELECT
    CASE
        WHEN plv_id_agencia = 1 THEN 6  -- Tijuana
        WHEN plv_id_agencia = 2 THEN 8  -- Mexicali
    END AS Sucursal,
    plv_anio AS Anio,
    plv_ene AS `1`,
    plv_feb AS `2`,
    plv_mar AS `3`,
    plv_abri AS `4`,
    plv_may AS `5`,
    plv_jun AS `6`,
    plv_jul AS `7`,
    plv_ago AS `8`,
    plv_sep AS `9`,
    plv_oct AS `10`,
    plv_nov AS `11`,
    plv_dic AS `12`,
    CASE
        WHEN mpv.descripcion LIKE 'GL150 CARGO' OR mpv.descripcion LIKE 'CARGO GL150' THEN 'CARGO GL150'
        WHEN mpv.descripcion LIKE '%DIO%' OR mpv.descripcion LIKE '%navi%' OR mpv.descripcion LIKE '%Wave%' OR mpv.descripcion LIKE '%CGL%125%TOOL%'
            THEN REPLACE(REGEXP_REPLACE(mpv.descripcion, '\\b(moto |motocicleta |honda |2024 |2025|)\\b', ''), ' ', '')
        ELSE REGEXP_REPLACE(mpv.descripcion, '\\b(moto |motocicleta |honda |2024 |2025|)\\b', '')
    END AS Modelo,
    1 AS descripcion
FROM hmcrm.plan_venta pv
LEFT JOIN hmcrm.modelos_plan_venta mpv ON mpv.mopv_ID = pv.plv_ID_modelo
WHERE plv_anio IN (YEAR(CURRENT_DATE()), YEAR(CURRENT_DATE()) - 1)
  AND plv_id_agencia IN (1, 2)
ORDER BY Modelo DESC, plv_anio DESC;
