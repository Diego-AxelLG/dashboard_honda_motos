-- ============================================================================
-- DDL: Honda Motos — Todas las tablas de hechos (Fases 1.2 - 2.6)
-- Ejecutar DESPUES de 002_honda_motos.sql
-- ============================================================================

-- ============================================================================
-- VENTAS (Fase 1)
-- ============================================================================

-- fact_flujos_piso — Flujos diarios por fuente
CREATE TABLE IF NOT EXISTS dwh.fact_flujos_piso (
    id            SERIAL PRIMARY KEY,
    fecha         DATE NOT NULL,
    id_sucursal   INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    freshup       INTEGER DEFAULT 0,
    internet      INTEGER DEFAULT 0,
    UNIQUE (fecha, id_sucursal)
);
CREATE INDEX IF NOT EXISTS idx_fact_flujos_fecha ON dwh.fact_flujos_piso(fecha);

-- ============================================================================
-- POSTVENTA (Fase 2)
-- ============================================================================

-- fact_servicio_kpi — KPIs diarios de servicio
CREATE TABLE IF NOT EXISTS dwh.fact_servicio_kpi (
    id                    SERIAL PRIMARY KEY,
    fecha                 DATE NOT NULL,
    id_sucursal           INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    cantidad_os           INTEGER DEFAULT 0,
    horas_mo              NUMERIC(10,2) DEFAULT 0,
    venta_mo              NUMERIC(14,2) DEFAULT 0,
    venta_total_sin_iva   NUMERIC(14,2) DEFAULT 0,
    UNIQUE (fecha, id_sucursal)
);
CREATE INDEX IF NOT EXISTS idx_fact_servkpi_fecha ON dwh.fact_servicio_kpi(fecha);

-- fact_os_abierta — Snapshot agregado de OS fuera de SLA
CREATE TABLE IF NOT EXISTS dwh.fact_os_abierta (
    id              SERIAL PRIMARY KEY,
    fecha_snapshot  DATE NOT NULL DEFAULT CURRENT_DATE,
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    tipo_orden      VARCHAR(100),
    cantidad_os     INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fact_os_ab_snap ON dwh.fact_os_abierta(fecha_snapshot);

-- fact_os_abierta_detalle — Detalle individual de OS fuera de SLA
CREATE TABLE IF NOT EXISTS dwh.fact_os_abierta_detalle (
    id              SERIAL PRIMARY KEY,
    fecha_snapshot  DATE NOT NULL DEFAULT CURRENT_DATE,
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    numero_ot       VARCHAR(50),
    vin             VARCHAR(20),
    tipo_orden      VARCHAR(100),
    nombre_asesor   VARCHAR(200),
    nombre_cliente  VARCHAR(200),
    fecha_apertura  DATE,
    dias_abierta    INTEGER DEFAULT 0,
    monto_venta     NUMERIC(14,2) DEFAULT 0,
    situacion       VARCHAR(100),
    taller          VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_fact_os_det_snap ON dwh.fact_os_abierta_detalle(fecha_snapshot);

-- fact_inv_refacciones — Snapshot inventario refacciones
CREATE TABLE IF NOT EXISTS dwh.fact_inv_refacciones (
    id              SERIAL PRIMARY KEY,
    fecha_snapshot  DATE NOT NULL DEFAULT CURRENT_DATE,
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    movimiento      NUMERIC(14,2) DEFAULT 0,
    nuevo           NUMERIC(14,2) DEFAULT 0,
    tec_obsoleto    NUMERIC(14,2) DEFAULT 0,
    obsoleto        NUMERIC(14,2) DEFAULT 0,
    UNIQUE (fecha_snapshot, id_sucursal)
);

-- fact_uio — Units In Operation (snapshot)
CREATE TABLE IF NOT EXISTS dwh.fact_uio (
    id              SERIAL PRIMARY KEY,
    fecha_snapshot  DATE NOT NULL DEFAULT CURRENT_DATE,
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    uio             INTEGER DEFAULT 0,
    uio_mp          INTEGER DEFAULT 0,
    uio_ap          INTEGER DEFAULT 0,
    UNIQUE (fecha_snapshot, id_sucursal)
);

-- fact_dealer_profile — KPIs mensuales dealer profile (41 curados)
CREATE TABLE IF NOT EXISTS dwh.fact_dealer_profile (
    id                  SERIAL PRIMARY KEY,
    fecha               DATE NOT NULL,
    id_sucursal         INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    dealer_profile_id   INTEGER NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    seccion             VARCHAR(100) NOT NULL,
    valor               NUMERIC(14,2),
    sub_valor           NUMERIC(14,2),
    prioridad           SMALLINT NOT NULL DEFAULT 1,
    UNIQUE (fecha, id_sucursal, dealer_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_fact_dp_fecha ON dwh.fact_dealer_profile(fecha);
CREATE INDEX IF NOT EXISTS idx_fact_dp_prio  ON dwh.fact_dealer_profile(prioridad);

-- fact_ppto_servicio — Presupuesto servicio + MO
CREATE TABLE IF NOT EXISTS dwh.fact_ppto_servicio (
    id              SERIAL PRIMARY KEY,
    fecha           DATE NOT NULL,
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    tipo_ppto       VARCHAR(50) NOT NULL,
    plan_ppto       NUMERIC(14,2) DEFAULT 0,
    UNIQUE (fecha, id_sucursal, tipo_ppto)
);

-- fact_ppto_edr — Estado de Resultados presupuestado completo
CREATE TABLE IF NOT EXISTS dwh.fact_ppto_edr (
    id              SERIAL PRIMARY KEY,
    fecha           DATE NOT NULL,
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    seccion         VARCHAR(50) NOT NULL,
    rama            VARCHAR(100) NOT NULL,
    tipo            VARCHAR(100) NOT NULL,
    monto           NUMERIC(14,2) DEFAULT 0,
    UNIQUE (fecha, id_sucursal, seccion, rama, tipo)
);
CREATE INDEX IF NOT EXISTS idx_fact_edr_fecha ON dwh.fact_ppto_edr(fecha);

-- ============================================================================
-- ETL TRACKING
-- ============================================================================
INSERT INTO dwh.etl_last_run (etl_name) VALUES
    ('flujos_piso'), ('inventario'), ('servicio_kpi'), ('os_abierta'),
    ('inv_refacciones'), ('uio'), ('dealer_profile'),
    ('ppto_servicio'), ('ppto_edr')
ON CONFLICT (etl_name) DO NOTHING;

-- ============================================================================
-- VISTAS MATERIALIZADAS
-- ============================================================================

-- mv_cumplimiento_ventas — Ventas vs plan con % y tendencia
DROP MATERIALIZED VIEW IF EXISTS dwh.mv_cumplimiento_ventas;
CREATE MATERIALIZED VIEW dwh.mv_cumplimiento_ventas AS
WITH ventas AS (
    SELECT dt.anio_mes, fv.id_sucursal, fv.modelo,
           COUNT(*) AS unidades
    FROM dwh.fact_ventas fv
    JOIN dwh.dim_tiempo dt ON fv.fecha = dt.fecha
    GROUP BY dt.anio_mes, fv.id_sucursal, fv.modelo
),
plan AS (
    SELECT anio_mes, id_sucursal, modelo, plan_ventas
    FROM dwh.fact_plan
)
SELECT
    COALESCE(v.anio_mes, p.anio_mes) AS anio_mes,
    COALESCE(v.id_sucursal, p.id_sucursal) AS id_sucursal,
    COALESCE(v.modelo, p.modelo) AS modelo,
    COALESCE(v.unidades, 0) AS unidades,
    COALESCE(p.plan_ventas, 0) AS plan_ventas,
    CASE WHEN COALESCE(p.plan_ventas, 0) = 0 THEN NULL
         ELSE ROUND(COALESCE(v.unidades, 0) * 100.0 / p.plan_ventas, 1)
    END AS pct_cumplimiento
FROM ventas v
FULL OUTER JOIN plan p
    ON v.anio_mes = p.anio_mes AND v.id_sucursal = p.id_sucursal AND v.modelo = p.modelo
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cumpl_pk
    ON dwh.mv_cumplimiento_ventas(id_sucursal, anio_mes, modelo);
REFRESH MATERIALIZED VIEW dwh.mv_cumplimiento_ventas;

-- mv_aging_inventario — Distribucion de aging por sucursal
DROP MATERIALIZED VIEW IF EXISTS dwh.mv_aging_inventario;
CREATE MATERIALIZED VIEW dwh.mv_aging_inventario AS
SELECT
    fi.id_sucursal,
    s.nombre AS sucursal,
    fi.fecha_snapshot,
    SUM(CASE WHEN fi.dias_inventario BETWEEN 0 AND 30 THEN fi.cantidad ELSE 0 END) AS rango_0_30,
    SUM(CASE WHEN fi.dias_inventario BETWEEN 31 AND 60 THEN fi.cantidad ELSE 0 END) AS rango_31_60,
    SUM(CASE WHEN fi.dias_inventario BETWEEN 61 AND 90 THEN fi.cantidad ELSE 0 END) AS rango_61_90,
    SUM(CASE WHEN fi.dias_inventario > 90 THEN fi.cantidad ELSE 0 END) AS rango_90_plus,
    SUM(fi.cantidad) AS total_unidades,
    ROUND(AVG(fi.dias_inventario), 1) AS edad_promedio
FROM dwh.fact_inventario fi
JOIN dwh.dim_sucursales s ON fi.id_sucursal = s.id_sucursal
GROUP BY fi.id_sucursal, s.nombre, fi.fecha_snapshot
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_aging_pk
    ON dwh.mv_aging_inventario(id_sucursal, fecha_snapshot);
