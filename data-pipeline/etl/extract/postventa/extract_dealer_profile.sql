-- =============================================================================
-- EXTRACT: Dealer Profile KPIs mensuales (rolling 2 meses)
-- Fuente: metrics.dealer_profile_valor + dealer_profile + dealer_profile_seccion
-- Agencias: Honda Motos Tijuana (6), Honda Motos Mexicali (8)
-- =============================================================================

SELECT
    v.marca_unidad_id AS mui,
    DATE(CONCAT(v.anio, '-', LPAD(v.mes, 2, '0'), '-01')) AS fecha,
    v.dealer_profile_id,
    dp.nombre,
    dps.nombre AS seccion,
    v.valor,
    v.sub_valor
FROM dealer_profile_valor v
JOIN dealer_profile dp ON dp.id = v.dealer_profile_id
JOIN dealer_profile_seccion dps ON dps.id = dp.seccion_id
WHERE v.marca_unidad_id IN (6, 8)
  AND dp.estatus = 1
  AND DATE(CONCAT(v.anio, '-', LPAD(v.mes, 2, '0'), '-01'))
      >= DATE_SUB(DATE(CONCAT(YEAR(CURDATE()), '-', LPAD(MONTH(CURDATE()), 2, '0'), '-01')), INTERVAL 1 MONTH)
ORDER BY v.anio, v.mes, v.marca_unidad_id, dp.seccion_id, dp.orden;
