from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.services import postventa_service

router = APIRouter()


@router.get("/servicio-kpis")
def servicio_kpis(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return postventa_service.get_servicio_kpis(db, mui, anio_mes)


@router.get("/os-abiertas")
def os_abiertas(mui: int | None = None, db: Session = Depends(get_db)):
    return postventa_service.get_os_abiertas(db, mui)


@router.get("/os-abiertas/detalle")
def os_abiertas_detalle(mui: int | None = None, db: Session = Depends(get_db)):
    return postventa_service.get_os_abiertas_detalle(db, mui)


@router.get("/refacciones")
def refacciones(mui: int | None = None, db: Session = Depends(get_db)):
    return postventa_service.get_refacciones(db, mui)


@router.get("/uio")
def uio(mui: int | None = None, db: Session = Depends(get_db)):
    return postventa_service.get_uio(db, mui)
