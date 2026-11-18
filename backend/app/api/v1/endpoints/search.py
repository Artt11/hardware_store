# import re
# from typing import Dict, List, Optional
# from uuid import UUID

# from fastapi import APIRouter, Query

# from app.api.v1.endpoints.products import (
#     get_all_catalog_records,
#     get_placeholder_image,
#     query_catalog_from_postgres,
# )
# from app.schemas.search import (
#     AutocompleteProductHit,
#     AutocompleteResponse,
#     FacetBucket,
#     FacetedSearchResponse,
# )

# router = APIRouter(prefix="/search", tags=["Search"])


# def highlight_match(text: str, query: str) -> str:
#     """Wrap matching substring with <mark> tag for the minimalist header autocomplete."""
#     if not query:
#         return text
#     pattern = re.compile(re.escape(query), re.IGNORECASE)
#     return pattern.sub(
#         lambda m: f"<mark class='bg-neutral-200 font-semibold'>{m.group(0)}</mark>",
#         text,
#     )


# def record_to_search_hit(p: dict, query: str = "") -> AutocompleteProductHit:
#     sku = str(p.get("sku", ""))
#     name = str(p.get("name", ""))
#     raw_image = p.get("image_url")
#     resolved_image = raw_image if raw_image else get_placeholder_image(sku)
#     retail_price = float(p.get("retail_price", p.get("base_price", 0.0)))
#     is_active = bool(p.get("is_active", True))
#     stock_qty = int(p.get("stock_quantity", 25 if is_active else 0))

#     return AutocompleteProductHit(
#         id=UUID(str(p["id"])),
#         name=name,
#         slug=str(p.get("slug") or f"product-{sku.lower()}"),
#         sku=sku,
#         brand=str(p.get("unit_of_measure") or "հատ"),
#         category=str(p.get("category") or "Uncategorized"),
#         price=retail_price,
#         retail_price=retail_price,
#         unit_of_measure=str(p.get("unit_of_measure") or "հատ"),
#         compare_at_price=p.get("compare_at_price"),
#         currency=str(p.get("currency") or "AMD"),
#         thumbnail_url=resolved_image,
#         thumbnailUrl=resolved_image,
#         in_stock=is_active and stock_qty > 0,
#         inStock=is_active and stock_qty > 0,
#         stock_quantity=stock_qty,
#         stockQuantity=stock_qty,
#         highlight=highlight_match(name, query) if query else name,
#     )


# @router.get("/autocomplete", response_model=AutocompleteResponse)
# async def search_autocomplete(
#     q: str = Query(..., min_length=1, description="Instant query string for autocomplete"),
#     limit: int = Query(6, ge=1, le=20, description="Max visual hits to return"),
# ):
#     """
#     High-performance instant visual autocomplete synced with the migrated PostgreSQL
#     & Elasticsearch product catalog ("Products Սուրո.xlsx").
#     Matches Armenian product names, SKU codes (Կոդ), barcodes (Գծիկավոր կոդ), and categories.
#     """
#     clean_query = q.strip().lower()
#     pg_res = await query_catalog_from_postgres(
#         limit=50,
#         offset=0,
#         query_term=q.strip(),
#         categories_filter=[],
#         units_filter=[],
#         min_price=None,
#         max_price=None,
#         is_active=True,
#         in_stock_only=False,
#         sort_by="sku",
#         sort_order="asc",
#     )
#     all_records = pg_res[0] if pg_res is not None else await get_all_catalog_records()

#     # Score matches: exact/prefix SKU or name prefix gets highest priority
#     scored_matches = []
#     for p in all_records:
#         if not bool(p.get("is_active", True)):
#             continue
#         name_lower = str(p.get("name", "")).lower()
#         sku_lower = str(p.get("sku", "")).lower()
#         barcode_lower = str(p.get("barcode") or "").lower()
#         category_lower = str(p.get("category") or "").lower()

#         score = 0
#         if sku_lower == clean_query or barcode_lower == clean_query:
#             score = 100
#         elif sku_lower.startswith(clean_query):
#             score = 85
#         elif name_lower.startswith(clean_query):
#             score = 75
#         elif clean_query in name_lower:
#             score = 50
#         elif clean_query in barcode_lower or clean_query in category_lower:
#             score = 30

#         if score > 0:
#             scored_matches.append((score, p))

#     scored_matches.sort(key=lambda item: (-item[0], str(item[1].get("sku", ""))))
#     top_records = [item[1] for item in scored_matches[:limit]]

#     hits = [record_to_search_hit(p, q.strip()) for p in top_records]

#     # Build dynamic suggestions from top matched product names
#     suggestions: List[str] = []
#     for rec in top_records[:3]:
#         words = str(rec.get("name", "")).split()
#         if words:
#             candidate = " ".join(words[:2])
#             if candidate not in suggestions:
#                 suggestions.append(candidate)

#     return AutocompleteResponse(
#         query=q,
#         total_matches=len(scored_matches),
#         suggestions=suggestions,
#         products=hits,
#     )


# @router.get("", response_model=FacetedSearchResponse)
# async def faceted_search(
#     q: Optional[str] = Query(None, description="Full search term"),
#     brand: Optional[List[str]] = Query(None, description="Unit/Brand facets"),
#     category: Optional[List[str]] = Query(None, description="Category facets"),
#     min_price: Optional[float] = Query(None, ge=0),
#     max_price: Optional[float] = Query(None, ge=0),
#     voltage: Optional[List[str]] = Query(None, description="Unit of measure facets"),
#     in_stock_only: bool = Query(False),
#     page: int = Query(1, ge=1),
#     page_size: int = Query(24, ge=1, le=100),
# ):
#     """
#     Dynamic Faceted Search endpoint backed by the imported catalog.
#     """
#     all_records = await get_all_catalog_records()
#     clean_q = (q or "").strip().lower()

#     filtered = [p for p in all_records if bool(p.get("is_active", True))]
#     if clean_q:
#         filtered = [
#             p
#             for p in filtered
#             if clean_q in str(p.get("name", "")).lower()
#             or clean_q in str(p.get("sku", "")).lower()
#             or clean_q in str(p.get("barcode") or "").lower()
#         ]
#     if category:
#         cat_set = {c.lower() for c in category}
#         filtered = [p for p in filtered if str(p.get("category") or "Uncategorized").lower() in cat_set]
#     if min_price is not None:
#         filtered = [p for p in filtered if float(p.get("retail_price", 0.0)) >= min_price]
#     if max_price is not None:
#         filtered = [p for p in filtered if float(p.get("retail_price", 0.0)) <= max_price]
#     if in_stock_only:
#         filtered = [p for p in filtered if int(p.get("stock_quantity", 25)) > 0]

#     cat_counts: Dict[str, int] = {}
#     unit_counts: Dict[str, int] = {}
#     for p in filtered:
#         c = str(p.get("category") or "Uncategorized")
#         u = str(p.get("unit_of_measure") or "հատ")
#         cat_counts[c] = cat_counts.get(c, 0) + 1
#         unit_counts[u] = unit_counts.get(u, 0) + 1

#     start = (page - 1) * page_size
#     page_slice = filtered[start : start + page_size]

#     return FacetedSearchResponse(
#         query=q,
#         total=len(filtered),
#         page=page,
#         page_size=page_size,
#         products=[record_to_search_hit(p, clean_q) for p in page_slice],
#         facets={
#             "category": [
#                 FacetBucket(value=k, count=v, label=f"{k} ({v})")
#                 for k, v in sorted(cat_counts.items(), key=lambda x: -x[1])
#             ],
#             "unit_of_measure": [
#                 FacetBucket(value=k, count=v, label=f"{k} ({v})")
#                 for k, v in sorted(unit_counts.items(), key=lambda x: -x[1])
#             ],
#         },
#     )
import html
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.models.product import Product
from app.schemas.search import (
    AutocompleteProductHit,
    AutocompleteResponse,
    FacetBucket,
    FacetedSearchResponse,
)

router = APIRouter(prefix="/search", tags=["Search"])


def highlight_match(text_val: str, query: str) -> str:
    """Wrap matches in <mark> for autocomplete. Output is rendered as HTML by the
    frontend, so every non-markup character is HTML-escaped (audit R3)."""
    if not query:
        return html.escape(text_val)
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    parts: list[str] = []
    last = 0
    for m in pattern.finditer(text_val):
        parts.append(html.escape(text_val[last:m.start()]))
        parts.append(f"<mark class='bg-neutral-200 font-semibold'>{html.escape(m.group(0))}</mark>")
        last = m.end()
    parts.append(html.escape(text_val[last:]))
    return "".join(parts)


@router.get("/autocomplete", response_model=AutocompleteResponse)
async def search_autocomplete(
    q: str = Query(..., min_length=1,
                   description="Instant query string for autocomplete"),
    limit: int = Query(
        6, ge=1, le=20, description="Max visual hits to return"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    [Applying Skill: Postgres Performance & `pg_trgm`]
    High-performance instant visual autocomplete pushed directly to PostgreSQL.
    Leverages `pg_trgm` and GIN indexes via SQLAlchemy for fuzzy/exact matching.
    """
    clean_query = q.strip()

    # Build search condition hitting the GIN/pg_trgm indexes
    search_cond = or_(
        Product.sku.ilike(f"{clean_query}%"),
        Product.barcode == clean_query,
        Product.name.ilike(f"%{clean_query}%")
    )

    stmt = (
        select(Product)
        .where(Product.is_active == True)
        .where(search_cond)
        # Custom DB sorting: Exact SKU/Barcode matches first, then name matches
        .order_by(
            (Product.sku.ilike(f"{clean_query}%")).desc(),
            (Product.barcode == clean_query).desc(),
            Product.name.asc()
        )
        .limit(limit)
    )

    products_result = (await db.execute(stmt)).scalars().all()

    hits = []
    suggestions = []
    for p in products_result:
        # Populate suggestions based on the first two words of top matching names
        words = p.name.split()
        if words:
            candidate = " ".join(words[:2])
            if candidate not in suggestions and len(suggestions) < 3:
                suggestions.append(candidate)

        # [Applying Skill: Pydantic V2]
        hit_data = {
            "id": p.id,
            "name": p.name,
            "slug": p.slug or f"product-{p.sku.lower()}",
            "sku": p.sku,
            "brand": p.unit_of_measure or "հատ",
            "category": p.category or "Uncategorized",
            "price": float(p.retail_price or p.base_price or 0.0),
            "retail_price": float(p.retail_price or p.base_price or 0.0),
            "unit_of_measure": p.unit_of_measure or "հատ",
            "compare_at_price": float(p.compare_at_price) if p.compare_at_price else None,
            "currency": p.currency or "AMD",
            "thumbnail_url": p.image_url,
            "thumbnailUrl": p.image_url,
            "in_stock": p.stock_quantity > 0,
            "inStock": p.stock_quantity > 0,
            "stock_quantity": p.stock_quantity,
            "stockQuantity": p.stock_quantity,
            "highlight": highlight_match(p.name, clean_query)
        }
        hits.append(AutocompleteProductHit.model_validate(hit_data))

    return AutocompleteResponse(
        query=clean_query,
        total_matches=len(hits),
        suggestions=suggestions,
        products=hits,
    )


@router.get("", response_model=FacetedSearchResponse)
async def faceted_search(
    q: Optional[str] = Query(None, description="Full search term"),
    category: Optional[List[str]] = Query(None, description="Category facets"),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    in_stock_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
):
    """
    [Applying Skill: Async SQLAlchemy 2.0]
    Dynamic Faceted Search endpoint filtering pushed entirely to PostgreSQL.
    """
    clean_q = (q or "").strip()
    stmt = select(Product).where(Product.is_active == True)

    if clean_q:
        stmt = stmt.where(
            or_(
                Product.name.ilike(f"%{clean_q}%"),
                Product.sku.ilike(f"%{clean_q}%"),
                Product.barcode == clean_q
            )
        )

    if category:
        cat_list = [c.lower() for c in category]
        stmt = stmt.where(func.lower(func.coalesce(
            Product.category, 'Uncategorized')).in_(cat_list))

    if min_price is not None:
        stmt = stmt.where(Product.retail_price >= min_price)

    if max_price is not None:
        stmt = stmt.where(Product.retail_price <= max_price)

    if in_stock_only:
        stmt = stmt.where(Product.stock_quantity > 0)

    # 1. Execute total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_items = (await db.execute(count_stmt)).scalar_one()

    # 2. Generate facets dynamically using DB grouping
    cat_facet_stmt = select(
        func.coalesce(Product.category, 'Uncategorized').label('val'),
        func.count(Product.id).label('cnt')
    ).select_from(stmt.subquery()).group_by('val').order_by(func.count(Product.id).desc())

    unit_facet_stmt = select(
        func.coalesce(Product.unit_of_measure, 'հատ').label('val'),
        func.count(Product.id).label('cnt')
    ).select_from(stmt.subquery()).group_by('val').order_by(func.count(Product.id).desc())

    cat_rows = await db.execute(cat_facet_stmt)
    unit_rows = await db.execute(unit_facet_stmt)

    # 3. Pagination
    offset = (page - 1) * page_size
    stmt = stmt.order_by(Product.sku.asc()).limit(page_size).offset(offset)
    products_result = (await db.execute(stmt)).scalars().all()

    hits = []
    for p in products_result:
        hit_data = {
            "id": p.id,
            "name": p.name,
            "slug": p.slug or f"product-{p.sku.lower()}",
            "sku": p.sku,
            "brand": p.unit_of_measure or "հատ",
            "category": p.category or "Uncategorized",
            "price": float(p.retail_price or p.base_price or 0.0),
            "retail_price": float(p.retail_price or p.base_price or 0.0),
            "unit_of_measure": p.unit_of_measure or "հատ",
            "compare_at_price": float(p.compare_at_price) if p.compare_at_price else None,
            "currency": p.currency or "AMD",
            "thumbnail_url": p.image_url,
            "thumbnailUrl": p.image_url,
            "in_stock": p.stock_quantity > 0,
            "inStock": p.stock_quantity > 0,
            "stock_quantity": p.stock_quantity,
            "stockQuantity": p.stock_quantity,
            "highlight": highlight_match(p.name, clean_q) if clean_q else p.name
        }
        hits.append(AutocompleteProductHit.model_validate(hit_data))

    return FacetedSearchResponse(
        query=q,
        total=total_items,
        page=page,
        page_size=page_size,
        products=hits,
        facets={
            "category": [FacetBucket(value=r.val, count=r.cnt, label=f"{r.val} ({r.cnt})") for r in cat_rows],
            "unit_of_measure": [FacetBucket(value=r.val, count=r.cnt, label=f"{r.val} ({r.cnt})") for r in unit_rows]
        }
    )
