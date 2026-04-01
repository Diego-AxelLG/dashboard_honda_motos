from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.services import inventario_service

router = APIRouter()


@router.get("/aging")
def inventario_aging(mui: int | None = None, db: Session = Depends(get_db)):
    return inventario_service.get_aging(db, mui)


@router.get("/detalle")
def inventario_detalle(mui: int | None = None, db: Session = Depends(get_db)):
    return inventario_service.get_detalle(db, mui)
