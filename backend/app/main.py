import logging
import time
from collections import defaultdict

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from backend.app.api.router import api_router
from backend.app.core.config import settings
from backend.app.middleware.audit_log import AuditLogMiddleware

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Conditional docs: disabled in production
# ---------------------------------------------------------------------------
_is_prod = settings.ENVIRONMENT.lower() == "production"

app = FastAPI(
    title="BI Platform API",
    version="0.1.0",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)

# ---------------------------------------------------------------------------
# CORS — restricted to configured origins
# ---------------------------------------------------------------------------
_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ---------------------------------------------------------------------------
# Global rate limiting middleware (in-memory, per IP)
# ---------------------------------------------------------------------------
_rate_log: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60  # seconds
_DEFAULT_RATE_LIMIT = 60


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if not path.startswith("/api/") or not _is_prod:
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        now = time.time()

        bucket = f"{ip}:{_DEFAULT_RATE_LIMIT}"
        _rate_log[bucket] = [
            t for t in _rate_log[bucket] if now - t < _RATE_WINDOW
        ]

        if len(_rate_log[bucket]) >= _DEFAULT_RATE_LIMIT:
            return Response(
                content='{"detail":"Demasiadas solicitudes. Intenta en un momento."}',
                status_code=429,
                media_type="application/json",
            )

        _rate_log[bucket].append(now)
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)

# ---------------------------------------------------------------------------
# Audit logging middleware (outermost — captures all traffic)
# ---------------------------------------------------------------------------
app.add_middleware(AuditLogMiddleware)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"Status": "Active"}
