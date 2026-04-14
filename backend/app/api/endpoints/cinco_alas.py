from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.services import cinco_alas_service

router = APIRouter()


@router.get("/catalogo")
def cinco_alas_catalogo(db: Session = Depends(get_db)):
    return cinco_alas_service.get_catalogo(db)


@router.get("/evaluaciones")
def cinco_alas_evaluaciones(db: Session = Depends(get_db)):
    return cinco_alas_service.get_evaluaciones(db)


@router.get("/evaluacion")
def cinco_alas_evaluacion(anio: int, trimestre: int, db: Session = Depends(get_db)):
    return cinco_alas_service.get_evaluacion(db, anio, trimestre)


@router.post("/evaluacion")
def cinco_alas_guardar(payload: dict = Body(...), db: Session = Depends(get_db)):
    return cinco_alas_service.upsert_evaluacion(db, payload)


@router.get("/precalculo")
def cinco_alas_precalculo(anio: int, trimestre: int, db: Session = Depends(get_db)):
    return cinco_alas_service.get_precalculo(db, anio, trimestre)


@router.get("/resumen-actual")
def cinco_alas_resumen_actual(db: Session = Depends(get_db)):
    return cinco_alas_service.get_resumen_actual(db)
