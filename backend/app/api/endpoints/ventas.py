from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.services import ventas_service

router = APIRouter()


@router.get("/resumen")
def ventas_resumen(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return ventas_service.get_resumen(db, mui, anio_mes)


@router.get("/tendencia")
def ventas_tendencia(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return ventas_service.get_tendencia(db, mui, anio_mes)


@router.get("/por-modelo")
def ventas_por_modelo(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return ventas_service.get_por_modelo(db, mui, anio_mes)


@router.get("/flujos")
def ventas_flujos(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return ventas_service.get_flujos(db, mui, anio_mes)


@router.get("/cumplimiento-pacing")
def ventas_cumplimiento_pacing(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return ventas_service.get_cumplimiento_pacing(db, mui, anio_mes)


@router.get("/detalle")
def ventas_detalle(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return ventas_service.get_detalle(db, mui, anio_mes)
