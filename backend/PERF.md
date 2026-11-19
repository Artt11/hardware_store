# Performance ledger

Every optimization attempt, kept or reverted, with before/after numbers
(performance-optimization skill). Read this before proposing an experiment.

| Date | Idea | Baseline → Result | Verdict | Why |
|------|------|-------------------|---------|-----|
| 2026-11-19 | `random_page_cost = 1.1` (SSD) so the planner uses the pg_trgm GIN index on 1,391 products | `name ILIKE '%պտուտակ%'`: Seq Scan 1.42 ms → Bitmap Index 0.49–0.59 ms (3 runs). `name % 'պտուտակահան'`: Seq Scan 6.54 ms → 0.67–1.13 ms (3 runs) | kept | With the default 4.0 the planner preferred a sequential scan although the index was 3–7× faster. Applied via `ALTER DATABASE` locally; docker-compose already passes `-c random_page_cost=1.1`. |

Measured on local PostgreSQL 14.17 (Apple Silicon, SSD), warm cache, `EXPLAIN (ANALYZE)`.
