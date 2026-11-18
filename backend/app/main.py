from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.database import close_db_pool, get_active_dsn, get_db_pool, init_db_pool
from app.core.middleware import SecurityHeadersMiddleware
from app.api.v1.endpoints import auth, cart, products, search, wishlist


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize PostgreSQL connection pool on startup
    await init_db_pool()
    yield
    # Cleanly close PostgreSQL pool on shutdown
    await close_db_pool()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
    description="Enterprise-Grade Minimalist Hardware Store API with PostgreSQL, Elasticsearch & Antigravity UI",
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
async def health_check():
    pool = await get_db_pool()
    db_status = "disconnected"
    product_count = 0
    if pool is not None:
        try:
            async with pool.acquire() as conn:
                product_count = int(await conn.fetchval("SELECT COUNT(*) FROM products;") or 0)
                db_status = "connected"
        except Exception:
            db_status = "fallback_json"
    else:
        from app.api.v1.endpoints.products import load_fallback_catalog

        product_count = len(load_fallback_catalog())
        db_status = "fallback_json"

    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "database": db_status,
        "dsn": get_active_dsn(),
        "total_products": product_count,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
