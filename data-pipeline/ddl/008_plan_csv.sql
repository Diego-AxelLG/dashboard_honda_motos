-- ============================================================================
-- 008_plan_csv.sql
-- Tabla para el plan de postventa (cargado desde CSV manual).
-- El plan de motos se sigue almacenando en fact_plan, pero ahora se carga
-- desde CSV (Plan_5_alas.csv) en lugar de hmcrm.
-- ============================================================================

CREATE TABLE IF NOT EXISTS dwh.fact_plan_postventa (
    id           SERIAL PRIMARY KEY,
    anio_mes     DATE         NOT NULL,
    id_sucursal  INTEGER      NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    tipo         VARCHAR(40)  NOT NULL,
    monto        NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT uq_plan_postventa UNIQUE (anio_mes, id_sucursal, tipo)
);

COMMENT ON TABLE dwh.fact_plan_postventa IS
    'Meta mensual de postventa por sucursal y tipo (refacciones_mostrador / mano_obra / refacciones_taller). Cargado desde CSV.';

CREATE INDEX IF NOT EXISTS idx_plan_postventa_anio_mes ON dwh.fact_plan_postventa(anio_mes);
CREATE INDEX IF NOT EXISTS idx_plan_postventa_sucursal ON dwh.fact_plan_postventa(id_sucursal);

-- Registrar el ETL para que aparezca en el badge "Última actualización"
INSERT INTO dwh.etl_last_run (etl_name, last_run_at) VALUES ('plan_csv', NULL)
ON CONFLICT (etl_name) DO NOTHING;
