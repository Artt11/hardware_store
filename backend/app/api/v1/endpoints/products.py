# """
# SQL-Level Paginated, Filtered & Sorted Products Endpoint (`backend/app/api/v1/endpoints/products.py`).
# Fixes:
# - BUG-08: Pushes `WHERE`, `ORDER BY`, `LIMIT`, `OFFSET`, and facet `GROUP BY`
#   aggregations directly into PostgreSQL instead of loading all 1,391 rows into memory.
# - ISSUE-04:
#   1. Caches global catalog facet aggregations (`categories`, `units`, `min_price`, `max_price`)
#      for 60 seconds so paginated/filtered requests execute only 2 fast SQL queries (`COUNT` + `SELECT`).
#   2. Parses `UUID` in `get_product_detail` so UUID lookups use the primary key B-Tree index (`WHERE id = $1::uuid`)
#      instead of casting `LOWER(id::text)` on every row.
# """

# import json
# import math
# import time
# from datetime import datetime, timezone
# from pathlib import Path
# from typing import Any, Dict, List, Optional, Tuple
# from uuid import UUID, uuid5

# from fastapi import APIRouter, HTTPException, Query, status

# from app.core.database import get_db_pool
# from app.schemas.product import (
#     FacetCountItem,
#     PaginatedProductsResponse,
#     ProductDetail,
#     ProductImageSchema,
#     ProductListItem,
# )

# router = APIRouter(prefix="/products", tags=["Products"])

# BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent
# SEEDED_JSON_PATH = BASE_DIR / "database" / "products_seeded.json"
# EXCEL_FILE_PATH = BASE_DIR / "database" / "Products Սուրո.xlsx"
# SKU_NAMESPACE = UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

# HARDWARE_PLACEHOLDER_IMAGES = [
#     "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1000&q=85",
#     "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=1000&q=85",
#     "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=1000&q=85",
#     "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?auto=format&fit=crop&w=1000&q=85",
#     "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1000&q=85",
#     "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1000&q=85",
# ]

# _CACHED_SEEDED_PRODUCTS: Optional[List[Dict[str, Any]]] = None

# # ISSUE-04 Fix: 60-second TTL cache for global catalog facets & price bounds
# _FACETS_CACHE_TTL_SECONDS = 60.0
# _FACETS_CACHE_TIMESTAMP: float = 0.0
# _FACETS_CACHE_DATA: Optional[
#     Tuple[List[FacetCountItem], List[FacetCountItem], float, float]
# ] = None

# SAFE_SORT_COLUMNS = {
#     "sku": "sku",
#     "name": "name",
#     "retail_price": "retail_price",
#     "price": "retail_price",
#     "base_price": "retail_price",
#     "wholesale_price": "wholesale_price",
# }


# def get_placeholder_image(sku: str) -> str:
#     idx = sum(ord(c) for c in sku) % len(HARDWARE_PLACEHOLDER_IMAGES)
#     return HARDWARE_PLACEHOLDER_IMAGES[idx]


# def load_fallback_catalog() -> List[Dict[str, Any]]:
#     """Fallback JSON snapshot reader used only if PostgreSQL is unreachable."""
#     global _CACHED_SEEDED_PRODUCTS
#     if _CACHED_SEEDED_PRODUCTS is not None:
#         return _CACHED_SEEDED_PRODUCTS

#     if SEEDED_JSON_PATH.exists():
#         try:
#             _CACHED_SEEDED_PRODUCTS = json.loads(SEEDED_JSON_PATH.read_text(encoding="utf-8"))
#             return _CACHED_SEEDED_PRODUCTS
#         except Exception:
#             pass
#     return []


# async def get_all_catalog_records() -> List[Dict[str, Any]]:
#     """Return cached fallback catalog records when full scan is requested."""
#     return load_fallback_catalog()


# def row_to_dict(r: Any) -> Dict[str, Any]:
#     specs = r["specifications"]
#     if isinstance(specs, str):
#         try:
#             specs = json.loads(specs)
#         except Exception:
#             specs = {}
#     elif specs is None:
#         specs = {}

#     retail = float(
#         r["retail_price"] if r["retail_price"] is not None else (r["base_price"] or 0.0)
#     )
#     wholesale = float(r["wholesale_price"] or 0.0)
#     discount = float(r["discount_percent"] or 0.0)
#     return {
#         "id": str(r["id"]),
#         "sku": r["sku"],
#         "name": r["name"],
#         "slug": r["slug"] or f"product-{r['sku'].lower()}",
#         "unit_of_measure": r["unit_of_measure"] or "հատ",
#         "category": r["category"] or "Uncategorized",
#         "retail_price": retail,
#         "wholesale_price": wholesale,
#         "barcode": r["barcode"],
#         "vat_applicable": bool(r["vat_applicable"]) if r["vat_applicable"] is not None else True,
#         "discount_percent": discount,
#         "description": r["description"],
#         "image_url": r["image_url"],
#         "is_active": bool(r["is_active"]) if r["is_active"] is not None else True,
#         "base_price": retail,
#         "compare_at_price": (
#             float(r["compare_at_price"]) if r["compare_at_price"] is not None else None
#         ),
#         "currency": r["currency"] or "AMD",
#         "stock_quantity": int(r["stock_quantity"] if r["stock_quantity"] is not None else 25),
#         "specifications": dict(specs),
#         "rating_average": float(r["rating_average"] or 4.8),
#         "rating_count": int(r["rating_count"] or 12),
#         "created_at": r["created_at"],
#         "updated_at": r["updated_at"],
#     }


# async def _get_or_load_facets(
#     conn: Any,
# ) -> Tuple[List[FacetCountItem], List[FacetCountItem], float, float]:
#     """
#     ISSUE-04 Fix: Returns global category/unit facets and price bounds from a 60s TTL cache,
#     eliminating 3 full-table aggregation queries on every paginated product request.
#     """
#     global _FACETS_CACHE_TIMESTAMP, _FACETS_CACHE_DATA
#     now = time.monotonic()
#     if (
#         _FACETS_CACHE_DATA is not None
#         and (now - _FACETS_CACHE_TIMESTAMP) < _FACETS_CACHE_TTL_SECONDS
#     ):
#         return _FACETS_CACHE_DATA

#     cat_rows = await conn.fetch(
#         """
#         SELECT COALESCE(category, 'Uncategorized') AS val, COUNT(*)::int AS cnt
#         FROM products
#         GROUP BY COALESCE(category, 'Uncategorized')
#         ORDER BY cnt DESC, val ASC;
#         """
#     )
#     unit_rows = await conn.fetch(
#         """
#         SELECT COALESCE(unit_of_measure, 'հատ') AS val, COUNT(*)::int AS cnt
#         FROM products
#         GROUP BY COALESCE(unit_of_measure, 'հատ')
#         ORDER BY cnt DESC, val ASC;
#         """
#     )
#     bounds_row = await conn.fetchrow(
#         "SELECT COALESCE(MIN(retail_price), 0)::float AS min_p, COALESCE(MAX(retail_price), 0)::float AS max_p FROM products;"
#     )

#     category_facets = [
#         FacetCountItem(value=r["val"], label=f"{r['val']} ({r['cnt']})", count=r["cnt"])
#         for r in cat_rows
#     ]
#     unit_facets = [
#         FacetCountItem(value=r["val"], label=f"{r['val']} ({r['cnt']})", count=r["cnt"])
#         for r in unit_rows
#     ]
#     min_p = float(bounds_row["min_p"]) if bounds_row else 0.0
#     max_p = float(bounds_row["max_p"]) if bounds_row else 0.0

#     _FACETS_CACHE_DATA = (category_facets, unit_facets, min_p, max_p)
#     _FACETS_CACHE_TIMESTAMP = now
#     return _FACETS_CACHE_DATA


# async def query_catalog_from_postgres(
#     *,
#     limit: int,
#     offset: int,
#     query_term: str,
#     categories_filter: List[str],
#     units_filter: List[str],
#     min_price: Optional[float],
#     max_price: Optional[float],
#     is_active: Optional[bool],
#     in_stock_only: bool,
#     sort_by: str,
#     sort_order: str,
# ) -> Optional[
#     Tuple[
#         List[Dict[str, Any]],
#         int,
#         List[FacetCountItem],
#         List[FacetCountItem],
#         float,
#         float,
#     ]
# ]:
#     """
#     BUG-08 & ISSUE-04 Fix: Executes parameterized SQL `WHERE`, `ORDER BY`, `LIMIT`, and `OFFSET`
#     directly inside PostgreSQL, returning only the requested page slice plus cached facet counts.
#     """
#     pool = await get_db_pool()
#     if pool is None:
#         return None

#     where_clauses: List[str] = []
#     params: List[Any] = []

#     def add_param(val: Any) -> str:
#         params.append(val)
#         return f"${len(params)}"

#     if is_active is not None:
#         p_idx = add_param(is_active)
#         where_clauses.append(f"is_active = {p_idx}")

#     if in_stock_only:
#         where_clauses.append("is_active = TRUE AND stock_quantity > 0")

#     if query_term:
#         like_idx = add_param(f"%{query_term}%")
#         where_clauses.append(
#             f"(name ILIKE {like_idx} OR sku ILIKE {like_idx} OR "
#             f"COALESCE(barcode, '') ILIKE {like_idx} OR "
#             f"COALESCE(category, '') ILIKE {like_idx} OR "
#             f"COALESCE(description, '') ILIKE {like_idx})"
#         )

#     if categories_filter:
#         cat_idx = add_param([c.lower() for c in categories_filter])
#         where_clauses.append(f"LOWER(COALESCE(category, 'Uncategorized')) = ANY({cat_idx}::text[])")

#     if units_filter:
#         unit_idx = add_param([u.lower() for u in units_filter])
#         where_clauses.append(f"LOWER(COALESCE(unit_of_measure, 'հատ')) = ANY({unit_idx}::text[])")

#     if min_price is not None:
#         min_idx = add_param(min_price)
#         where_clauses.append(f"retail_price >= {min_idx}")

#     if max_price is not None:
#         max_idx = add_param(max_price)
#         where_clauses.append(f"retail_price <= {max_idx}")

#     where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
#     order_col = SAFE_SORT_COLUMNS.get(sort_by.strip().lower(), "sku")
#     order_dir = "DESC" if sort_order.strip().lower() == "desc" else "ASC"

#     try:
#         async with pool.acquire() as conn:
#             # 1. Total filtered count
#             total = int(
#                 await conn.fetchval(f"SELECT COUNT(*) FROM products {where_sql};", *params) or 0
#             )

#             # 2. Paginated slice with SQL ORDER BY, LIMIT, OFFSET
#             limit_placeholder = add_param(limit)
#             offset_placeholder = add_param(offset)
#             rows = await conn.fetch(
#                 f"""
#                 SELECT
#                     id, sku, name, slug, unit_of_measure, category,
#                     retail_price, wholesale_price, barcode, vat_applicable,
#                     discount_percent, description, image_url, is_active,
#                     base_price, compare_at_price, currency, stock_quantity,
#                     specifications, rating_average, rating_count,
#                     created_at, updated_at
#                 FROM products
#                 {where_sql}
#                 ORDER BY {order_col} {order_dir}
#                 LIMIT {limit_placeholder} OFFSET {offset_placeholder};
#                 """,
#                 *params,
#             )

#             # 3. Cached global facets & price bounds (60s TTL)
#             category_facets, unit_facets, min_p, max_p = await _get_or_load_facets(conn)

#             return (
#                 [row_to_dict(r) for r in rows],
#                 total,
#                 category_facets,
#                 unit_facets,
#                 min_p,
#                 max_p,
#             )
#     except Exception:
#         return None


# def record_to_list_item(p: Dict[str, Any]) -> ProductListItem:
#     sku = str(p.get("sku", ""))
#     raw_image = p.get("image_url")
#     resolved_image = raw_image if raw_image else get_placeholder_image(sku)
#     unit = str(p.get("unit_of_measure") or "հատ")
#     category = str(p.get("category") or "Uncategorized")
#     retail_price = float(p.get("retail_price", p.get("base_price", 0.0)))
#     wholesale_price = float(p.get("wholesale_price", 0.0))
#     barcode = p.get("barcode")
#     vat_applicable = bool(p.get("vat_applicable", True))
#     discount_percent = float(p.get("discount_percent", 0.0))
#     is_active = bool(p.get("is_active", True))
#     stock_qty = int(p.get("stock_quantity", 25 if is_active else 0))

#     key_specs: Dict[str, str] = {"Չափման միավոր": unit}
#     if barcode:
#         key_specs["Գծիկավոր կոդ"] = str(barcode)
#     if wholesale_price > 0:
#         key_specs["Մեծածախ"] = f"{wholesale_price:,.0f} ֏"

#     return ProductListItem(
#         id=UUID(str(p["id"])),
#         sku=sku,
#         name=str(p["name"]),
#         slug=str(p.get("slug") or f"product-{sku.lower()}"),
#         unit_of_measure=unit,
#         category=category,
#         retail_price=retail_price,
#         wholesale_price=wholesale_price,
#         barcode=str(barcode) if barcode else None,
#         vat_applicable=vat_applicable,
#         discount_percent=discount_percent,
#         description=p.get("description"),
#         image_url=resolved_image,
#         is_active=is_active,
#         brand_name="Սուրո",
#         category_name=category,
#         base_price=retail_price,
#         compare_at_price=p.get("compare_at_price"),
#         currency=str(p.get("currency") or "AMD"),
#         in_stock=is_active and stock_qty > 0,
#         stock_quantity=stock_qty,
#         rating_average=float(p.get("rating_average", 4.8)),
#         rating_count=int(p.get("rating_count", 12)),
#         primary_image_url=resolved_image,
#         thumbnail_url=resolved_image,
#         key_specs=key_specs,
#     )


# def record_to_detail(p: Dict[str, Any]) -> ProductDetail:
#     sku = str(p.get("sku", ""))
#     raw_image = p.get("image_url")
#     resolved_image = raw_image if raw_image else get_placeholder_image(sku)
#     unit = str(p.get("unit_of_measure") or "հատ")
#     category = str(p.get("category") or "Uncategorized")
#     retail_price = float(p.get("retail_price", p.get("base_price", 0.0)))
#     wholesale_price = float(p.get("wholesale_price", 0.0))
#     barcode = p.get("barcode")
#     vat_applicable = bool(p.get("vat_applicable", True))
#     discount_percent = float(p.get("discount_percent", 0.0))
#     is_active = bool(p.get("is_active", True))
#     stock_qty = int(p.get("stock_quantity", 25 if is_active else 0))

#     specs = dict(p.get("specifications") or {})
#     specs["unit_of_measure"] = unit
#     if barcode:
#         specs["barcode"] = str(barcode)
#     if wholesale_price > 0:
#         specs["wholesale_price"] = f"{wholesale_price:,.0f} ֏"
#     specs["vat_applicable"] = "Այո (ԱԱՀ)" if vat_applicable else "Ոչ"

#     now = datetime.now(timezone.utc)
#     return ProductDetail(
#         id=UUID(str(p["id"])),
#         sku=sku,
#         name=str(p["name"]),
#         slug=str(p.get("slug") or f"product-{sku.lower()}"),
#         unit_of_measure=unit,
#         category=category,
#         retail_price=retail_price,
#         wholesale_price=wholesale_price,
#         barcode=str(barcode) if barcode else None,
#         vat_applicable=vat_applicable,
#         discount_percent=discount_percent,
#         description=p.get("description") or str(p["name"]),
#         short_description=p.get("description") or f"Կոդ: {sku} • Չափման միավոր: {unit}",
#         image_url=resolved_image,
#         is_active=is_active,
#         brand_name="Սուրո",
#         category_name=category,
#         base_price=retail_price,
#         compare_at_price=p.get("compare_at_price"),
#         currency=str(p.get("currency") or "AMD"),
#         stock_quantity=stock_qty,
#         is_published=is_active,
#         specifications=specs,
#         rating_average=float(p.get("rating_average", 4.8)),
#         rating_count=int(p.get("rating_count", 12)),
#         images=[
#             ProductImageSchema(
#                 id=uuid5(SKU_NAMESPACE, f"img-{sku}"),
#                 image_url=resolved_image,
#                 thumbnail_url=resolved_image,
#                 alt_text=str(p["name"]),
#                 is_primary=True,
#                 display_order=0,
#             )
#         ],
#         created_at=p.get("created_at") if isinstance(p.get("created_at"), datetime) else now,
#         updated_at=p.get("updated_at") if isinstance(p.get("updated_at"), datetime) else now,
#     )


# @router.get("", response_model=PaginatedProductsResponse)
# async def list_products(
#     limit: int = Query(36, ge=1, le=2000, description="Number of items to return (limit)"),
#     offset: int = Query(0, ge=0, description="Number of items to skip (offset)"),
#     page: Optional[int] = Query(None, ge=1, description="Optional 1-indexed page number"),
#     page_size: Optional[int] = Query(None, ge=1, le=2000, description="Optional page size override"),
#     search: Optional[str] = Query(None, alias="q", description="Search by name, SKU, or barcode"),
#     q: Optional[str] = Query(None, description="Search query string"),
#     category: Optional[str] = Query(None, description="Filter by category (Խումբ)"),
#     unit_of_measure: Optional[str] = Query(
#         None, description="Filter by unit of measure (Չափման միավոր, e.g. հատ, տուփ)"
#     ),
#     brand: Optional[str] = Query(None, description="Filter by brand"),
#     min_price: Optional[float] = Query(None, ge=0, description="Minimum retail_price"),
#     max_price: Optional[float] = Query(None, ge=0, description="Maximum retail_price"),
#     is_active: Optional[bool] = Query(
#         True, description="Filter by active status (derived from Փակված)"
#     ),
#     in_stock_only: bool = Query(False, description="Only return active in-stock items"),
#     sort_by: str = Query(
#         "sku", description="Sort field: sku, name, retail_price, wholesale_price"
#     ),
#     sort_order: str = Query("asc", description="Sort direction: asc or desc"),
# ):
#     """
#     List catalog products using SQL-level `WHERE`, `ORDER BY`, `LIMIT`, and `OFFSET`
#     against PostgreSQL (falling back to local JSON snapshot only if DB is offline).
#     """
#     effective_limit = page_size if page_size is not None else limit
#     if page is not None:
#         effective_offset = (page - 1) * effective_limit
#         effective_page = page
#     else:
#         effective_offset = offset
#         effective_page = (effective_offset // effective_limit) + 1

#     query_term = (search or q or "").strip()
#     categories_filter = [c.strip() for c in (category or "").split(",") if c.strip()]
#     units_filter = [u.strip() for u in (unit_of_measure or "").split(",") if u.strip()]

#     pg_result = await query_catalog_from_postgres(
#         limit=effective_limit,
#         offset=effective_offset,
#         query_term=query_term,
#         categories_filter=categories_filter,
#         units_filter=units_filter,
#         min_price=min_price,
#         max_price=max_price,
#         is_active=is_active,
#         in_stock_only=in_stock_only,
#         sort_by=sort_by,
#         sort_order=sort_order,
#     )

#     if pg_result is not None:
#         page_slice, total, category_facets, unit_facets, min_p, max_p = pg_result
#         total_pages = max(1, math.ceil(total / effective_limit)) if total > 0 else 1
#         has_more = (effective_offset + len(page_slice)) < total
#         return PaginatedProductsResponse(
#             items=[record_to_list_item(p) for p in page_slice],
#             total=total,
#             limit=effective_limit,
#             offset=effective_offset,
#             page=effective_page,
#             page_size=effective_limit,
#             total_pages=total_pages,
#             has_more=has_more,
#             has_next=has_more,
#             has_prev=effective_offset > 0,
#             categories=category_facets,
#             units=unit_facets,
#             min_retail_price=min_p,
#             max_retail_price=max_p,
#         )

#     # Offline fallback if PostgreSQL is unreachable
#     all_records = load_fallback_catalog()
#     cat_counts: Dict[str, int] = {}
#     unit_counts: Dict[str, int] = {}
#     prices: List[float] = []

#     for rec in all_records:
#         c = str(rec.get("category") or "Uncategorized")
#         u = str(rec.get("unit_of_measure") or "հատ")
#         cat_counts[c] = cat_counts.get(c, 0) + 1
#         unit_counts[u] = unit_counts.get(u, 0) + 1
#         prices.append(float(rec.get("retail_price", 0.0)))

#     category_facets = [
#         FacetCountItem(value=k, label=f"{k} ({v})", count=v)
#         for k, v in sorted(cat_counts.items(), key=lambda x: (-x[1], x[0]))
#     ]
#     unit_facets = [
#         FacetCountItem(value=k, label=f"{k} ({v})", count=v)
#         for k, v in sorted(unit_counts.items(), key=lambda x: (-x[1], x[0]))
#     ]

#     q_lower = query_term.lower()
#     filtered = all_records
#     if is_active is not None:
#         filtered = [p for p in filtered if bool(p.get("is_active", True)) == is_active]
#     if in_stock_only:
#         filtered = [
#             p
#             for p in filtered
#             if bool(p.get("is_active", True)) and int(p.get("stock_quantity", 25)) > 0
#         ]
#     if q_lower:
#         filtered = [
#             p
#             for p in filtered
#             if q_lower in str(p.get("name", "")).lower()
#             or q_lower in str(p.get("sku", "")).lower()
#             or q_lower in str(p.get("barcode") or "").lower()
#         ]
#     if categories_filter:
#         cat_set = {c.lower() for c in categories_filter}
#         filtered = [
#             p for p in filtered if str(p.get("category") or "Uncategorized").lower() in cat_set
#         ]
#     if units_filter:
#         unit_set = {u.lower() for u in units_filter}
#         filtered = [
#             p for p in filtered if str(p.get("unit_of_measure") or "հատ").lower() in unit_set
#         ]
#     if min_price is not None:
#         filtered = [p for p in filtered if float(p.get("retail_price", 0.0)) >= min_price]
#     if max_price is not None:
#         filtered = [p for p in filtered if float(p.get("retail_price", 0.0)) <= max_price]

#     reverse = sort_order.strip().lower() == "desc"
#     sort_field = sort_by.strip().lower()
#     if sort_field in ("retail_price", "price", "base_price"):
#         filtered.sort(key=lambda p: float(p.get("retail_price", 0.0)), reverse=reverse)
#     elif sort_field == "wholesale_price":
#         filtered.sort(key=lambda p: float(p.get("wholesale_price", 0.0)), reverse=reverse)
#     elif sort_field == "name":
#         filtered.sort(key=lambda p: str(p.get("name", "")).lower(), reverse=reverse)
#     else:
#         filtered.sort(key=lambda p: str(p.get("sku", "")), reverse=reverse)

#     total = len(filtered)
#     total_pages = max(1, math.ceil(total / effective_limit)) if total > 0 else 1
#     page_slice = filtered[effective_offset : effective_offset + effective_limit]
#     has_more = (effective_offset + len(page_slice)) < total

#     return PaginatedProductsResponse(
#         items=[record_to_list_item(p) for p in page_slice],
#         total=total,
#         limit=effective_limit,
#         offset=effective_offset,
#         page=effective_page,
#         page_size=effective_limit,
#         total_pages=total_pages,
#         has_more=has_more,
#         has_next=has_more,
#         has_prev=effective_offset > 0,
#         categories=category_facets,
#         units=unit_facets,
#         min_retail_price=min(prices) if prices else 0.0,
#         max_retail_price=max(prices) if prices else 0.0,
#     )


# @router.get("/{product_id}", response_model=ProductDetail)
# async def get_product_detail(product_id: str):
#     """
#     Fetch a single product by UUID or SKU using an index-friendly SQL lookup.
#     ISSUE-04 Fix: Uses direct `WHERE id = $1::uuid` primary key lookup when `product_id`
#     is a valid UUID, avoiding `LOWER(id::text)` sequential scans.
#     """
#     target = product_id.strip()
#     parsed_uuid: Optional[UUID] = None
#     try:
#         parsed_uuid = UUID(target)
#     except (ValueError, TypeError):
#         parsed_uuid = None

#     pool = await get_db_pool()
#     if pool is not None:
#         try:
#             async with pool.acquire() as conn:
#                 if parsed_uuid is not None:
#                     row = await conn.fetchrow(
#                         """
#                         SELECT
#                             id, sku, name, slug, unit_of_measure, category,
#                             retail_price, wholesale_price, barcode, vat_applicable,
#                             discount_percent, description, image_url, is_active,
#                             base_price, compare_at_price, currency, stock_quantity,
#                             specifications, rating_average, rating_count,
#                             created_at, updated_at
#                         FROM products
#                         WHERE id = $1::uuid
#                         LIMIT 1;
#                         """,
#                         parsed_uuid,
#                     )
#                 else:
#                     row = await conn.fetchrow(
#                         """
#                         SELECT
#                             id, sku, name, slug, unit_of_measure, category,
#                             retail_price, wholesale_price, barcode, vat_applicable,
#                             discount_percent, description, image_url, is_active,
#                             base_price, compare_at_price, currency, stock_quantity,
#                             specifications, rating_average, rating_count,
#                             created_at, updated_at
#                         FROM products
#                         WHERE LOWER(sku) = LOWER($1)
#                         LIMIT 1;
#                         """,
#                         target,
#                     )
#                 if row is not None:
#                     return record_to_detail(row_to_dict(row))
#         except Exception:
#             pass

#     for p in load_fallback_catalog():
#         if (
#             str(p.get("id", "")).lower() == target.lower()
#             or str(p.get("sku", "")).lower() == target.lower()
#         ):
#             return record_to_detail(p)

#     raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
"""
SQLAlchemy 2.0 Optimized Products Endpoint (`backend/app/api/v1/endpoints/products.py`).
- Enforces strict PostgreSQL persistence (No JSON/in-memory fallbacks).
- Uses AsyncSession and SQLAlchemy 2.0 syntax for paginated queries and facet aggregations.
- Validates and serializes all outputs through Pydantic V2 `model_validate`.
"""

import math
from typing import List, Optional, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.models.product import Product
from app.schemas.product import (
    FacetCountItem,
    PaginatedProductsResponse,
    ProductDetail,
    ProductListItem,
)

router = APIRouter(prefix="/products", tags=["Products"])


async def get_catalog_facets(db: AsyncSession) -> tuple[List[FacetCountItem], List[FacetCountItem], float, float]:
    """
    [Applying Skill: Async SQLAlchemy 2.0]
    Executes aggregation queries using ORM syntax to extract global category counts,
    unit counts, and price boundaries directly from PostgreSQL.
    """
    # Category Facets
    cat_stmt = select(
        func.coalesce(Product.category, 'Uncategorized').label('val'),
        func.count(Product.id).label('cnt')
    ).group_by(func.coalesce(Product.category, 'Uncategorized')).order_by(func.count(Product.id).desc())
    cat_rows = await db.execute(cat_stmt)
    categories = [FacetCountItem(
        value=row.val, label=f"{row.val} ({row.cnt})", count=row.cnt) for row in cat_rows]

    # Unit Facets
    unit_stmt = select(
        func.coalesce(Product.unit_of_measure, 'հատ').label('val'),
        func.count(Product.id).label('cnt')
    ).group_by(func.coalesce(Product.unit_of_measure, 'հատ')).order_by(func.count(Product.id).desc())
    unit_rows = await db.execute(unit_stmt)
    units = [FacetCountItem(
        value=row.val, label=f"{row.val} ({row.cnt})", count=row.cnt) for row in unit_rows]

    # Price Boundaries
    bounds_stmt = select(
        func.coalesce(func.min(Product.retail_price), 0.0).label('min_p'),
        func.coalesce(func.max(Product.retail_price), 0.0).label('max_p')
    )
    bounds_row = (await db.execute(bounds_stmt)).first()
    min_price = float(bounds_row.min_p) if bounds_row else 0.0
    max_price = float(bounds_row.max_p) if bounds_row else 0.0

    return categories, units, min_price, max_price


@router.get("", response_model=PaginatedProductsResponse)
async def list_products(
    limit: int = Query(36, ge=1, le=2000, description="Items per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    page: Optional[int] = Query(
        None, ge=1, description="1-indexed page override"),
    search: Optional[str] = Query(
        None, alias="q", description="pg_trgm supported text search"),
    category: Optional[str] = Query(
        None, description="Comma-separated category filters"),
    unit_of_measure: Optional[str] = Query(
        None, description="Comma-separated unit filters"),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    is_active: Optional[bool] = Query(
        True, description="Filter active products"),
    in_stock_only: bool = Query(
        False, description="Filter products with stock > 0"),
    sort_by: str = Query(
        "sku", description="Sort by: sku, name, retail_price, wholesale_price"),
    sort_order: str = Query("asc", description="Sort direction: asc or desc"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    SQL-level pagination and filtering using dynamic SQLAlchemy 2.0 statements.
    """
    effective_limit = limit
    effective_offset = (page - 1) * effective_limit if page else offset
    effective_page = page if page else (
        effective_offset // effective_limit) + 1

    # Initialize Base Statement
    stmt = select(Product)

    # 1. Apply Filters
    if is_active is not None:
        stmt = stmt.where(Product.is_active == is_active)

    if in_stock_only:
        stmt = stmt.where(Product.is_active == True,
                          Product.stock_quantity > 0)

    if search:
        search_term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Product.name.icontains(search_term),
                Product.sku.icontains(search_term),
                Product.barcode.icontains(search_term)
            )
        )

    if category:
        categories = [c.strip().lower()
                      for c in category.split(",") if c.strip()]
        stmt = stmt.where(func.lower(func.coalesce(
            Product.category, 'Uncategorized')).in_(categories))

    if unit_of_measure:
        units = [u.strip().lower()
                 for u in unit_of_measure.split(",") if u.strip()]
        stmt = stmt.where(func.lower(func.coalesce(
            Product.unit_of_measure, 'հատ')).in_(units))

    if min_price is not None:
        stmt = stmt.where(Product.retail_price >= min_price)

    if max_price is not None:
        stmt = stmt.where(Product.retail_price <= max_price)

    # 2. Total Count Execution (Before pagination)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_items = (await db.execute(count_stmt)).scalar_one()

    # 3. Apply Sorting & Pagination
    sort_col = getattr(Product, sort_by.lower(), Product.sku)
    if sort_order.lower() == "desc":
        stmt = stmt.order_by(sort_col.desc())
    else:
        stmt = stmt.order_by(sort_col.asc())

    stmt = stmt.limit(effective_limit).offset(effective_offset)

    # [Applying Skill: Prevent N+1 Problem]
    # Use selectinload if we need to eagerly load related variants or images in the list view.
    # stmt = stmt.options(selectinload(Product.variants))

    products_result: Sequence[Product] = (await db.execute(stmt)).scalars().all()

    # 4. Fetch Global Facets
    category_facets, unit_facets, min_p, max_p = await get_catalog_facets(db)

    # 5. Pydantic Serialization
    has_more = (effective_offset + len(products_result)) < total_items
    total_pages = math.ceil(
        total_items / effective_limit) if total_items > 0 else 1

    return PaginatedProductsResponse(
        items=[ProductListItem.model_validate(p) for p in products_result],
        total=total_items,
        limit=effective_limit,
        offset=effective_offset,
        page=effective_page,
        page_size=effective_limit,
        total_pages=total_pages,
        has_more=has_more,
        has_next=has_more,
        has_prev=effective_offset > 0,
        categories=category_facets,
        units=unit_facets,
        min_retail_price=min_p,
        max_retail_price=max_p,
    )


@router.get("/{product_id}", response_model=ProductDetail)
async def get_product_detail(
    product_id: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    [Applying Skill: Pydantic V2 & Async SQLAlchemy]
    Fetches a single product by UUID or SKU. Utilizes native Postgres type casting
    for UUIDs to hit the primary key B-Tree index securely.
    """
    target = product_id.strip()

    try:
        parsed_uuid = UUID(target)
        stmt = select(Product).where(Product.id == parsed_uuid)
    except ValueError:
        stmt = select(Product).where(func.lower(Product.sku) == target.lower())

    # Ensure related variants and images are eagerly loaded to prevent N+1 during Pydantic serialization
    stmt = stmt.options(
        selectinload(Product.variants),
        selectinload(Product.inventory_records)
    )

    product = (await db.execute(stmt)).scalar_one_or_none()

    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product '{target}' not found in the catalog."
        )

    return ProductDetail.model_validate(product)
