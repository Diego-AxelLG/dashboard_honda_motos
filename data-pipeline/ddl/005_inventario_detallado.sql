-- ============================================================================
-- DDL: Inventario detallado (fact_inventario refactor)
-- ============================================================================
-- Amplia dwh.fact_inventario para capturar granularidad por VIN desde
-- hmcrm.vw_inventario_total. Idempotente: agrega columnas si no existen.
--
-- Antes: solo modelo + dias + estatus ("disponible" hardcoded)
-- Ahora: vin + modelo real + color + anio + estatus real (Disponible/Apartado/
--        Facturado) + dias_apartado.
-- ============================================================================

ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS vin            VARCHAR(25);
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS color          VARCHAR(60);
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS anio           INTEGER;
ALTER TABLE dwh.fact_inventario ADD COLUMN IF NOT EXISTS dias_apartado  INTEGER;

CREATE INDEX IF NOT EXISTS idx_fact_inventario_vin   ON dwh.fact_inventario(vin);
CREATE INDEX IF NOT EXISTS idx_fact_inventario_estat ON dwh.fact_inventario(estatus);

-- Refrescar MV de aging (no cambia schema, pero el refresh carga datos nuevos)
REFRESH MATERIALIZED VIEW dwh.mv_aging_inventario;
