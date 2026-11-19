# Performance ledger

Every optimization attempt, kept or reverted, with before/after numbers
(performance-optimization skill). Read this before proposing an experiment.

| Date | Idea | Baseline → Result | Verdict | Why |
|------|------|-------------------|---------|-----|
| 2026-11-19 | `random_page_cost = 1.1` (SSD) so the planner uses the pg_trgm GIN index on 1,391 products | `name ILIKE '%պտուտակ%'`: Seq Scan 1.42 ms → Bitmap Index 0.49–0.59 ms (3 runs). `name % 'պտուտակահան'`: Seq Scan 6.54 ms → 0.67–1.13 ms (3 runs) | kept | With the default 4.0 the planner preferred a sequential scan although the index was 3–7× faster. Applied via `ALTER DATABASE` locally; docker-compose already passes `-c random_page_cost=1.1`. |
| 2026-11-19 | Trigram GIN index on `name_ru` / `name_en` after loading 1,391 translations | `name_ru ILIKE '%отвёртка%'`: Seq Scan 1.92–1.98 ms (after ANALYZE; 6.8 ms before, stale stats) vs forced Bitmap Index 1.91–2.79 ms (3 runs each) | kept index, no tuning | At this table size both plans cost the same and the planner correctly picks the scan. The index is for catalog growth; always ANALYZE after a bulk import. |

Measured on local PostgreSQL 14.17 (Apple Silicon, SSD), warm cache, `EXPLAIN (ANALYZE)`.
