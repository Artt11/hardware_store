# Lavna / Suro — construction & hardware store

B2C and B2B online store for the Armenian market (AMD, Armenian-first UI).
FastAPI + async SQLAlchemy 2 + PostgreSQL 16 backend; Vite + React + TypeScript storefront.

## Run locally

Requirements: Python 3.11+, Node 22+, PostgreSQL 14+ with a **UTF-8 locale database**
(under the `C` locale, Armenian search returns nothing).

```bash
cp .env.example .env              # set POSTGRES_* and ENVIRONMENT=development

# database
createdb -T template0 -E UTF8 --locale=en_US.UTF-8 hardware_store

# backend
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed.run                       # catalog + images from database/Լավնա.xlsx
SEED_DEMO_PASSWORD='choose-12+-chars' .venv/bin/python -m app.seed.run --demo-users   # optional
.venv/bin/uvicorn app.main:app --reload                # http://127.0.0.1:8000/docs

# storefront (proxies /api to :8000, so session cookies are same-origin)
cd ../frontend && npm ci && npm run dev                # http://localhost:5173
```

Demo accounts (after `--demo-users`): `demo.customer@suro.am` (retail) and
`demo.company@suro.am` (verified B2B: wholesale prices, invoice payment, 5,000,000 ֏ credit).

## Test

```bash
cd backend && .venv/bin/pytest -q          # unit + integration + concurrency (needs PostgreSQL)
.venv/bin/ruff check app tests alembic && .venv/bin/mypy app
cd ../frontend && npm test && npm run typecheck && npm run build
```

Integration tests create and drop a throwaway `<POSTGRES_DB>_test` database. Set
`TEST_DB_LOCALE` if `en_US.UTF-8` does not exist on your system (e.g. `C.UTF-8`).

## Docker

```bash
docker compose up -d --build                         # http://localhost:8080
docker compose --profile seed run --rm seed          # import the catalog
```

`web` (nginx) serves the storefront and proxies `/api` to the backend; only it is published.
In production put TLS in front of `web` and set `ENVIRONMENT=production`, strong
`JWT_SECRET`/`JWT_REFRESH_SECRET`, and `CORS_ORIGINS=["https://your-domain"]`; the app refuses
to start otherwise.

## Architecture notes

- **Stock** lives only in `inventory`. Checkout locks cart → user → products → inventory
  (`FOR UPDATE`, ordered by id) in one transaction; concurrency tests prove no overselling.
- **Sessions**: access/refresh JWTs only in HttpOnly cookies, re-validated against
  `users.token_version` and `is_active` on every request; refresh tokens rotate with reuse
  detection; CSRF guard via `X-Requested-With`.
- **B2B** = company account **and** verified by staff (`users.is_verified`); until then retail.
  Staff verification is currently a database update — there is no admin UI yet.
- **Search** uses pg_trgm GIN indexes (ILIKE + word similarity, typo tolerant).
- Decisions, audit findings and trade-offs: `tasks/audit.md`; performance experiments: `backend/PERF.md`.
