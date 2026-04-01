from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.services import financiero_service

router = APIRouter()


@router.get("/edr")
def estado_resultados(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return financiero_service.get_edr(db, mui, anio_mes)


@router.get("/dealer-profile")
def dealer_profile_financiero(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return financiero_service.get_dealer_profile_financiero(db, mui, anio_mes)


@router.get("/ventas-kpis")
def ventas_kpis(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return financiero_service.get_ventas_kpis(db, mui, anio_mes)
