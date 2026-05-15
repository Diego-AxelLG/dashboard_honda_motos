-- ============================================================================
-- 009_cobranza.sql
-- Modulo Cobranza: CxC (Cuentas por Cobrar) + sistema de compromisos sobre
-- facturas vencidas y OTs fuera de SLA.
--
-- Nuevas tablas:
--   - fact_cxc_detalle      Snapshot diario de facturas vencidas (DELETE+INSERT).
--   - fact_compromiso_cxc   Log inmutable de compromisos sobre facturas CxC.
--   - fact_compromiso_os    Log inmutable de compromisos sobre OTs (servicios).
--
-- Estados de compromiso: activo -> vencido -> cumplido (transicion via ETL).
-- Indice unico parcial garantiza un solo compromiso 'activo' por (key, suc).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CxC detalle (snapshot diario)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dwh.fact_cxc_detalle (
    id              SERIAL PRIMARY KEY,
    fecha_snapshot  DATE NOT NULL DEFAULT CURRENT_DATE,
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    movimiento      VARCHAR(60) NOT NULL,
    cliente         VARCHAR(200),
    categoria       VARCHAR(80),
    fecha_emision   DATE,
    dias_vencido    INTEGER,
    saldo_vencido   NUMERIC(14,2),
    observaciones   TEXT
);

COMMENT ON TABLE dwh.fact_cxc_detalle IS
    'Snapshot diario de facturas vencidas (CxC) por sucursal. Patron DELETE+INSERT por fecha_snapshot.';

CREATE INDEX IF NOT EXISTS idx_fact_cxc_det_snap
    ON dwh.fact_cxc_detalle(fecha_snapshot, id_sucursal);
CREATE INDEX IF NOT EXISTS idx_fact_cxc_det_movimiento
    ON dwh.fact_cxc_detalle(movimiento);


-- ----------------------------------------------------------------------------
-- 2. Compromisos sobre facturas CxC
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dwh.fact_compromiso_cxc (
    id                SERIAL PRIMARY KEY,
    movimiento        VARCHAR(60) NOT NULL,
    id_sucursal       INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    comentario        TEXT NOT NULL,
    fecha_compromiso  DATE NOT NULL,
    fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estado            VARCHAR(10) NOT NULL DEFAULT 'activo'
                      CHECK (estado IN ('activo', 'vencido', 'cumplido')),
    registrado_por    VARCHAR(50)
);

COMMENT ON TABLE dwh.fact_compromiso_cxc IS
    'Compromisos de cobro sobre facturas CxC. registrado_por=dashboard (UI) o CRM (auto desde observaciones).';

CREATE INDEX IF NOT EXISTS idx_fact_compromiso_cxc_mov
    ON dwh.fact_compromiso_cxc(movimiento, id_sucursal);
CREATE INDEX IF NOT EXISTS idx_fact_compromiso_cxc_estado
    ON dwh.fact_compromiso_cxc(estado);

-- Solo un compromiso 'activo' por (movimiento, sucursal). Indice parcial unico.
CREATE UNIQUE INDEX IF NOT EXISTS uix_compromiso_cxc_activo
    ON dwh.fact_compromiso_cxc (movimiento, id_sucursal)
    WHERE estado = 'activo';


-- ----------------------------------------------------------------------------
-- 3. Compromisos sobre OTs (Ordenes de Servicio fuera de SLA)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dwh.fact_compromiso_os (
    id                SERIAL PRIMARY KEY,
    numero_ot         VARCHAR(50) NOT NULL,
    id_sucursal       INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    comentario        TEXT NOT NULL,
    fecha_compromiso  DATE NOT NULL,
    fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estado            VARCHAR(10) NOT NULL DEFAULT 'activo'
                      CHECK (estado IN ('activo', 'vencido', 'cumplido')),
    registrado_por    VARCHAR(50)
);

COMMENT ON TABLE dwh.fact_compromiso_os IS
    'Compromisos de cierre sobre OTs fuera de SLA. registrado_por=dashboard (UI) o CRM (auto desde situacion).';

CREATE INDEX IF NOT EXISTS idx_fact_compromiso_os_ot
    ON dwh.fact_compromiso_os(numero_ot, id_sucursal);
CREATE INDEX IF NOT EXISTS idx_fact_compromiso_os_estado
    ON dwh.fact_compromiso_os(estado);

CREATE UNIQUE INDEX IF NOT EXISTS uix_compromiso_os_activo
    ON dwh.fact_compromiso_os (numero_ot, id_sucursal)
    WHERE estado = 'activo';


-- ----------------------------------------------------------------------------
-- 4. Registrar el ETL para la "Ultima actualizacion"
-- ----------------------------------------------------------------------------
INSERT INTO dwh.etl_last_run (etl_name, last_run_at) VALUES ('cobranza', NULL)
ON CONFLICT (etl_name) DO NOTHING;
