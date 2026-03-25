-- BOILERPLATE: Query de extracción para fact_ventas
-- Placeholders: {{ fecha_inicio }}, {{ sucursales_permitidas }}
-- Ajustar tablas y columnas según el CRM del cliente

SELECT
    v.id                AS id_oportunidad,
    DATE(v.fecha_venta) AS fecha,
    v.id_sucursal       AS id_sucursal,
    v.id_vendedor       AS id_vendedor,
    v.monto_total       AS monto,
    v.es_nuevo          AS es_nuevo,
    v.modelo            AS modelo
FROM ventas v
WHERE v.fecha_venta >= '{{ fecha_inicio }}'
  AND v.id_sucursal IN ({{ sucursales_permitidas }})
ORDER BY v.fecha_venta;
