-- =============================================================================
-- EXTRACT: Detalle de facturas vencidas (CxC) - Honda Motos
-- Fuente: sicofi.cxc_intelisis + sicofi.cxc (mismo MySQL server)
-- Sucursales: Tijuana (cin_sucursal=1 -> id_sucursal=6),
--             Mexicali (cin_sucursal=2 -> id_sucursal=8).
-- Filtra marca = 'HONDA MOTOS' y excluye Ensenada (cin_sucursal=3, cerrada).
--
-- Umbrales:
--   - Siniestros / Garantias: dias_vencido > 60
--   - Resto:                  dias_vencido > 30
-- =============================================================================

SELECT
    id_sucursal,
    CURRENT_DATE() AS fecha_snapshot,
    movimiento,
    cliente,
    categoria,
    fecha_emision,
    dias_vencido,
    saldo_vencido,
    observaciones
FROM (
    SELECT
        CASE
            WHEN intelisis.cin_sucursal = 1 THEN 6   -- Honda Motos Tijuana
            WHEN intelisis.cin_sucursal = 2 THEN 8   -- Honda Motos Mexicali
            ELSE NULL
        END AS id_sucursal,
        intelisis.cin_movimiento     AS movimiento,
        intelisis.cin_nombre         AS cliente,
        cxc.cxc_descripcion          AS categoria,
        intelisis.cin_fecha_emision  AS fecha_emision,
        DATEDIFF(CURRENT_DATE(), intelisis.cin_fecha_emision) AS dias_vencido,
        intelisis.cin_saldo          AS saldo_vencido,
        intelisis.cin_referencia     AS observaciones
    FROM sicofi.cxc_intelisis AS intelisis
    INNER JOIN sicofi.cxc AS cxc ON cxc.cxc_id = intelisis.cin_cxc_id
    WHERE intelisis.cin_anio = YEAR(CURRENT_DATE())
      AND intelisis.cin_mes  = MONTH(CURRENT_DATE())
      AND intelisis.cin_semana = (
          SELECT MAX(cin_semana)
          FROM sicofi.cxc_intelisis
          WHERE cin_anio = YEAR(CURRENT_DATE())
            AND cin_mes  = MONTH(CURRENT_DATE())
      )
      AND cxc.cxc_marca = 'HONDA MOTOS'
      AND intelisis.cin_sucursal IN (1, 2)
      AND CASE
              WHEN cxc.cxc_descripcion IN ('Siniestros', 'Garantias')
                  THEN DATEDIFF(CURRENT_DATE(), intelisis.cin_fecha_emision) > 60
              ELSE      DATEDIFF(CURRENT_DATE(), intelisis.cin_fecha_emision) > 30
          END
) temp
WHERE id_sucursal IS NOT NULL
ORDER BY cliente ASC;
