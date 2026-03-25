"""
Ejemplo de servicio que usa pd.read_sql() + DataFrame merges.

Demuestra el patron estandar del proyecto para endpoints que requieren
cruzar multiples consultas y calcular KPIs derivados con pandas.

Contexto generico: productos en inventario de un almacen.
"""

import numpy as np
import pandas as pd
from sqlalchemy import Connection


# ---------------------------------------------------------------------------
# Queries — cada una retorna un aspecto distinto del dominio
# ---------------------------------------------------------------------------

def _stock_sql(sucursal_id: int | None) -> str:
    """Stock actual por producto."""
    filtro = "AND s.sucursal_id = %(sucursal_id)s" if sucursal_id else ""
    return f"""
    SELECT
        s.producto       AS producto,
        COUNT(*)         AS stock,
        AVG(s.dias_en_almacen) AS dias_promedio
    FROM dwh.fact_inventario s
    WHERE s.activo = TRUE
      {filtro}
    GROUP BY s.producto
    """


def _velocidad_sql(sucursal_id: int | None) -> str:
    """Ventas de los ultimos 90 dias por producto (velocidad de salida)."""
    filtro = "AND v.sucursal_id = %(sucursal_id)s" if sucursal_id else ""
    return f"""
    SELECT
        v.producto       AS producto,
        COUNT(*)         AS ventas_90d
    FROM dwh.fact_ventas v
    WHERE v.fecha >= CURRENT_DATE - INTERVAL '90 days'
      {filtro}
    GROUP BY v.producto
    """


# ---------------------------------------------------------------------------
# Logica de negocio
# ---------------------------------------------------------------------------

def _classify_status(meses: float | None) -> str:
    """Clasifica cobertura de inventario en categorias de riesgo."""
    if meses is None:
        return "Sin Ventas"
    if meses < 1.0:
        return "Desabasto"
    if meses > 3.0:
        return "Sobrestock"
    return "Saludable"


# ---------------------------------------------------------------------------
# Servicio principal
# ---------------------------------------------------------------------------

def build_rotation_matrix(
    conn: Connection,
    sucursal_id: int | None = None,
) -> list[dict]:
    """
    Cruza stock actual con velocidad de ventas para calcular meses de
    cobertura y clasificar riesgo por producto.

    Patron:
      1. pd.read_sql() x2 — una query por aspecto
      2. merge outer — no perder productos sin ventas o sin stock
      3. Calculo de KPIs derivados con operaciones vectorizadas
      4. Retorno como lista de dicts via .to_dict(orient="records")
    """
    params: dict = {}
    if sucursal_id is not None:
        params["sucursal_id"] = sucursal_id

    # ── 1. Leer DataFrames ────────────────────────────────────────────────
    df_stock = pd.read_sql(_stock_sql(sucursal_id), conn, params=params)
    df_ventas = pd.read_sql(_velocidad_sql(sucursal_id), conn, params=params)

    # ── 2. Merge por producto (outer: conservar ambos lados) ──────────────
    df = df_stock.merge(df_ventas, on="producto", how="outer")

    # ── 3. Rellenar nulos ─────────────────────────────────────────────────
    df["stock"] = df["stock"].fillna(0).astype(int)
    df["ventas_90d"] = df["ventas_90d"].fillna(0).astype(int)
    df["dias_promedio"] = df["dias_promedio"].fillna(0).round(1)

    # ── 4. KPIs derivados ─────────────────────────────────────────────────
    # Promedio mensual de ventas (90 dias / 3 meses)
    df["promedio_venta_mensual"] = (df["ventas_90d"] / 3).round(2)

    # Meses de inventario (proteccion division por cero)
    df["meses_inventario"] = np.where(
        df["promedio_venta_mensual"] > 0,
        (df["stock"] / df["promedio_venta_mensual"]).round(2),
        np.nan,
    )

    # Porcentaje de riesgo: % del stock con +45 dias en almacen
    # (se calcula a nivel agregado, aqui solo el clasificador por fila)
    df["status"] = df["meses_inventario"].apply(_classify_status)

    # ── 5. Limpiar para JSON ──────────────────────────────────────────────
    df = df.replace({np.nan: None})

    # Filtrar filas sin dato util
    df = df[~((df["stock"] == 0) & (df["ventas_90d"] == 0))]

    # Ordenar: desabasto primero, luego por meses_inventario asc
    df = df.sort_values(
        "meses_inventario",
        ascending=True,
        na_position="last",
    ).reset_index(drop=True)

    # ── 6. Retorno ────────────────────────────────────────────────────────
    return df.to_dict(orient="records")
