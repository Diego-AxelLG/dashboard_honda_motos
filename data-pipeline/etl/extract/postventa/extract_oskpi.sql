-- =============================================================================
-- EXTRACT: KPIs diarios de Servicio (OS públicas)
-- Fuente: metrics.servicio_ventas
-- Agencias: Honda Motos Tijuana (6), Honda Motos Mexicali (8)
-- =============================================================================

select
    sv.marca_unidad_id as MUI,
    sv.fecha_factura as fecha,
    round(count(*), 0) as Cantidad,
    round(sum(sv.total_hrs_mo), 2) as Horas_MO,
    round(sum(sv.venta_mo - sv.descuento_mo), 2) as Venta_MO,
    round(sum(
        sv.venta_mo + sv.venta_tot + sv.venta_partes + sv.venta_materiales
      - sv.descuento_mo - sv.descuento_tot - sv.descuento_partes - sv.descuento_materiales
    ), 2) as VentaTotal_SinIVA
from servicio_ventas as sv
    right join (
        select max(id) as id, numero_ot
        from servicio_ventas
        where (
                fecha_factura >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') - INTERVAL 27 MONTH
                AND fecha_factura <= LAST_DAY(
                    DATE_FORMAT(CURRENT_DATE - INTERVAL 0 MONTH, '%Y-%m-01')
                )
            )
            and marca_unidad_id IN (6,8)
            AND LEFT(factura, 3) IN (
                "SAT", 'sam', 'vae', 'sae', 'CPS', 'smt', 'sme', 'smm'
            )
            AND tipo_orden IN ('Publico')
        GROUP BY numero_ot, tipo_orden
        ORDER BY fecha_factura DESC
    ) as sv2 on sv.id = sv2.id
where (
        sv.fecha_factura >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') - INTERVAL 24 MONTH
        AND fecha_factura <= LAST_DAY(
            DATE_FORMAT(CURRENT_DATE - INTERVAL 0 MONTH, '%Y-%m-01')
        )
    )
group by
    sv.marca_unidad_id,
    DATE_FORMAT(sv.fecha_factura, '%Y-%m-%d')