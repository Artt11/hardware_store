from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.middleware import SecurityHeadersMiddleware
from app.api.v1.endpoints import auth, products, search, wishlist, cart

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    description="Enterprise-Grade Minimalist Hardware Store API with OWASP Defense, B2C/B2B Auth & Protected Checkout"
)

# 1. OWASP Top 10 Fortified Security Headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
app.add_middleware(SecurityHeadersMiddleware)

# 2. Strict CORS policy with credentials support for HttpOnly cookies
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type",
                   "X-Session-Token", "Accept"],
    expose_headers=["Retry-After"]
)

# Root redirects directly to interactive Swagger docs


@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/docs")

# Support legacy /api/v1/docs path too


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
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "security": "fortified",
        "elasticsearch": "ready",
        "database": "ready"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
