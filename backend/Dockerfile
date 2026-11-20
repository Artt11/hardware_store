# syntax=docker/dockerfile:1
# Multi-stage: build wheels with compilers, ship only the runtime (no build tools).
# Multi-arch base images: builds natively on ARM64 (Apple Silicon) and AMD64.

FROM python:3.13-slim AS build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt

FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    WEB_CONCURRENCY=4
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app --no-create-home app
COPY --from=build /wheels /wheels
RUN pip install --no-index --find-links=/wheels /wheels/* && rm -rf /wheels

WORKDIR /app
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app app ./app
COPY --chown=app:app database/Լավնա.xlsx ./database/Լավնա.xlsx
COPY --chown=app:app database/product_translations.xlsx ./database/product_translations.xlsx
# Seeder writes extracted product photos here; compose mounts the shared volume on it.
RUN mkdir -p /app/product-images && chown app:app /app/product-images

USER app
EXPOSE 8000

# /health returns 503 when PostgreSQL is unreachable. No curl in slim images: use Python.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# --proxy-headers + --forwarded-allow-ips: only the internal reverse proxy (FORWARDED_ALLOW_IPS)
# may set X-Forwarded-For; the app additionally checks TRUSTED_PROXY_IPS for rate limiting.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY} --proxy-headers --forwarded-allow-ips=${FORWARDED_ALLOW_IPS:-127.0.0.1} --no-server-header"]
