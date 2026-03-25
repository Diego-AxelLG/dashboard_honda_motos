from fastapi import APIRouter

from backend.app.api.endpoints.auth import router as auth_router
from backend.app.api.endpoints.health import router as health_router
from backend.app.api.endpoints.resumen import router as resumen_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["Auth"])
api_router.include_router(health_router, prefix="/health", tags=["Health"])
api_router.include_router(resumen_router, prefix="/kpis", tags=["KPIs"])
