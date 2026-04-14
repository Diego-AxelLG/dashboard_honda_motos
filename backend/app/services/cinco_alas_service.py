"""Servicio de consultas: Programa "5 Alas" Honda de México.

Evaluación trimestral por grupo (Tijuana + Mexicali combinadas).
- Catálogo de KPIs en dwh.cinco_alas_catalogo
- Headers en dwh.cinco_alas_evaluacion (UNIQUE anio, trimestre)
- Detalle en dwh.cinco_alas_detalle (UNIQUE evaluacion_id, kpi_codigo)
"""
from calendar import monthrange
from datetime import date
from sqlalchemy import text
from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Cálculo de alas e incentivo
# ---------------------------------------------------------------------------

def calcular_alas(puntos_netos: float) -> tuple[int, int]:
    """Escala 2026: (numero_alas, pct_incentivo)."""
    if puntos_netos >= 356:
        return (5, 6)
    if puntos_netos >= 333:
        return (4, 4)
    if puntos_netos >= 302:
        return (3, 3)
    if puntos_netos >= 271:
        return (2, 2)
    return (1, 0)


def _trimestre_rango(anio: int, trimestre: int) -> tuple[date, date]:
    """Retorna [inicio, fin_exclusivo] del trimestre."""
    mes_inicio = (trimestre - 1) * 3 + 1
    mes_fin = mes_inicio + 3
    inicio = date(anio, mes_inicio, 1)
    fin = date(anio + 1, 1, 1) if mes_fin > 12 else date(anio, mes_fin, 1)
    return inicio, fin


def _trimestre_actual(hoy: date | None = None) -> tuple[int, int]:
    hoy = hoy or date.today()
    return hoy.year, (hoy.month - 1) // 3 + 1


# ---------------------------------------------------------------------------
# Catálogo / lectura
# ---------------------------------------------------------------------------

def get_catalogo(db: Session) -> list[dict]:
    sql = text("""
        SELECT kpi_codigo, area, nombre, detalle, puntos_maximo,
               penalizacion_max, es_automatico, orden
        FROM dwh.cinco_alas_catalogo
        ORDER BY orden
    """)
    return [dict(r) for r in db.execute(sql).mappings().all()]


def _totales_por_area(detalle: list[dict]) -> dict:
    por_area: dict[str, dict] = {}
    for d in detalle:
        a = d["area"]
        if a not in por_area:
            por_area[a] = {"obtenido": 0.0, "maximo": 0.0, "penalizacion": 0.0}
        por_area[a]["obtenido"] += float(d.get("puntos_obtenidos") or 0)
        por_area[a]["maximo"] += float(d.get("puntos_maximo") or 0)
        por_area[a]["penalizacion"] += float(d.get("penalizacion") or 0)
    return por_area


def _resumen_desde_detalle(anio: int, trimestre: int, detalle: list[dict]) -> dict:
    puntos_pos = sum(float(d.get("puntos_obtenidos") or 0) for d in detalle)
    penals = sum(float(d.get("penalizacion") or 0) for d in detalle)
    netos = puntos_pos + penals
    alas, pct = calcular_alas(netos)
    return {
        "anio": anio,
        "trimestre": trimestre,
        "puntos_positivos": round(puntos_pos, 1),
        "penalizaciones": round(penals, 1),
        "puntos_netos": round(netos, 1),
        "alas": alas,
        "pct_incentivo": pct,
        "por_area": _totales_por_area(detalle),
    }


def get_evaluaciones(db: Session) -> list[dict]:
    sql = text("""
        SELECT e.id, e.anio, e.trimestre, e.capturado_por,
               e.fecha_captura, e.notas,
               COALESCE(SUM(d.puntos_obtenidos), 0) AS puntos_positivos,
               COALESCE(SUM(d.penalizacion), 0)    AS penalizaciones,
               COALESCE(SUM(d.puntos_obtenidos) + SUM(d.penalizacion), 0) AS puntos_netos
        FROM dwh.cinco_alas_evaluacion e
        LEFT JOIN dwh.cinco_alas_detalle d ON d.evaluacion_id = e.id
        GROUP BY e.id
        ORDER BY e.anio DESC, e.trimestre DESC
    """)
    out = []
    for r in db.execute(sql).mappings().all():
        row = dict(r)
        row["fecha_captura"] = row["fecha_captura"].isoformat() if row["fecha_captura"] else None
        netos = float(row["puntos_netos"] or 0)
        alas, pct = calcular_alas(netos)
        row["alas"] = alas
        row["pct_incentivo"] = pct
        out.append(row)
    return out


def get_evaluacion(db: Session, anio: int, trimestre: int) -> dict:
    """Retorna la evaluación guardada o, si no existe, catálogo con zeros + precálculos."""
    catalogo = get_catalogo(db)

    sql_header = text("""
        SELECT id, anio, trimestre, capturado_por,
               fecha_captura, notas
        FROM dwh.cinco_alas_evaluacion
        WHERE anio = CAST(:anio AS int) AND trimestre = CAST(:trim AS int)
    """)
    header = db.execute(sql_header, {"anio": anio, "trim": trimestre}).mappings().first()

    if header is None:
        # Nueva: catálogo + precálculos como sugerencia
        precalc = get_precalculo(db, anio, trimestre)
        detalle = []
        for k in catalogo:
            sug = precalc.get(k["kpi_codigo"])
            detalle.append({
                "kpi_codigo": k["kpi_codigo"],
                "area": k["area"],
                "nombre": k["nombre"],
                "detalle_kpi": k["detalle"],
                "puntos_obtenidos": sug["puntos_sugeridos"] if sug else 0,
                "puntos_maximo": float(k["puntos_maximo"]),
                "penalizacion": 0,
                "penalizacion_max": float(k["penalizacion_max"]),
                "es_automatico": k["es_automatico"],
                "notas": sug["explicacion"] if sug else None,
                "evidencia_url": None,
                "precalculo": sug,
            })
        return {
            "existe": False,
            "anio": anio,
            "trimestre": trimestre,
            "capturado_por": None,
            "fecha_captura": None,
            "notas": None,
            "detalle": detalle,
            "resumen": _resumen_desde_detalle(anio, trimestre, detalle),
        }

    eval_id = int(header["id"])
    sql_det = text("""
        SELECT d.kpi_codigo, d.area, c.nombre, c.detalle AS detalle_kpi,
               d.puntos_obtenidos, d.puntos_maximo, d.penalizacion,
               c.penalizacion_max, d.es_automatico, d.notas, d.evidencia_url
        FROM dwh.cinco_alas_detalle d
        JOIN dwh.cinco_alas_catalogo c ON c.kpi_codigo = d.kpi_codigo
        WHERE d.evaluacion_id = CAST(:id AS int)
        ORDER BY c.orden
    """)
    rows = [dict(r) for r in db.execute(sql_det, {"id": eval_id}).mappings().all()]

    # Completar con KPIs faltantes del catálogo
    codigos_presentes = {r["kpi_codigo"] for r in rows}
    for k in catalogo:
        if k["kpi_codigo"] not in codigos_presentes:
            rows.append({
                "kpi_codigo": k["kpi_codigo"],
                "area": k["area"],
                "nombre": k["nombre"],
                "detalle_kpi": k["detalle"],
                "puntos_obtenidos": 0,
                "puntos_maximo": float(k["puntos_maximo"]),
                "penalizacion": 0,
                "penalizacion_max": float(k["penalizacion_max"]),
                "es_automatico": k["es_automatico"],
                "notas": None,
                "evidencia_url": None,
            })

    orden_map = {k["kpi_codigo"]: k["orden"] for k in catalogo}
    rows.sort(key=lambda r: orden_map.get(r["kpi_codigo"], 999))

    return {
        "existe": True,
        "id": eval_id,
        "anio": int(header["anio"]),
        "trimestre": int(header["trimestre"]),
        "capturado_por": header["capturado_por"],
        "fecha_captura": header["fecha_captura"].isoformat() if header["fecha_captura"] else None,
        "notas": header["notas"],
        "detalle": rows,
        "resumen": _resumen_desde_detalle(int(header["anio"]), int(header["trimestre"]), rows),
    }


# ---------------------------------------------------------------------------
# Upsert (POST)
# ---------------------------------------------------------------------------

def upsert_evaluacion(db: Session, payload: dict) -> dict:
    anio = int(payload["anio"])
    trimestre = int(payload["trimestre"])
    capturado_por = payload.get("capturado_por")
    notas = payload.get("notas")
    detalle_in = payload.get("detalle", [])

    sql_upsert_header = text("""
        INSERT INTO dwh.cinco_alas_evaluacion (anio, trimestre, capturado_por, notas, fecha_captura)
        VALUES (CAST(:anio AS int), CAST(:trim AS int), :cap, :notas, NOW())
        ON CONFLICT (anio, trimestre) DO UPDATE SET
            capturado_por = EXCLUDED.capturado_por,
            notas         = EXCLUDED.notas,
            fecha_captura = NOW()
        RETURNING id
    """)
    eval_id = db.execute(sql_upsert_header, {
        "anio": anio, "trim": trimestre,
        "cap": capturado_por, "notas": notas,
    }).scalar_one()

    # Catálogo como fuente de verdad para area / puntos_maximo
    catalogo = {k["kpi_codigo"]: k for k in get_catalogo(db)}

    sql_upsert_det = text("""
        INSERT INTO dwh.cinco_alas_detalle
            (evaluacion_id, area, kpi_codigo, puntos_obtenidos, puntos_maximo,
             penalizacion, es_automatico, notas, evidencia_url)
        VALUES
            (CAST(:id AS int), :area, :kpi, :pts, :max, :pen, :auto, :notas, :url)
        ON CONFLICT (evaluacion_id, kpi_codigo) DO UPDATE SET
            puntos_obtenidos = EXCLUDED.puntos_obtenidos,
            penalizacion     = EXCLUDED.penalizacion,
            es_automatico    = EXCLUDED.es_automatico,
            notas            = EXCLUDED.notas,
            evidencia_url    = EXCLUDED.evidencia_url
    """)
    for d in detalle_in:
        kpi = d.get("kpi_codigo")
        if kpi not in catalogo:
            continue
        cat = catalogo[kpi]
        pts = float(d.get("puntos_obtenidos") or 0)
        pen = float(d.get("penalizacion") or 0)
        # Clamp defensivo
        pts = max(0.0, min(pts, float(cat["puntos_maximo"])))
        pen = min(0.0, max(pen, float(cat["penalizacion_max"])))
        db.execute(sql_upsert_det, {
            "id": eval_id,
            "area": cat["area"],
            "kpi": kpi,
            "pts": pts,
            "max": float(cat["puntos_maximo"]),
            "pen": pen,
            "auto": bool(cat["es_automatico"]),
            "notas": d.get("notas"),
            "url": d.get("evidencia_url"),
        })

    db.commit()
    return get_evaluacion(db, anio, trimestre)


# ---------------------------------------------------------------------------
# Precálculos desde el DWH
# ---------------------------------------------------------------------------

def _precalc_v1_ventas(db: Session, anio: int, trimestre: int) -> dict:
    """V1 — Cumplimiento Ventas RS del trimestre.

    Ventas (ambas sucursales) vs plan trimestral. 120 pts si ≥ 100%, 0 si no.
    """
    inicio, fin = _trimestre_rango(anio, trimestre)
    meses = [f"{(inicio.replace(day=1).year)}-{m:02d}" for m in range(inicio.month, inicio.month + 3)]

    sql_ventas = text("""
        SELECT COUNT(*) AS ventas
        FROM dwh.fact_ventas
        WHERE fecha >= CAST(:ini AS date) AND fecha < CAST(:fin AS date)
    """)
    ventas = int(db.execute(sql_ventas, {"ini": inicio, "fin": fin}).scalar_one() or 0)

    sql_plan = text("""
        SELECT COALESCE(SUM(plan_ventas), 0) AS plan
        FROM dwh.fact_plan
        WHERE anio_mes = ANY(:meses)
    """)
    plan = int(db.execute(sql_plan, {"meses": meses}).scalar_one() or 0)

    pct = round((ventas / plan) * 100, 1) if plan else None
    puntos = 120.0 if (pct is not None and pct >= 100) else 0.0

    return {
        "ventas": ventas,
        "plan": plan,
        "pct_cumplimiento": pct,
        "puntos_sugeridos": puntos,
        "explicacion": (
            f"Ventas Q{trimestre} {anio}: {ventas} / plan {plan}"
            + (f" ({pct}% cumplimiento)" if pct is not None else "")
        ),
    }


def _precalc_v5_niguri(db: Session, anio: int, trimestre: int) -> dict:
    """V5 — Niguri N-4: meses de stock en rango 1.3–1.9 al día ~15 de cada mes del trimestre.

    meses_stock = existencia / ventas_promedio_mensual
    Si los 3 meses están en rango → 10 pts. Cada mes fuera resta proporcionalmente.
    """
    inicio, _ = _trimestre_rango(anio, trimestre)
    meses_list = []
    for i in range(3):
        m = inicio.month + i
        y = inicio.year + (m - 1) // 12
        mm = ((m - 1) % 12) + 1
        meses_list.append((y, mm))

    detalle_meses = []
    cumplidos = 0
    for y, m in meses_list:
        dia15 = date(y, m, 15)
        # Stock al día más cercano ≤ 15 del mes
        sql_stock = text("""
            SELECT COALESCE(SUM(cantidad), 0) AS stock, MAX(fecha_snapshot) AS snap
            FROM dwh.fact_inventario
            WHERE fecha_snapshot = (
                SELECT MAX(fecha_snapshot)
                FROM dwh.fact_inventario
                WHERE fecha_snapshot <= CAST(:d15 AS date)
                  AND fecha_snapshot >= CAST(:d15 AS date) - INTERVAL '20 days'
            )
              AND NOT facturado
        """)
        r = db.execute(sql_stock, {"d15": dia15}).mappings().first()
        stock = int(r["stock"] or 0) if r else 0

        # Venta promedio mensual: últimos 3 meses previos al mes evaluado
        m_ini = date(y, m, 1)
        m_prev = date(y - 1, m + 9, 1) if m <= 3 else date(y, m - 3, 1)
        sql_vp = text("""
            SELECT COUNT(*) AS n
            FROM dwh.fact_ventas
            WHERE fecha >= CAST(:ini AS date) AND fecha < CAST(:fin AS date)
        """)
        vendidas_3m = int(db.execute(sql_vp, {"ini": m_prev, "fin": m_ini}).scalar_one() or 0)
        prom = vendidas_3m / 3 if vendidas_3m else 0
        meses_stock = round(stock / prom, 2) if prom else None
        en_rango = meses_stock is not None and 1.3 <= meses_stock <= 1.9
        if en_rango:
            cumplidos += 1

        detalle_meses.append({
            "mes": f"{y}-{m:02d}",
            "stock": stock,
            "venta_promedio_mensual": round(prom, 1),
            "meses_stock": meses_stock,
            "en_rango": en_rango,
        })

    puntos = round(10.0 * cumplidos / 3, 1)
    return {
        "meses": detalle_meses,
        "meses_en_rango": cumplidos,
        "puntos_sugeridos": puntos,
        "explicacion": f"{cumplidos}/3 meses con stock 1.3–1.9 en Q{trimestre} {anio}",
    }


def get_precalculo(db: Session, anio: int, trimestre: int) -> dict:
    """Retorna KPIs automáticos con valores sugeridos (dict por kpi_codigo)."""
    out: dict = {}
    try:
        out["V1"] = _precalc_v1_ventas(db, anio, trimestre)
    except Exception as e:
        out["V1"] = {"error": str(e), "puntos_sugeridos": 0, "explicacion": "No disponible"}
    try:
        out["V5"] = _precalc_v5_niguri(db, anio, trimestre)
    except Exception as e:
        out["V5"] = {"error": str(e), "puntos_sugeridos": 0, "explicacion": "No disponible"}
    return out


# ---------------------------------------------------------------------------
# Resumen actual (para Resumen Ejecutivo)
# ---------------------------------------------------------------------------

def get_resumen_actual(db: Session) -> dict:
    """Último trimestre con datos guardados, o el trimestre en curso vacío."""
    anio_act, trim_act = _trimestre_actual()

    sql = text("""
        SELECT id, anio, trimestre
        FROM dwh.cinco_alas_evaluacion
        WHERE (anio, trimestre) = (CAST(:a AS int), CAST(:t AS int))
    """)
    row = db.execute(sql, {"a": anio_act, "t": trim_act}).mappings().first()

    if row is None:
        sql_last = text("""
            SELECT anio, trimestre
            FROM dwh.cinco_alas_evaluacion
            ORDER BY anio DESC, trimestre DESC
            LIMIT 1
        """)
        last = db.execute(sql_last).mappings().first()
        if last is None:
            return {
                "existe": False,
                "anio": anio_act,
                "trimestre": trim_act,
                "puntos_positivos": 0,
                "penalizaciones": 0,
                "puntos_netos": 0,
                "alas": 0,
                "pct_incentivo": 0,
                "por_area": {},
            }
        anio_q, trim_q = int(last["anio"]), int(last["trimestre"])
        ev = get_evaluacion(db, anio_q, trim_q)
    else:
        ev = get_evaluacion(db, anio_act, trim_act)

    resumen = ev["resumen"]
    resumen["existe"] = True
    return resumen
