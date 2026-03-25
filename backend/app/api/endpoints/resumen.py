from fastapi import APIRouter

router = APIRouter()


@router.get("/monthly")
def kpis_monthly(mui: int | None = None, anio_mes: str | None = None):
    """Placeholder — retorna KPIs de ejemplo."""
    return [
        {
            "mui": 1,
            "nombre_agencia": "Agencia Ejemplo Norte",
            "qty_nuevos": 42,
            "plan": 50,
            "cumplimiento_pct": 84.0,
        },
        {
            "mui": 2,
            "nombre_agencia": "Agencia Ejemplo Sur",
            "qty_nuevos": 38,
            "plan": 45,
            "cumplimiento_pct": 84.4,
        },
    ]
