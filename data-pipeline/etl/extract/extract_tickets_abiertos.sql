-- ============================================================================
-- TEMPLATE: Extracción de snapshot diario — tickets/órdenes abiertas
-- Adaptar a la estructura del CRM/ERP del cliente
-- Los placeholders {{ }} son inyectados por inject_params() en Python
-- ============================================================================
-- IMPORTANTE: Esta query extrae TODO lo que está abierto en este momento.
-- No filtra por fecha — el concepto de snapshot es: "foto del estado actual".
-- La columna fecha_snapshot = CURDATE() marca cuándo se tomó la foto.
-- ============================================================================

SELECT
    -- Fecha del snapshot: siempre "hoy" en el sistema origen.
    -- El ETL usa este valor para el DELETE antes del INSERT.
    CURDATE()                       AS fecha_snapshot,

    -- Clave de negocio del ticket/orden.
    -- NO es PK en el DWH (la PK es el SERIAL auto-incremental).
    -- Un mismo ticket aparece en múltiples snapshots (uno por día que estuvo abierto).
    t.numero_ticket                 AS id_ticket,

    -- Mapeo de sucursal: mismo patrón CASE WHEN del proyecto.
    CASE
        WHEN t.id_branch = 10 THEN 1
        WHEN t.id_branch = 20 THEN 2
        WHEN t.id_branch = 30 THEN 3
        ELSE t.id_branch
    END                             AS id_sucursal,

    -- Campos descriptivos
    t.categoria                     AS categoria,
    t.prioridad                     AS prioridad,
    DATE(t.fecha_creacion)          AS fecha_apertura,

    -- Días abierto: calculado en el origen para reflejar la fecha del sistema.
    DATEDIFF(CURDATE(), t.fecha_creacion) AS dias_abierto,

    -- Monto asociado (factura, presupuesto, etc.)
    COALESCE(t.monto, 0)           AS monto,

    -- Responsable actual
    TRIM(CONCAT(
        COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, '')
    ))                              AS responsable,

    -- Último comentario o nota (útil para compromisos / justificaciones)
    t.ultimo_comentario             AS comentario

FROM sistema_crm.tickets t

-- JOIN al responsable asignado
LEFT JOIN sistema_crm.usuarios u
    ON u.id = t.id_responsable

WHERE
    -- Solo tickets abiertos (excluir cerrados, cancelados).
    -- Este filtro es lo que hace que sea un "snapshot del estado actual":
    -- si un ticket se cierra, desaparece del próximo snapshot.
    t.status = 'abierto'

    -- Filtro de sucursales configuradas en .env
    AND t.id_branch IN ({{ sucursales_permitidas }})

ORDER BY t.fecha_creacion;
