from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.services import financiero_service

router = APIRouter()


@router.get("/financials")
def financials(mui: int | None = None, anio_mes: str | None = None, db: Session = Depends(get_db)):
    return financiero_service.get_financials(db, mui, anio_mes)
