from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core.database import get_db

router = APIRouter()


@router.get("/")
def health_check():
    return {"status": "ok"}


@router.get("/etl")
def etl_last_run(db: Session = Depends(get_db)) -> list[dict]:
    """Última corrida exitosa por ETL — alimenta el badge 'Última actualización'."""
    sql = text("""
        SELECT etl_name,
               to_char(last_run_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_run_at
        FROM dwh.etl_last_run
        ORDER BY etl_name
    """)
    return [dict(r) for r in db.execute(sql).mappings().all()]
