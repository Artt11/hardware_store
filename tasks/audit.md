# Project Audit — 2026-11-18

Branch `refactor/phase1-3-backend`. Skills applied: code-review-and-quality, security-and-hardening,
performance-optimization, frontend-ui-engineering. Severity per code-review skill: **Critical** blocks merge,
*(none)* = required, **Consider** = optional. "Fix in" names the phase/task that resolves it.

## Critical

| # | Finding | Where | Fix in |
|---|---------|-------|--------|
| ~~C1~~ ✅ `acbea48` | Hardcoded demo accounts (incl. `role="admin"`, password `AdminSecure2026!`) committed in source and auto-created on **every login in every environment**. Anyone reading the repo can sign in as admin. | `backend/app/api/v1/endpoints/auth.py:421-506, 605` | **Now** (remove); demo users move to seeder (P1 T7, env password, refused in prod) |
| ~~C2~~ ✅ `acbea48` | `/health` returns the active DSN, which includes the DB username and password when set. When the pool is down it imports `load_fallback_catalog`, which no longer exists → 500. | `backend/app/main.py:63-87` | **Now** |
| ~~C3~~ ✅ `8f4f72e` | All guests without `X-Session-Token` share one cart (`"default-guest-session"`). Guests see and check out each other's carts; checkout empties the shared cart. | `cart.py:342, 371, 545` | P3 cart rewrite (server-issued random token) |
| ~~C4~~ ✅ `6819b57` | Frontend checkout fabricates a successful order (`LAVNA-xxxxxx`) when the API rejects it (409 out of stock, 422, 5xx) and adds it to order history. Customer believes an order exists that does not. | `frontend/src/App.tsx:688-700` | **Now** |
| ~~C5~~ ✅ `d060134` | `order_number = SURO-{time % 1e6}`: two orders in the same second collide (unique violation → 500), and the counter wraps every ~11.5 days. | `cart.py:415` | P1 (DB sequence) + P3 |
| ~~C6~~ ✅ `8f4f72e` | `b2b_invoice` (pay-later credit) is accepted from guests and individual accounts that type any 8 digits; credit limit never checked. | `cart.py:354-361` | P3 checkout service |

## Required

| # | Finding | Where | Fix in |
|---|---------|-------|--------|
| ~~R1~~ ✅ `b691be7` | Revoked/deactivated sessions still work on cart, checkout and wishlist: those routes only decode the JWT; `token_version`/`is_active` checked in `/auth/me` and `/refresh` only. Optional-auth helper swallows every error. | `security.py:130-154`, `cart.py:49-57`, `wishlist.py` | P2 (single `get_current_user` dependency hitting DB) |
| ~~R2~~ ✅ `b691be7`, `1230ade` | Access token returned in JSON and sent as `Authorization: Bearer`; spec requires both tokens exclusively in HttpOnly cookies. | `auth.py`, `AuthContext.tsx` | P2 + P4 |
| ~~R3~~ ✅ `acbea48` | Search autocomplete builds HTML (`<mark>`) from unescaped product names; frontend renders it with `dangerouslySetInnerHTML`. Stored XSS as soon as names are editable. | `search.py:218-226`, `Header.tsx:528` | **Now** (escape) ; P3 return match offsets instead of HTML |
| ~~R4~~ ✅ `d060134` | Stock stored twice (`products.stock_quantity` vs `inventory.quantity_on_hand`); checkout validates one and clamps the other with `max(0, …)`, so they drift. | models, `cart.py:430-437` | P1 T4 |
| ~~R5~~ ✅ `b691be7` | Login timing leaks which emails exist (no bcrypt work when user missing). `failed_login_attempts` counted but never enforced. | `auth.py:611-625` | P2 |
| ~~R6~~ ✅ `b691be7` | Registration: `tax_id` not validated as `^\d{8}$`; existence check + insert race returns 500 instead of 409; 128-char Armenian password can exceed bcrypt's 72-byte limit → 500. | `schemas/auth.py`, `auth.py:540-572` | P2 |
| ~~R7~~ ✅ `ca91cb1`, `b691be7` | `python-jose` is unmaintained with known CVEs (CVE-2024-33663 algorithm confusion, CVE-2024-33664 JWE DoS). Unused deps shipped: `passlib`, `elasticsearch`, `psycopg2-binary`, `pandas`. | `requirements.txt` | P2 (PyJWT), P1 T1 (prune) |
| ~~R8~~ ✅ `86b7093` | DB layer silently tries 7 DSNs including hardcoded passwords; app keeps running without a DB. | `core/database.py:27-82` | P2 |
| ~~R9~~ ✅ `b691be7` | In-memory rate limiter + multi-worker Uvicorn = limit × workers; behind a proxy every client shares one IP. | `middleware.py` | P2 (document limit or move to Postgres/Redis) |
| ~~R10~~ ✅ `1230ade` | Frontend loads catalog from static `products_catalog.json`, falls back to `/products?limit=250` → 1,141 of 1,391 products never shown. Filtering/search done client-side. | `App.tsx:485-510` | P4 |
| ~~R11~~ ✅ `1230ade` | Checkout from frontend sends no credentials → B2B users charged retail, orders not linked to account. Order history kept only in browser state. Cart only in localStorage. | `App.tsx:688`, `CartDrawer.tsx` | P4 |
| ~~R12~~ ✅ (Phase 5) | Docker: Dockerfile healthcheck hits `/api/v1/health` (route is `/health`) → container never healthy; compose mounts `schema.sql` into initdb **and** runs Alembic; seeds on every start; Elasticsearch exposed with security disabled; mounts the wrong Excel file; single Uvicorn worker; `build-essential` left in runtime image. | `backend/Dockerfile`, `docker-compose.yml` | P5 |
| ~~R13~~ ✅ `bf99586` | ~1,100 lines of commented-out previous implementations in `auth.py` (1-377), `products.py`, `search.py`. | endpoints | P2/P3 (deleted with rewrite) |

## Consider

- `App.tsx` is 3,171 lines; `LanguageContext.tsx` 1,277 (translations inline). Split by feature in P4.
- Search response duplicates every field in snake_case and camelCase, and maps `brand` ← `unit_of_measure` (wrong data). Fix contract in P3.
- Category facet counts are computed after applying the category filter, so the selected category hides the others. P3.
- `ILIKE '%q%'` does not escape `%`/`_` in user input. P3.
- Money returned as `float` in responses; use `Decimal` serialized as string. P3.
- HSTS with `preload` sent on plain-HTTP dev responses. P2.

## Verified OK

- No secrets in tracked files or git history; `.env` is gitignored.
- bcrypt is already offloaded with `asyncio.to_thread`; cost 12.
- Checkout already locks `products` and `inventory` with `FOR UPDATE` ordered by id.
- Auth tokens are not stored in localStorage; frontend `tsc --noEmit` passes.

## Follow-up reviews (doubt-driven, fresh-context adversarial)

- **Schema review (Phase 1):** 31 findings → 17 fixed in `d060134`, rest documented trade-offs.
- **Auth review (Phase 2):** 4 High, 9 Medium, 6 Low → fixed in `b691be7`: lockout race (claim before
  bcrypt), lockout/timing enumeration, thread-unsafe limiter, proxy-aware client IP, refresh rotation with
  reuse detection, ENVIRONMENT fail-closed, CORS validation, 422 password echo, __Host- cookies + duplicate
  cookie rejection, unverified-company wholesale pricing, header order, rehash, aud claim, no-store.
  Accepted trade-offs: /register reveals registered emails (needs email verification), deliberate account
  lockout by an attacker (15 min; email unlock later), per-process rate limiter (DB lockout is the
  cross-worker defense).

Open question for the owner: fractional quantities (2.5 կգ, 3.2 մ)? Whole units today.

## Dependency audit (2026-11-19)

- Shipped code: `npm audit --omit=dev` 0 vulnerabilities; `pip-audit -r requirements.txt` none.
- Deferred (dev-only, not shipped): `tinypool` (critical, GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr)
  via vitest 3, and `esbuild` (moderate, GHSA-67mh-4wv8-2f99) via vite 5. Both need a major toolchain
  upgrade (vitest 4 / vite 6+) that `npm audit fix --force` would apply blindly. Reachable only through
  attacker-controlled options to local test runs / the localhost dev server. Upgrade as its own change
  (read changelogs, one major at a time). Review by 2026-12-19.
