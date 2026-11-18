# Phase 1 Tasks

## Task 1: Backend tooling and Excel profiling
**Description:** Create `backend/.venv` and `backend/pyproject.toml` (ruff, mypy, pytest + pytest-asyncio config). Profile `Լավնա.xlsx` (read-only): SKU uniqueness, empty rows, categories, units, price ranges, `Փակված` values, drawing anchors vs rows.
**Acceptance criteria:**
- [ ] `ruff`, `mypy`, `pytest` run from `backend/`
- [ ] Profiling findings recorded in this file under Task 1 notes
**Verification:** `pytest` collects (0 tests OK); profiling script output reviewed
**Dependencies:** None
**Files:** `backend/pyproject.toml`, `backend/requirements*.txt`
**Scope:** S

## Task 2: Excel row parsing (pure, TDD)
**Description:** `backend/scripts/catalog_excel.py`: locate header row by name, map columns, normalize SKU/prices/booleans/units/barcodes, build `ProductRow` dataclasses, collect a skip report (missing SKU, duplicate SKU, missing name, negative price).
**Acceptance criteria:**
- [ ] Header found by column names, not a fixed row index
- [ ] Every rejected row appears in the skip report with a reason
- [ ] No DB or filesystem writes
**Verification:** `pytest tests/unit/test_catalog_excel.py`
**Dependencies:** 1
**Files:** `backend/scripts/catalog_excel.py`, `backend/tests/unit/test_catalog_excel.py`
**Scope:** S

## Task 3: Embedded image extraction (TDD)
**Description:** Map drawing anchors to SKU rows and write images to `frontend/public/images/products/{sku}.{ext}`; return `{sku: "/images/products/..."}` plus a list of unmatched anchors.
**Acceptance criteria:**
- [ ] Test builds a fixture workbook with images at known rows and gets the right SKU mapping
- [ ] Unmatched or duplicate anchors are reported, not silently assigned
**Verification:** `pytest tests/unit/test_catalog_images.py`
**Dependencies:** 2
**Files:** `backend/scripts/catalog_images.py`, `backend/tests/unit/test_catalog_images.py`
**Scope:** S

## Checkpoint A (after 1–3)
- [ ] Unit tests green, ruff/mypy clean
- [ ] Commit(s) made

## Task 4: Catalog models (base, category, product, inventory)
**Description:** Rewrite models: server UUID defaults, `lazy="raise"`, drop `products.stock_quantity`, CHECK constraints, GIN/B-Tree indexes declared in `__table_args__`.
**Acceptance criteria:**
- [ ] `configure_mappers()` succeeds
- [ ] Indexes and constraints present in `Base.metadata`
**Verification:** `pytest tests/unit/test_models_metadata.py`
**Dependencies:** 1
**Files:** `backend/app/models/{base,product,inventory}.py`, test
**Scope:** M

## Task 5: Commerce models (user, cart, wishlist, order)
**Description:** `citext` email, 8-digit `tax_id` CHECK, B2B field constraint, partial unique indexes (one cart per user, one default wishlist), cart item unique incl. variant, order CHECKs, no delete cascade from user to orders.
**Acceptance criteria:**
- [ ] Same metadata tests extended and green
**Verification:** `pytest tests/unit/test_models_metadata.py`
**Dependencies:** 4
**Files:** `backend/app/models/{user,cart,wishlist,order,__init__}.py`
**Scope:** M

## Task 6: Alembic baseline + async env
**Description:** Rewrite `0001` (extensions, all tables, indexes), async `env.py` per Alembic docs, URL only from settings, delete root `alembic.ini`, remove credentials from `backend/alembic.ini`.
**Acceptance criteria:**
- [ ] Fresh DB: `upgrade head` → `alembic check` reports no drift
- [ ] `downgrade base` → `upgrade head` round trip works
**Verification:** `pytest tests/integration/test_migrations.py` (uses `hardware_store_test`)
**Dependencies:** 5
**Files:** `backend/alembic/env.py`, `backend/alembic/versions/0001_*.py`, `backend/alembic.ini`, `alembic.ini` (delete), test
**Scope:** M

## Checkpoint B (after 4–6)
- [ ] All tests green; schema has zero drift
- [ ] Commit(s) made; review with human

## Task 7: Seeder write path + demo users
**Description:** `backend/scripts/seed_catalog.py`: async upsert categories (by slug), products (by SKU, UUID5 ids), inventory (by product+warehouse), demo users (env password, refused in production). Prints summary + skip report.
**Acceptance criteria:**
- [ ] Running twice yields identical row counts and no duplicates
- [ ] No JSON files written, no Elasticsearch
**Verification:** `pytest tests/integration/test_seed_catalog.py`
**Dependencies:** 2, 3, 6
**Files:** `backend/scripts/seed_catalog.py`, test
**Scope:** M

## Task 8: Reset local DB, verify indexes, remove legacy scripts
**Description:** Drop/recreate `hardware_store`, `alembic upgrade head`, run seeder. `EXPLAIN ANALYZE` trigram search uses GIN. Delete `backend/database/{migrate_excel.py,seed.py,schema.sql,seed.sql,migrations/,elasticsearch_mapping.json,products_seeded.json,check_db.py}` (no app imports). Keep `frontend/public/products_catalog.json` until Phase 4.
**Acceptance criteria:**
- [ ] ~1,391 products loaded, skip report reviewed
- [ ] GIN index used for `ILIKE '%…%'` / `%` similarity queries
**Verification:** psql counts + EXPLAIN output pasted in summary
**Dependencies:** 7
**Scope:** S

## Checkpoint: Phase 1 complete
- [ ] Full suite green, ruff/mypy clean
- [ ] code-review-and-quality pass on the Phase 1 diff
- [ ] Human review before Phase 2
