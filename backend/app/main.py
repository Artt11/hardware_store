from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.api.v1.endpoints import auth, cart, products, search, wishlist
from app.core.config import settings
from app.core.database import dispose_engine, ping_database, verify_database_connection
from app.core.middleware import SecurityHeadersMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    await verify_database_connection()  # fail fast: never serve without the database
    yield
    await dispose_engine()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    description="Suro B2C/B2B hardware store API (FastAPI + PostgreSQL).",
)

# 1. OWASP Top 10 Fortified Security Headers
app.add_middleware(SecurityHeadersMiddleware)

# 2. Strict CORS policy with credentials support for HttpOnly cookies
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type",
                   "X-Session-Token", "Accept"],
    expose_headers=["Retry-After"],
)


@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/docs")


@app.get(f"{settings.API_V1_PREFIX}/docs", include_in_schema=False)
async def api_docs_redirect():
    return RedirectResponse(url="/docs")


# Mount API routers under /api/v1
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(products.router, prefix=settings.API_V1_PREFIX)
app.include_router(search.router, prefix=settings.API_V1_PREFIX)
app.include_router(wishlist.router, prefix=settings.API_V1_PREFIX)
app.include_router(cart.router, prefix=settings.API_V1_PREFIX)


@app.get("/health", tags=["Health"])
async def health_check() -> JSONResponse:
    """Liveness + DB reachability. Never returns connection details."""
    if await ping_database():
        return JSONResponse({"status": "healthy", "database": "connected"})
    return JSONResponse(
        {"status": "unhealthy", "database": "unavailable"},
        status_code=503,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
