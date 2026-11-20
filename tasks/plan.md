# Implementation Plan: Phase 1 — Database, Migrations & Catalog Seeding

Source spec: the project brief in the session ("Suro Construction & Hardware E-Commerce Platform"), sections 1–4.
Branch: `refactor/phase1-3-backend` (not merged to `main` until Phase 3 is complete — see Risks).

## Overview

Replace the drifted, hand-built local schema with SQLAlchemy 2.0 models and one clean Alembic baseline that is
the single source of truth, then load the catalog from `backend/database/Լավնա.xlsx` (including its embedded
photos) with one idempotent async seeder. No JSON snapshots, no Elasticsearch, no hardcoded DSNs.

## Architecture Decisions

- **One baseline migration, local DB reset.** Nothing is deployed, so `0001` is rewritten instead of stacking
  fix-up migrations. Local `hardware_store` is dropped and rebuilt (approved by user).
- **`inventory` is the only stock record.** `products.stock_quantity` is removed. Checkout (Phase 3) will lock
  `products` then `inventory` rows ordered by `id`. Excel has no stock column, so the seeder writes an explicit,
  configurable demo quantity (`SEED_DEFAULT_STOCK`, default 100) — flagged as demo data, not a fact.
- **Integrity lives in the database**, not only in Pydantic: CHECK constraints (quantities > 0, prices ≥ 0,
  `quantity_reserved <= quantity_on_hand`, enum-like status/payment/order-type columns, `tax_id ~ '^\d{8}$'`),
  `citext` email, server-side `gen_random_uuid()` defaults, partial unique indexes (one cart per user, one
  default wishlist per user).
- **Relationships default to `lazy="raise"`.** Each query must choose `selectinload`/`joinedload` explicitly,
  so an N+1 fails loudly in tests instead of silently in production.
- **Orders are financial records.** `User.orders` no longer cascades deletes; FK stays `ON DELETE SET NULL`.
- **Search indexes:** `pg_trgm` GIN on `products.name` and `products.sku`, `jsonb_path_ops` GIN on
  `specifications`, B-Tree on every FK. Extensions `pg_trgm`, `uuid-ossp`, `pgcrypto`, `citext` enabled in the migration.
- **Alembic runs on the async engine (asyncpg)** using the documented async `env.py` template; psycopg2 is dropped.
  The root-level `alembic.ini` (duplicate, hardcoded credentials) is removed; URL comes from settings only.
- **Images:** extracted from the workbook's drawing anchors to `frontend/public/images/products/{sku}.{ext}`;
  `products.image_url` stores the relative path. The `նկար ` / feedback columns are ignored.
- **Tests:** pure parsing logic → small pytest tests (no DB). Migration + seeder → medium tests against a
  throwaway Postgres database (`hardware_store_test`), created and dropped by the test fixture.

## Definition of Done (every task)

- `ruff check` and `mypy` clean for files touched; `pytest` green; no skipped tests.
- Migration changes: upgrade → `alembic check` (no drift) → downgrade → upgrade on a fresh DB.
- Atomic commit with a conventional message; no secrets in the diff.

## Task List

Tracked in `tasks/todo.md`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Removing `products.stock_quantity` breaks the existing cart/products/search endpoints (7 backend files) until they are rewritten in Phase 3 | High | Branch is not merged to `main` until Phase 3 is done. Phase 1 only guarantees models, migration, and seeder; app import smoke test is noted as expected-broken for those routers. |
| `frontend/src/App.tsx` reads `frontend/public/products_catalog.json` directly | Med | Keep that file untouched until Phase 4 switches the frontend to `/api/v1` (deprecation skill: remove only after the consumer migrates). Backend legacy scripts are removed in Phase 1 because nothing in the app imports them. |
| Drawing anchors in the workbook may not line up 1:1 with SKU rows (merged/offset anchors, duplicates) | Med | Profile anchors first (Task 1); test the anchor→row mapping with a generated fixture workbook; report unmatched images instead of guessing. |
| Local Postgres is 14.17, spec targets 16 | Low | All Phase 1 features exist in PG 14. PG 16 verification in Docker during Phase 5. |
| Demo user passwords | Med | Read from env (`SEED_DEMO_PASSWORD`); seeder refuses to create demo users when `ENVIRONMENT=production`. |

## Skills applied per phase

- Phase 1: planning-and-task-breakdown, incremental-implementation, test-driven-development,
  source-driven-development, deprecation-and-migration, git-workflow-and-versioning, performance-optimization (indexes).
- Phase 2: security-and-hardening, api-and-interface-design, doubt-driven-development (auth/session logic).
- Phase 3: api-and-interface-design, performance-optimization, debugging-and-error-recovery, observability-and-instrumentation.
- Phase 4: frontend-ui-engineering, design-taste-frontend, impeccable, apple-design, emilkowalski_skills, browser-testing-with-devtools.
- Phase 5: ci-cd-and-automation, shipping-and-launch, security-and-hardening.
- Every phase end: code-review-and-quality, code-simplification, documentation-and-adrs.
- Not applicable to this project: prompt-master-main, skill-inspector, idea-refine, interview-me (requirements are already specified).

## Open Questions

- None blocking. Demo stock quantity default (100) and demo user set (one B2C, one B2B) can be changed later.
