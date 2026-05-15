"""Endpoints Cobranza — CxC + OS abiertas + sistema de compromisos."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.services import cobranza_service

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas (Pydantic) para los POST/PATCH
# ---------------------------------------------------------------------------
class CompromisoCreate(BaseModel):
    comentario: str = Field(..., min_length=5, max_length=1000)
    dias_compromiso: int  # 15 | 30 | 45 | 60 (validado en service)


class CompromisoCommentUpdate(BaseModel):
    comentario: str = Field(..., min_length=5, max_length=1000)


# ---------------------------------------------------------------------------
# CxC
# ---------------------------------------------------------------------------
@router.get("/cxc")
def cxc_summary(mui: int | None = None, db: Session = Depends(get_db)):
    return cobranza_service.get_cxc_summary(db, mui)


@router.get("/cxc/detalle")
def cxc_detalle(mui: int = Query(...), db: Session = Depends(get_db)):
    return cobranza_service.get_cxc_detalle(db, mui)


@router.get("/cxc/compromisos")
def cxc_compromisos_historial(
    movimiento: str = Query(...),
    mui: int = Query(...),
    db: Session = Depends(get_db),
):
    return cobranza_service.get_cxc_compromisos_historial(db, movimiento, mui)


@router.post("/cxc/compromisos")
def cxc_compromiso_crear(
    movimiento: str = Query(...),
    mui: int = Query(...),
    body: CompromisoCreate = ...,
    db: Session = Depends(get_db),
):
    return cobranza_service.create_cxc_compromiso(
        db, movimiento, mui, body.comentario, body.dias_compromiso
    )


@router.patch("/cxc/compromisos/{compromiso_id}")
def cxc_compromiso_editar(
    compromiso_id: int,
    body: CompromisoCommentUpdate,
    db: Session = Depends(get_db),
):
    return cobranza_service.update_cxc_compromiso_comentario(db, compromiso_id, body.comentario)


# ---------------------------------------------------------------------------
# OS abiertas (versión con compromisos)
# ---------------------------------------------------------------------------
@router.get("/os-abiertas")
def os_summary(mui: int | None = None, db: Session = Depends(get_db)):
    return cobranza_service.get_os_summary(db, mui)


@router.get("/os-abiertas/detalle")
def os_detalle(mui: int = Query(...), db: Session = Depends(get_db)):
    return cobranza_service.get_os_detalle(db, mui)


@router.get("/os-abiertas/compromisos")
def os_compromisos_historial(
    numero_ot: str = Query(...),
    mui: int = Query(...),
    db: Session = Depends(get_db),
):
    return cobranza_service.get_os_compromisos_historial(db, numero_ot, mui)


@router.post("/os-abiertas/compromisos")
def os_compromiso_crear(
    numero_ot: str = Query(...),
    mui: int = Query(...),
    body: CompromisoCreate = ...,
    db: Session = Depends(get_db),
):
    return cobranza_service.create_os_compromiso(
        db, numero_ot, mui, body.comentario, body.dias_compromiso
    )


@router.patch("/os-abiertas/compromisos/{compromiso_id}")
def os_compromiso_editar(
    compromiso_id: int,
    body: CompromisoCommentUpdate,
    db: Session = Depends(get_db),
):
    return cobranza_service.update_os_compromiso_comentario(db, compromiso_id, body.comentario)
