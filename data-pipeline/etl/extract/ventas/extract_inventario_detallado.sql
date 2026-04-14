-- Inventario detallado Honda Motos (snapshot)
-- Fuentes:
--   hmcrm.vw_inventario_total      (base: VIN + modelo + dias + estatus)
--   hmcrm.v_apartado_inv           (datos del apartado: asesor + cliente)
--   hmcrm.vw_ventas_totales        (estado de facturacion)
-- ciudad='Motos' -> mui 6 (Tijuana), ciudad='Mexicali' -> mui 8
-- Solo Nuevos. CONVERT USING utf8 por colacion mixta en las vistas.
SELECT
    CASE CONVERT(i.ciudad USING utf8)
        WHEN 'Motos'    THEN 6
        WHEN 'Mexicali' THEN 8
    END AS id_sucursal,
    TRIM(UPPER(CONVERT(i.vin USING utf8)))   AS vin,
    TRIM(UPPER(CONVERT(i.auto USING utf8)))  AS modelo,
    TRIM(UPPER(CONVERT(i.color USING utf8))) AS color,
    NULLIF(TRIM(CONVERT(i.anio USING utf8)), '') AS anio,
    CAST(NULLIF(CONVERT(i.dias_inv USING utf8), '') AS UNSIGNED) AS dias_inventario,
    NULLIF(CONVERT(i.dias_apartado USING utf8), '')              AS dias_apartado,
    TRIM(CONVERT(i.estatus USING utf8))      AS estatus,
    -- Apartado (solo si Apartado en inventario)
    TRIM(CONCAT_WS(' ', a.hus_nombre, a.hus_apellido))    AS asesor_nombre,
    a.huser_hus_IDhuser                                   AS asesor_id,
    TRIM(CONCAT_WS(' ', a.con_nombre, a.con_apellido))    AS cliente_nombre,
    a.aau_fecha                                           AS fecha_apartado,
    -- Facturacion (si hay registro en vw_ventas_totales)
    CASE WHEN v.dat_fecha_facturacion IS NOT NULL THEN 1 ELSE 0 END AS facturado,
    v.dat_fecha_facturacion                   AS fecha_facturacion,
    CONVERT(v.dats_compra  USING utf8)        AS tipo_compra,
    CONVERT(v.prcv_status  USING utf8)        AS status_proceso
FROM hmcrm.vw_inventario_total i
LEFT JOIN hmcrm.v_apartado_inv a
       ON CONVERT(a.aau_IdFk USING utf8) = CONVERT(i.vin USING utf8)
      AND CONVERT(a.aau_status USING utf8) = 'Apartado'
LEFT JOIN hmcrm.vw_ventas_totales v
       ON CONVERT(v.data_vin USING utf8) = CONVERT(i.vin USING utf8)
WHERE CONVERT(i.tipo USING utf8) = 'Nuevos'
  AND CONVERT(i.ciudad USING utf8) IN ('Motos', 'Mexicali')
  AND LENGTH(i.vin) > 0
