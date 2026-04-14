-- ============================================================================
-- DDL: Refactorización Financiero + Postventa
-- ============================================================================
-- Ejecutar DESPUES de 003_honda_motos_all_facts.sql
--
-- Crea 5 tablas nuevas basadas en el pipeline probado de Honda Autos:
--   - fact_estado_resultados        (P&L reales de sicofi.balanza)
--   - fact_ppto_estado_resultados   (P&L presupuesto de sicofi.balanza_ppto)
--   - fact_postventa_kpis           (OTs + Horas MO de metrics.servicio_ventas)
--   - fact_contable_servicio        (Venta Total + MO contable de sicofi)
--   - fact_ticket_promedio           (ticket promedio manual CSV)
--
-- Mapeo sicofi → MUI:
--   balanza:      cb.marca='HONDA MOTOS', b.marca='HONDA', term 4→MUI 6, term 6→MUI 8
--   balanza_ppto: marca='HONDA MOTOS', term 1→MUI 6, term 2→MUI 8
-- ============================================================================

-- ============================================================================
-- NUEVAS TABLAS
-- ============================================================================

-- fact_estado_resultados — P&L Reales (sicofi.balanza via catalogo_balanza)
CREATE TABLE IF NOT EXISTS dwh.fact_estado_resultados (
    id       SERIAL PRIMARY KEY,
    fecha    DATE          NOT NULL,
    mui      INTEGER       NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    seccion  VARCHAR(50)   NOT NULL,
    rama     VARCHAR(50)   NOT NULL,
    tipo     VARCHAR(80)   NOT NULL,
    monto    NUMERIC(14,2) DEFAULT 0,
    CONSTRAINT uq_edoresultados UNIQUE (fecha, mui, seccion, rama, tipo)
);
CREATE INDEX IF NOT EXISTS idx_fact_edr_real_fecha ON dwh.fact_estado_resultados(fecha);
CREATE INDEX IF NOT EXISTS idx_fact_edr_real_mui   ON dwh.fact_estado_resultados(mui);

-- fact_ppto_estado_resultados — P&L Presupuesto (sicofi.balanza_ppto)
CREATE TABLE IF NOT EXISTS dwh.fact_ppto_estado_resultados (
    id       SERIAL PRIMARY KEY,
    fecha    DATE          NOT NULL,
    mui      INTEGER       NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    seccion  VARCHAR(50)   NOT NULL,
    rama     VARCHAR(50)   NOT NULL,
    tipo     VARCHAR(80)   NOT NULL,
    monto    NUMERIC(14,2) DEFAULT 0,
    CONSTRAINT uq_ppto_edoresultados UNIQUE (fecha, mui, seccion, rama, tipo)
);
CREATE INDEX IF NOT EXISTS idx_fact_ppto_edr_fecha ON dwh.fact_ppto_estado_resultados(fecha);
CREATE INDEX IF NOT EXISTS idx_fact_ppto_edr_mui   ON dwh.fact_ppto_estado_resultados(mui);

-- fact_postventa_kpis — OTs + Horas MO (metrics.servicio_ventas)
CREATE TABLE IF NOT EXISTS dwh.fact_postventa_kpis (
    id                  SERIAL PRIMARY KEY,
    mui                 INTEGER       NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    fecha               DATE          NOT NULL,
    cantidad            INTEGER       DEFAULT 0,
    horas_mo            NUMERIC(12,2) DEFAULT 0,
    venta_mo            NUMERIC(14,2) DEFAULT 0,
    venta_total_sin_iva NUMERIC(14,2) DEFAULT 0,
    CONSTRAINT uq_postventa_kpis_fecha_mui UNIQUE (fecha, mui)
);
CREATE INDEX IF NOT EXISTS idx_fact_pvkpis_fecha ON dwh.fact_postventa_kpis(fecha);

-- fact_contable_servicio — Venta Total + Venta MO contable (sicofi)
CREATE TABLE IF NOT EXISTS dwh.fact_contable_servicio (
    id                   SERIAL PRIMARY KEY,
    fecha                DATE          NOT NULL,
    mui                  INTEGER       NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    tipo                 VARCHAR(10)   NOT NULL,
    monto                NUMERIC(14,2) DEFAULT 0,
    CONSTRAINT uq_contable_servicio_fecha_mui_tipo UNIQUE (fecha, mui, tipo)
);
CREATE INDEX IF NOT EXISTS idx_fact_contserv_fecha ON dwh.fact_contable_servicio(fecha);

-- fact_ticket_promedio — Ticket promedio (CSV manual)
CREATE TABLE IF NOT EXISTS dwh.fact_ticket_promedio (
    mui             INTEGER       NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    fecha           DATE          NOT NULL,
    ticket_promedio NUMERIC(12,2) NOT NULL,
    CONSTRAINT uq_ticket_promedio_fecha_mui UNIQUE (fecha, mui)
);

-- ============================================================================
-- ETL TRACKING
-- ============================================================================
DELETE FROM dwh.etl_last_run
WHERE etl_name IN ('dealer_profile', 'servicio_kpi', 'ppto_servicio', 'ppto_edr');

INSERT INTO dwh.etl_last_run (etl_name) VALUES
    ('postventa_financiero'),
    ('estado_resultados'),
    ('contable_servicio')
ON CONFLICT (etl_name) DO NOTHING;

-- ============================================================================
-- Verificación
-- ============================================================================
SELECT tablename
FROM pg_tables
WHERE schemaname = 'dwh'
ORDER BY tablename;
