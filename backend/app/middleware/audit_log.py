import logging
import time

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

audit_logger = logging.getLogger("audit")
audit_logger.setLevel(logging.INFO)

_handler = logging.FileHandler("audit.log")
_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
audit_logger.addHandler(_handler)


class AuditLogMiddleware(BaseHTTPMiddleware):
    """Logs every request to audit.log for traffic analysis and bot detection."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.time()
        response: Response = await call_next(request)
        duration = time.time() - start

        audit_logger.info(
            "%s %s %s %d %.3fs",
            request.client.host if request.client else "-",
            request.method,
            request.url.path,
            response.status_code,
            duration,
        )
        return response
