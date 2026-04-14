-- BOILERPLATE: Esquema base Kimball para nuevo cliente
-- Ajustar dimensiones y hechos según el negocio del cliente
-- Ejecutar: psql -U postgres -d <db_name> -f 001_schema_base.sql

-- ============================================================================
-- DDL: Esquema base Data Warehouse — Modelo Kimball
-- ============================================================================
-- Orden de ejecución:
--   1. Schema
--   2. Dimensiones (sin dependencias)
--   3. Poblar dim_tiempo (generate_series)
--   4. Tablas de hechos (con FKs a dimensiones)
--   5. Índices
--   6. Vista materializada
-- ============================================================================

-- 1. Schema
CREATE SCHEMA IF NOT EXISTS dwh;

-- ============================================================================
-- DIMENSIONES
-- ============================================================================

-- dim_tiempo — Dimensión de fecha (2020-01-01 a 2030-12-31)
CREATE TABLE IF NOT EXISTS dwh.dim_tiempo (
    fecha       DATE PRIMARY KEY,
    anio        INTEGER NOT NULL,
    mes         INTEGER NOT NULL,
    dia         INTEGER NOT NULL,
    trimestre   INTEGER NOT NULL,
    semana_iso  INTEGER NOT NULL,
    dia_semana  INTEGER NOT NULL,  -- 0=lunes … 6=domingo (ISO)
    anio_mes    VARCHAR(7) NOT NULL,
    es_fin_mes  BOOLEAN NOT NULL
);

COMMENT ON TABLE dwh.dim_tiempo IS 'Dimensión de fecha para análisis temporal';

INSERT INTO dwh.dim_tiempo (fecha, anio, mes, dia, trimestre, semana_iso, dia_semana, anio_mes, es_fin_mes)
SELECT
    d::date                                          AS fecha,
    EXTRACT(YEAR   FROM d)::int                      AS anio,
    EXTRACT(MONTH  FROM d)::int                      AS mes,
    EXTRACT(DAY    FROM d)::int                      AS dia,
    EXTRACT(QUARTER FROM d)::int                     AS trimestre,
    EXTRACT(ISODOW FROM d)::int                      AS dia_semana,
    EXTRACT(WEEK   FROM d)::int                      AS semana_iso,
    TO_CHAR(d, 'YYYY-MM')                            AS anio_mes,
    d = (DATE_TRUNC('month', d) + INTERVAL '1 month - 1 day')::date AS es_fin_mes
FROM generate_series('2020-01-01'::date, '2030-12-31'::date, '1 day') AS d
ON CONFLICT (fecha) DO NOTHING;

-- dim_sucursales — Sucursales / puntos de venta
CREATE TABLE IF NOT EXISTS dwh.dim_sucursales (
    id_sucursal SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    ciudad      VARCHAR(100),
    marca       VARCHAR(50),
    activa      BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dwh.dim_sucursales IS 'Dimensión de sucursales o puntos de venta';

-- dim_vendedores — Asesores / ejecutivos de venta
CREATE TABLE IF NOT EXISTS dwh.dim_vendedores (
    id_vendedor INTEGER PRIMARY KEY,
    nombre      VARCHAR(200) NOT NULL,
    id_sucursal INTEGER REFERENCES dwh.dim_sucursales(id_sucursal),
    activo      BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dwh.dim_vendedores IS 'Dimensión de vendedores o asesores comerciales';

-- ============================================================================
-- TABLAS DE HECHOS
-- ============================================================================

-- fact_ventas — Transacciones de venta
CREATE TABLE IF NOT EXISTS dwh.fact_ventas (
    id              SERIAL PRIMARY KEY,
    id_oportunidad  VARCHAR(50) UNIQUE,
    fecha           DATE NOT NULL REFERENCES dwh.dim_tiempo(fecha),
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    id_vendedor     INTEGER REFERENCES dwh.dim_vendedores(id_vendedor),
    monto           NUMERIC(14,2) DEFAULT 0,
    es_nuevo        BOOLEAN DEFAULT TRUE,
    modelo          VARCHAR(150)
);

COMMENT ON TABLE dwh.fact_ventas IS 'Hechos de ventas — una fila por transacción';

-- fact_inventario — Snapshot periódico de inventario
CREATE TABLE IF NOT EXISTS dwh.fact_inventario (
    id              SERIAL PRIMARY KEY,
    fecha_snapshot  DATE NOT NULL DEFAULT CURRENT_DATE,
    id_sucursal     INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    modelo          VARCHAR(150),
    dias_inventario INTEGER DEFAULT 0,
    estatus         VARCHAR(50),
    cantidad        INTEGER DEFAULT 1
);

COMMENT ON TABLE dwh.fact_inventario IS 'Snapshot de inventario — DELETE+append por fecha_snapshot';

-- fact_plan — Objetivos / metas por periodo
CREATE TABLE IF NOT EXISTS dwh.fact_plan (
    id          SERIAL PRIMARY KEY,
    anio_mes    VARCHAR(7) NOT NULL,
    id_sucursal INTEGER NOT NULL REFERENCES dwh.dim_sucursales(id_sucursal),
    plan_ventas INTEGER NOT NULL DEFAULT 0,
    UNIQUE (anio_mes, id_sucursal)
);

COMMENT ON TABLE dwh.fact_plan IS 'Plan de ventas mensual por sucursal';

-- ============================================================================
-- ÍNDICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_fact_ventas_fecha       ON dwh.fact_ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_fact_ventas_sucursal    ON dwh.fact_ventas(id_sucursal);
CREATE INDEX IF NOT EXISTS idx_fact_ventas_vendedor    ON dwh.fact_ventas(id_vendedor);
CREATE INDEX IF NOT EXISTS idx_fact_inventario_snap    ON dwh.fact_inventario(fecha_snapshot);
CREATE INDEX IF NOT EXISTS idx_fact_inventario_suc     ON dwh.fact_inventario(id_sucursal);
CREATE INDEX IF NOT EXISTS idx_fact_plan_anio_mes      ON dwh.fact_plan(anio_mes);

-- ============================================================================
-- VISTA MATERIALIZADA: mv_kpis_mensual
-- KPIs de ventas por mes y sucursal con cumplimiento vs plan
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS dwh.mv_kpis_mensual;

CREATE MATERIALIZED VIEW dwh.mv_kpis_mensual AS
WITH
    ventas_agg AS (
        SELECT
            dt.anio_mes,
            fv.id_sucursal,
            COUNT(*)              AS total_ventas,
            SUM(fv.monto)        AS monto_total,
            COUNT(*) FILTER (WHERE fv.es_nuevo = TRUE)  AS ventas_nuevos,
            COUNT(*) FILTER (WHERE fv.es_nuevo = FALSE) AS ventas_seminuevos
        FROM dwh.fact_ventas fv
        INNER JOIN dwh.dim_tiempo dt ON fv.fecha = dt.fecha
        GROUP BY dt.anio_mes, fv.id_sucursal
    ),
    plan_agg AS (
        SELECT anio_mes, id_sucursal, SUM(plan_ventas) AS meta
        FROM dwh.fact_plan
        GROUP BY anio_mes, id_sucursal
    )
SELECT
    v.anio_mes,
    v.id_sucursal,
    s.nombre   AS sucursal,
    s.marca,
    v.total_ventas,
    v.ventas_nuevos,
    v.ventas_seminuevos,
    v.monto_total,
    COALESCE(p.meta, 0)  AS meta,
    -- Cumplimiento (%)
    CASE
        WHEN COALESCE(p.meta, 0) = 0 THEN NULL
        ELSE ROUND(v.total_ventas * 100.0 / p.meta, 1)
    END AS pct_cumplimiento,
    -- Variación año anterior (YoY) — JOIN explícito para evitar huecos
    CASE
        WHEN COALESCE(v_ant.total_ventas, 0) = 0 THEN NULL
        ELSE ROUND(
            (v.total_ventas - v_ant.total_ventas) * 100.0
            / v_ant.total_ventas, 1
        )
    END AS var_pct_yoy
FROM ventas_agg v
INNER JOIN dwh.dim_sucursales s ON v.id_sucursal = s.id_sucursal
LEFT JOIN plan_agg p
    ON v.anio_mes = p.anio_mes AND v.id_sucursal = p.id_sucursal
LEFT JOIN ventas_agg v_ant
    ON v_ant.id_sucursal = v.id_sucursal
    AND v_ant.anio_mes = TO_CHAR(
        TO_DATE(v.anio_mes, 'YYYY-MM') - INTERVAL '1 year', 'YYYY-MM'
    )
WITH NO DATA;

-- Índice único requerido para REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_kpis_mensual_pk
    ON dwh.mv_kpis_mensual(id_sucursal, anio_mes);

-- Primer refresh (necesario porque se creó WITH NO DATA)
REFRESH MATERIALIZED VIEW dwh.mv_kpis_mensual;

-- ============================================================================
-- Verificación
-- ============================================================================
SELECT 'dim_tiempo'     AS tabla, COUNT(*) AS filas FROM dwh.dim_tiempo
UNION ALL
SELECT 'mv_kpis_mensual', COUNT(*) FROM dwh.mv_kpis_mensual;
