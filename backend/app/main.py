from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.endpoints import auth, commerce, products, search, wishlist
from app.core.config import settings
from app.core.database import dispose_engine, ping_database, verify_database_connection
from app.core.middleware import CSRF_HEADER, SESSION_TOKEN_HEADER, SecurityMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await verify_database_connection()  # fail fast: never serve without the database
    yield
    await dispose_engine()


# Interactive docs are a development aid; they are not served in production.
docs_enabled = not settings.is_production
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Suro B2C/B2B hardware store API (FastAPI + PostgreSQL).",
    lifespan=lifespan,
    openapi_url="/openapi.json" if docs_enabled else None,
    docs_url="/docs" if docs_enabled else None,
    redoc_url=None,
)

# Middleware order: the last added is the outermost. SecurityMiddleware wraps CORS so
# preflight responses also get security headers; preflights are OPTIONS (not an unsafe
# method), so the CSRF guard lets them through to CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,  # HttpOnly auth cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Accept", CSRF_HEADER, SESSION_TOKEN_HEADER],
    expose_headers=["Retry-After", SESSION_TOKEN_HEADER],
)
app.add_middleware(SecurityMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Like FastAPI's default 422, minus `input`/`ctx`: those echo submitted values
    (e.g. passwords) back into client logs and proxies."""
    errors = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


@app.exception_handler(Exception)
async def unhandled_error_handler(_request: Request, _exc: Exception) -> JSONResponse:
    # Details go to the server log (uvicorn logs the traceback); clients get nothing internal.
    return JSONResponse({"detail": "Internal server error."}, status_code=500)


app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(products.router, prefix=settings.API_V1_PREFIX)
app.include_router(search.router, prefix=settings.API_V1_PREFIX)
app.include_router(wishlist.router, prefix=settings.API_V1_PREFIX)
app.include_router(commerce.router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["Health"])
async def health_check() -> JSONResponse:
    """Liveness + DB reachability. Never returns connection details."""
    if await ping_database():
        return JSONResponse({"status": "healthy", "database": "connected"})
    return JSONResponse({"status": "unhealthy", "database": "unavailable"}, status_code=503)
