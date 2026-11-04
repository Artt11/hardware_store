import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid5

import asyncpg
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.product import (
    FacetCountItem,
    PaginatedProductsResponse,
    ProductDetail,
    ProductImageSchema,
    ProductListItem,
)

router = APIRouter(prefix="/products", tags=["Products"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent
SEEDED_JSON_PATH = BASE_DIR / "database" / "products_seeded.json"
EXCEL_FILE_PATH = BASE_DIR / "database" / "Products Սուրո.xlsx"
SKU_NAMESPACE = UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

# Curated hardware & construction tool thumbnails when Excel row has Նկար = False (null)
HARDWARE_PLACEHOLDER_IMAGES = [
    "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=800&q=80",
]

_CACHED_SEEDED_PRODUCTS: Optional[List[Dict[str, Any]]] = None


def get_placeholder_image(sku: str) -> str:
    idx = sum(ord(c) for c in sku) % len(HARDWARE_PLACEHOLDER_IMAGES)
    return HARDWARE_PLACEHOLDER_IMAGES[idx]


def load_fallback_catalog() -> List[Dict[str, Any]]:
    """
    Load the 1,391 migrated Excel products from `products_seeded.json`
    (or parse directly from `Products Սուրո.xlsx` if needed).
    """
    global _CACHED_SEEDED_PRODUCTS
    if _CACHED_SEEDED_PRODUCTS is not None:
        return _CACHED_SEEDED_PRODUCTS

    if SEEDED_JSON_PATH.exists():
        try:
            _CACHED_SEEDED_PRODUCTS = json.loads(SEEDED_JSON_PATH.read_text(encoding="utf-8"))
            return _CACHED_SEEDED_PRODUCTS
        except Exception:
            pass

    # Direct Excel fallback if JSON snapshot hasn't been generated yet
    if EXCEL_FILE_PATH.exists():
        from database.migrate_excel import parse_and_clean_excel  # type: ignore

        raw = parse_and_clean_excel(EXCEL_FILE_PATH)
        serialized = []
        for p in raw:
            item = dict(p)
            item["retail_price"] = float(p["retail_price"])
            item["wholesale_price"] = float(p["wholesale_price"])
            item["base_price"] = float(p["base_price"])
            item["discount_percent"] = float(p["discount_percent"])
            item["compare_at_price"] = float(p["compare_at_price"]) if p["compare_at_price"] is not None else None
            serialized.append(item)
        _CACHED_SEEDED_PRODUCTS = serialized
        return _CACHED_SEEDED_PRODUCTS

    return []


async def fetch_catalog_from_postgres() -> Optional[List[Dict[str, Any]]]:
    """
    Query PostgreSQL `products` table for all products imported from "Products Սուրո.xlsx".
    Returns None if PostgreSQL connection is unavailable in the current environment.
    """
    candidate_urls = [
        os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://"),
        "postgresql://admin@localhost:5432/hardware_store",
        "postgresql://postgres:postgres@localhost:5432/hardware_store",
    ]
    conn: Optional[asyncpg.Connection] = None
    for url in candidate_urls:
        if not url:
            continue
        try:
            conn = await asyncpg.connect(url, timeout=1.5)
            break
        except Exception:
            continue

    if conn is None:
        return None

    try:
        rows = await conn.fetch(
            """
            SELECT
                id,
                sku,
                name,
                slug,
                unit_of_measure,
                category,
                retail_price,
                wholesale_price,
                barcode,
                vat_applicable,
                discount_percent,
                description,
                image_url,
                is_active,
                base_price,
                compare_at_price,
                currency,
                stock_quantity,
                specifications,
                rating_average,
                rating_count,
                created_at,
                updated_at
            FROM products
            ORDER BY sku ASC;
            """
        )
        results: List[Dict[str, Any]] = []
        for r in rows:
            specs = r["specifications"]
            if isinstance(specs, str):
                try:
                    specs = json.loads(specs)
                except Exception:
                    specs = {}
            elif specs is None:
                specs = {}

            retail = float(r["retail_price"] if r["retail_price"] is not None else (r["base_price"] or 0.0))
            wholesale = float(r["wholesale_price"] or 0.0)
            discount = float(r["discount_percent"] or 0.0)
            results.append(
                {
                    "id": str(r["id"]),
                    "sku": r["sku"],
                    "name": r["name"],
                    "slug": r["slug"] or f"product-{r['sku'].lower()}",
                    "unit_of_measure": r["unit_of_measure"] or "հատ",
                    "category": r["category"] or "Uncategorized",
                    "retail_price": retail,
                    "wholesale_price": wholesale,
                    "barcode": r["barcode"],
                    "vat_applicable": bool(r["vat_applicable"]) if r["vat_applicable"] is not None else True,
                    "discount_percent": discount,
                    "description": r["description"],
                    "image_url": r["image_url"],
                    "is_active": bool(r["is_active"]) if r["is_active"] is not None else True,
                    "base_price": retail,
                    "compare_at_price": float(r["compare_at_price"]) if r["compare_at_price"] is not None else None,
                    "currency": r["currency"] or "AMD",
                    "stock_quantity": int(r["stock_quantity"] if r["stock_quantity"] is not None else 25),
                    "specifications": dict(specs),
                    "rating_average": float(r["rating_average"] or 4.8),
                    "rating_count": int(r["rating_count"] or 12),
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                }
            )
        return results
    except Exception:
        return None
    finally:
        await conn.close()


async def get_all_catalog_records() -> List[Dict[str, Any]]:
    """Return products from PostgreSQL primary store, falling back to seeded snapshot if unreachable."""
    pg_records = await fetch_catalog_from_postgres()
    if pg_records and len(pg_records) > 0:
        return pg_records
    return load_fallback_catalog()


def record_to_list_item(p: Dict[str, Any]) -> ProductListItem:
    sku = str(p.get("sku", ""))
    raw_image = p.get("image_url")
    resolved_image = raw_image if raw_image else get_placeholder_image(sku)
    unit = str(p.get("unit_of_measure") or "հատ")
    category = str(p.get("category") or "Uncategorized")
    retail_price = float(p.get("retail_price", p.get("base_price", 0.0)))
    wholesale_price = float(p.get("wholesale_price", 0.0))
    barcode = p.get("barcode")
    vat_applicable = bool(p.get("vat_applicable", True))
    discount_percent = float(p.get("discount_percent", 0.0))
    is_active = bool(p.get("is_active", True))
    stock_qty = int(p.get("stock_quantity", 25 if is_active else 0))

    key_specs: Dict[str, str] = {"Չափման միավոր": unit}
    if barcode:
        key_specs["Գծիկավոր կոդ"] = str(barcode)
    if wholesale_price > 0:
        key_specs["Մեծածախ"] = f"{wholesale_price:,.0f} ֏"

    return ProductListItem(
        id=UUID(str(p["id"])),
        sku=sku,
        name=str(p["name"]),
        slug=str(p.get("slug") or f"product-{sku.lower()}"),
        unit_of_measure=unit,
        category=category,
        retail_price=retail_price,
        wholesale_price=wholesale_price,
        barcode=str(barcode) if barcode else None,
        vat_applicable=vat_applicable,
        discount_percent=discount_percent,
        description=p.get("description"),
        image_url=raw_image,
        is_active=is_active,
        brand_name="Սուրո",
        category_name=category,
        base_price=retail_price,
        compare_at_price=p.get("compare_at_price"),
        currency=str(p.get("currency") or "AMD"),
        in_stock=is_active and stock_qty > 0,
        stock_quantity=stock_qty,
        rating_average=float(p.get("rating_average", 4.8)),
        rating_count=int(p.get("rating_count", 12)),
        primary_image_url=resolved_image,
        thumbnail_url=resolved_image,
        key_specs=key_specs,
    )


def record_to_detail(p: Dict[str, Any]) -> ProductDetail:
    sku = str(p.get("sku", ""))
    raw_image = p.get("image_url")
    resolved_image = raw_image if raw_image else get_placeholder_image(sku)
    unit = str(p.get("unit_of_measure") or "հատ")
    category = str(p.get("category") or "Uncategorized")
    retail_price = float(p.get("retail_price", p.get("base_price", 0.0)))
    wholesale_price = float(p.get("wholesale_price", 0.0))
    barcode = p.get("barcode")
    vat_applicable = bool(p.get("vat_applicable", True))
    discount_percent = float(p.get("discount_percent", 0.0))
    is_active = bool(p.get("is_active", True))
    stock_qty = int(p.get("stock_quantity", 25 if is_active else 0))

    specs = dict(p.get("specifications") or {})
    specs["unit_of_measure"] = unit
    if barcode:
        specs["barcode"] = str(barcode)
    if wholesale_price > 0:
        specs["wholesale_price"] = f"{wholesale_price:,.0f} ֏"
    specs["vat_applicable"] = "Այո (ԱԱՀ)" if vat_applicable else "Ոչ"

    now = datetime.now(timezone.utc)
    return ProductDetail(
        id=UUID(str(p["id"])),
        sku=sku,
        name=str(p["name"]),
        slug=str(p.get("slug") or f"product-{sku.lower()}"),
        unit_of_measure=unit,
        category=category,
        retail_price=retail_price,
        wholesale_price=wholesale_price,
        barcode=str(barcode) if barcode else None,
        vat_applicable=vat_applicable,
        discount_percent=discount_percent,
        description=p.get("description") or str(p["name"]),
        short_description=p.get("description") or f"Կոդ: {sku} • Չափման միավոր: {unit}",
        image_url=raw_image,
        is_active=is_active,
        brand_name="Սուրո",
        category_name=category,
        base_price=retail_price,
        compare_at_price=p.get("compare_at_price"),
        currency=str(p.get("currency") or "AMD"),
        stock_quantity=stock_qty,
        is_published=is_active,
        specifications=specs,
        rating_average=float(p.get("rating_average", 4.8)),
        rating_count=int(p.get("rating_count", 12)),
        images=[
            ProductImageSchema(
                id=uuid5(SKU_NAMESPACE, f"img-{sku}"),
                image_url=resolved_image,
                thumbnail_url=resolved_image,
                alt_text=str(p["name"]),
                is_primary=True,
                display_order=0,
            )
        ],
        created_at=p.get("created_at") if isinstance(p.get("created_at"), datetime) else now,
        updated_at=p.get("updated_at") if isinstance(p.get("updated_at"), datetime) else now,
    )


@router.get("", response_model=PaginatedProductsResponse)
async def list_products(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(24, ge=1, le=2000, description="Number of products per page"),
    search: Optional[str] = Query(None, alias="q", description="Search by name, SKU, or barcode"),
    q: Optional[str] = Query(None, description="Search query string"),
    category: Optional[str] = Query(None, description="Filter by category (Խումբ)"),
    unit_of_measure: Optional[str] = Query(None, description="Filter by unit of measure (Չափման միավոր, e.g. հատ, տուփ)"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    min_price: Optional[float] = Query(None, ge=0, description="Minimum retail_price"),
    max_price: Optional[float] = Query(None, ge=0, description="Maximum retail_price"),
    is_active: Optional[bool] = Query(True, description="Filter by active status (derived from Փակված)"),
    in_stock_only: bool = Query(False, description="Only return active in-stock items"),
    sort_by: str = Query("sku", description="Sort field: sku, name, retail_price, wholesale_price"),
    sort_order: str = Query("asc", description="Sort direction: asc or desc"),
):
    """
    List catalog products with pagination, multi-field filtering, facet counts, and sorting.
    """
    all_records = await get_all_catalog_records()

    # Compute global facet counts across active catalog
    cat_counts: Dict[str, int] = {}
    unit_counts: Dict[str, int] = {}
    prices: List[float] = []

    for rec in all_records:
        c = str(rec.get("category") or "Uncategorized")
        u = str(rec.get("unit_of_measure") or "հատ")
        cat_counts[c] = cat_counts.get(c, 0) + 1
        unit_counts[u] = unit_counts.get(u, 0) + 1
        prices.append(float(rec.get("retail_price", 0.0)))

    category_facets = [
        FacetCountItem(value=k, label=f"{k} ({v})", count=v)
        for k, v in sorted(cat_counts.items(), key=lambda x: (-x[1], x[0]))
    ]
    unit_facets = [
        FacetCountItem(value=k, label=f"{k} ({v})", count=v)
        for k, v in sorted(unit_counts.items(), key=lambda x: (-x[1], x[0]))
    ]

    # Filtering
    query_term = (search or q or "").strip().lower()
    filtered = all_records

    if is_active is not None:
        filtered = [p for p in filtered if bool(p.get("is_active", True)) == is_active]

    if in_stock_only:
        filtered = [p for p in filtered if bool(p.get("is_active", True)) and int(p.get("stock_quantity", 25)) > 0]

    if query_term:
        filtered = [
            p
            for p in filtered
            if query_term in str(p.get("name", "")).lower()
            or query_term in str(p.get("sku", "")).lower()
            or query_term in str(p.get("barcode") or "").lower()
            or query_term in str(p.get("category") or "").lower()
            or query_term in str(p.get("description") or "").lower()
        ]

    if category:
        categories_filter = {c.strip().lower() for c in category.split(",") if c.strip()}
        filtered = [p for p in filtered if str(p.get("category") or "Uncategorized").lower() in categories_filter]

    if unit_of_measure:
        units_filter = {u.strip().lower() for u in unit_of_measure.split(",") if u.strip()}
        filtered = [p for p in filtered if str(p.get("unit_of_measure") or "հատ").lower() in units_filter]

    if min_price is not None:
        filtered = [p for p in filtered if float(p.get("retail_price", 0.0)) >= min_price]

    if max_price is not None:
        filtered = [p for p in filtered if float(p.get("retail_price", 0.0)) <= max_price]

    # Sorting
    reverse = sort_order.strip().lower() == "desc"
    sort_field = sort_by.strip().lower()
    if sort_field in ("retail_price", "price", "base_price"):
        filtered.sort(key=lambda p: float(p.get("retail_price", 0.0)), reverse=reverse)
    elif sort_field == "wholesale_price":
        filtered.sort(key=lambda p: float(p.get("wholesale_price", 0.0)), reverse=reverse)
    elif sort_field == "name":
        filtered.sort(key=lambda p: str(p.get("name", "")).lower(), reverse=reverse)
    else:
        filtered.sort(key=lambda p: str(p.get("sku", "")), reverse=reverse)

    # Pagination
    total = len(filtered)
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_slice = filtered[start_idx:end_idx]

    items = [record_to_list_item(p) for p in page_slice]

    return PaginatedProductsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
        categories=category_facets,
        units=unit_facets,
        min_retail_price=min(prices) if prices else 0.0,
        max_retail_price=max(prices) if prices else 0.0,
    )


@router.get("/{product_id}", response_model=ProductDetail)
async def get_product_detail(product_id: str):
    """
    Get detailed product information by UUID or SKU.
    """
    all_records = await get_all_catalog_records()
    target = product_id.strip().lower()
    for p in all_records:
        if str(p.get("id", "")).lower() == target or str(p.get("sku", "")).lower() == target:
            return record_to_detail(p)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
