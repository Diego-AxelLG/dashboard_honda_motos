from fastapi import APIRouter

from backend.app.api.endpoints.auth import router as auth_router
from backend.app.api.endpoints.health import router as health_router
from backend.app.api.endpoints.resumen import router as resumen_router
from backend.app.api.endpoints.ventas import router as ventas_router
from backend.app.api.endpoints.postventa import router as postventa_router
from backend.app.api.endpoints.financiero import router as financiero_router
from backend.app.api.endpoints.inventario import router as inventario_router
from backend.app.api.endpoints.cinco_alas import router as cinco_alas_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["Auth"])
api_router.include_router(health_router, prefix="/health", tags=["Health"])
api_router.include_router(resumen_router, prefix="/kpis", tags=["KPIs"])
api_router.include_router(ventas_router, prefix="/ventas", tags=["Ventas"])
api_router.include_router(postventa_router, prefix="/postventa", tags=["Postventa"])
api_router.include_router(financiero_router, prefix="/financiero", tags=["Financiero"])
api_router.include_router(inventario_router, prefix="/inventario", tags=["Inventario"])
api_router.include_router(cinco_alas_router, prefix="/cinco-alas", tags=["Cinco Alas"])
