-- ============================================================================
-- DDL 007 — Módulo "5 Alas" Honda Motos
-- Programa de evaluación trimestral Honda de México (por grupo, no por sucursal)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dwh.cinco_alas_catalogo (
    kpi_codigo       VARCHAR(10) PRIMARY KEY,
    area             VARCHAR(20) NOT NULL,
    nombre           VARCHAR(100) NOT NULL,
    detalle          TEXT,
    puntos_maximo    NUMERIC(6,1) NOT NULL DEFAULT 0,
    penalizacion_max NUMERIC(6,1) NOT NULL DEFAULT 0,
    es_automatico    BOOLEAN DEFAULT FALSE,
    orden            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dwh.cinco_alas_evaluacion (
    id              SERIAL PRIMARY KEY,
    anio            INTEGER NOT NULL,
    trimestre       INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
    fecha_captura   TIMESTAMPTZ DEFAULT NOW(),
    capturado_por   VARCHAR(100),
    notas           TEXT,
    UNIQUE (anio, trimestre)
);

CREATE TABLE IF NOT EXISTS dwh.cinco_alas_detalle (
    id               SERIAL PRIMARY KEY,
    evaluacion_id    INTEGER NOT NULL REFERENCES dwh.cinco_alas_evaluacion(id) ON DELETE CASCADE,
    area             VARCHAR(20) NOT NULL,
    kpi_codigo       VARCHAR(10) NOT NULL,
    puntos_obtenidos NUMERIC(6,1) NOT NULL DEFAULT 0,
    puntos_maximo    NUMERIC(6,1) NOT NULL,
    penalizacion     NUMERIC(6,1) NOT NULL DEFAULT 0,
    es_automatico    BOOLEAN DEFAULT FALSE,
    notas            TEXT,
    evidencia_url    TEXT,
    UNIQUE (evaluacion_id, kpi_codigo)
);

CREATE INDEX IF NOT EXISTS idx_cinco_alas_detalle_eval ON dwh.cinco_alas_detalle(evaluacion_id);

-- Seed del catálogo (versión 2026)
INSERT INTO dwh.cinco_alas_catalogo (kpi_codigo, area, nombre, detalle, puntos_maximo, penalizacion_max, es_automatico, orden) VALUES
    ('V1', 'ventas',      'Cumplimiento Ventas RS',         'Ventas a cliente final vs objetivo Honda del trimestre', 120, 0, TRUE, 1),
    ('V2', 'ventas',      'Eventos Promoción Honda',        'Café con Honda, Safety Day, Cuatrimanía, Riders Club', 15, 0, FALSE, 2),
    ('V3', 'ventas',      'Eventos Promoción Distribuidor', 'Activaciones, DEMOS, Publicidad, Eventos propios', 9, 0, FALSE, 3),
    ('V4', 'ventas',      'Reporte Prospección',            'Prospección de ventas en Sistema Honda', 10, 0, FALSE, 4),
    ('V5', 'ventas',      'Niguri N-4',                     'Planeación mensual, stock 1.3–1.9 meses al día 15', 10, 0, TRUE, 5),
    ('V6', 'ventas',      'Cobranza',                       'Cumplimiento de pagos en tiempo', 0, -30, FALSE, 6),
    ('S1', 'servicio',    'Entrenamiento Técnico',          'Plan de capacitación para técnicos', 40, 0, FALSE, 7),
    ('S2', 'servicio',    'Retención 0-2 años',             'Retención de servicio 0-2 años garantía', 45, 0, FALSE, 8),
    ('S3', 'servicio',    'Retención 3-9 años',             'Retención de servicio 3-9 años garantía', 15, 0, FALSE, 9),
    ('S4', 'servicio',    'Capacidad de Servicio',          'Cumplimiento de capacidad', 30, 0, FALSE, 10),
    ('S5', 'servicio',    'Encuestas D-CSI',                '% respuesta encuestas clientes', 10, 0, FALSE, 11),
    ('R1', 'refacciones', 'Compra Refacciones',             'Cumplimiento compra refacciones', 40, 0, FALSE, 12),
    ('R2', 'refacciones', 'Compra Aceite Motor',            'Compra de aceite', 10, 0, FALSE, 13),
    ('R3', 'refacciones', 'Compra Químicos',                'Compra de químicos', 10, 0, FALSE, 14),
    ('R4', 'refacciones', 'Pagos en Tiempo',                'Cumplimiento pagos refacciones', 0, -30, FALSE, 15),
    ('I1', 'imagen',      'Fachada Exterior',               'Letrero Honda / Pintura exterior', 0, -30, FALSE, 16),
    ('I2', 'imagen',      'Fachada Servicio',               'Letrero Servicio / Pintura servicio', 0, -20, FALSE, 17),
    ('I3', 'imagen',      'Exhibición Ventas',              'Sala interior: Motos, Refacciones, Accesorios', 0, -40, FALSE, 18),
    ('I4', 'imagen',      'Pintura Interior',               'Ventas, Servicio, Refacciones y Admón.', 0, -20, FALSE, 19),
    ('I5', 'imagen',      'Imagen Refacciones',             'Área de refacciones', 0, -10, FALSE, 20),
    ('I6', 'imagen',      'Uniformes Personal',             'Todas las áreas', 0, -10, FALSE, 21),
    ('I7', 'imagen',      'Papelería Distribuidor',         'Todas las áreas', 0, -10, FALSE, 22),
    ('I8', 'imagen',      'Señalética Interior',            'Letrero interior, todas las áreas', 0, -10, FALSE, 23)
ON CONFLICT (kpi_codigo) DO UPDATE SET
    area             = EXCLUDED.area,
    nombre           = EXCLUDED.nombre,
    detalle          = EXCLUDED.detalle,
    puntos_maximo    = EXCLUDED.puntos_maximo,
    penalizacion_max = EXCLUDED.penalizacion_max,
    es_automatico    = EXCLUDED.es_automatico,
    orden            = EXCLUDED.orden;
