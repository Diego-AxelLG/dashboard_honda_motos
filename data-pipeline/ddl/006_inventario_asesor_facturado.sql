-- ============================================================================
-- DDL: Inventario con asesor de apartado + estado de facturacion
-- ============================================================================
-- Extiende dwh.fact_inventario con:
--   - Datos del apartado (asesor, cliente, fecha) desde hmcrm.v_apartado_inv
--   - Estado de facturacion (fecha, tipo compra, status) desde hmcrm.vw_ventas_totales
-- Idempotente.
-- ============================================================================

ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS asesor_nombre      VARCHAR(150);
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS asesor_id          INTEGER;
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS cliente_nombre     VARCHAR(200);
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS fecha_apartado     DATE;
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS facturado          BOOLEAN DEFAULT FALSE;
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS fecha_facturacion  DATE;
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS tipo_compra        VARCHAR(20);
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS status_proceso     VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_fact_inventario_asesor ON dwh.fact_inventario(asesor_id);
CREATE INDEX IF NOT EXISTS idx_fact_inventario_fact   ON dwh.fact_inventario(facturado);
