-- ============================================================================
-- DDL: Honda Motos — Ajustes al schema base
-- ============================================================================
-- Ejecutar DESPUES de 001_schema_base.sql
-- Cambios:
--   1. Seed dim_sucursales con Tijuana (6) y Mexicali (8)
--   2. Agregar venta_contado a fact_ventas
--   3. Ajustar fact_plan para soportar modelo (per-model plan)
--   4. Crear tabla etl_last_run para tracking de ejecuciones
-- ============================================================================

-- 1. Seed sucursales Honda Motos
INSERT INTO dwh.dim_sucursales (id_sucursal, nombre, ciudad, marca, activa) VALUES
    (6, 'Honda Motos Tijuana',  'Tijuana',  'Honda Motos', TRUE),
    (8, 'Honda Motos Mexicali', 'Mexicali', 'Honda Motos', TRUE)
ON CONFLICT (id_sucursal) DO NOTHING;

-- 2. Agregar venta_contado a fact_ventas
ALTER TABLE dwh.fact_ventas
    ADD COLUMN IF NOT EXISTS venta_contado BOOLEAN DEFAULT FALSE;

-- 3. Ajustar fact_plan: agregar modelo y recrear constraint unique
ALTER TABLE dwh.fact_plan
    ADD COLUMN IF NOT EXISTS modelo VARCHAR(150);

-- Eliminar constraint viejo (anio_mes, id_sucursal) y crear nuevo con modelo
ALTER TABLE dwh.fact_plan
    DROP CONSTRAINT IF EXISTS fact_plan_anio_mes_id_sucursal_key;

ALTER TABLE dwh.fact_plan
    ADD CONSTRAINT fact_plan_anio_mes_suc_modelo_key
    UNIQUE (anio_mes, id_sucursal, modelo);

-- 4. Tabla de tracking ETL
CREATE TABLE IF NOT EXISTS dwh.etl_last_run (
    etl_name    VARCHAR(100) PRIMARY KEY,
    last_run_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO dwh.etl_last_run (etl_name) VALUES
    ('ventas'),
    ('plan_ventas')
ON CONFLICT (etl_name) DO NOTHING;

-- 5. Indices adicionales
CREATE INDEX IF NOT EXISTS idx_fact_ventas_modelo ON dwh.fact_ventas(modelo);
CREATE INDEX IF NOT EXISTS idx_fact_plan_modelo   ON dwh.fact_plan(modelo);

-- ============================================================================
-- Verificacion
-- ============================================================================
SELECT 'dim_sucursales' AS tabla, COUNT(*) AS filas FROM dwh.dim_sucursales
UNION ALL
SELECT 'dim_tiempo', COUNT(*) FROM dwh.dim_tiempo
UNION ALL
SELECT 'etl_last_run', COUNT(*) FROM dwh.etl_last_run;
