"""Catalog queries: faceted listing, search, autocomplete, product detail.

All filtering, sorting and pagination run in PostgreSQL. A listing costs a fixed
number of statements (items, count, three facets) regardless of page size.

Search matches name/SKU substrings (ILIKE, user wildcards escaped), exact barcode,
and typo-tolerant word similarity (`q <% name`); all use the pg_trgm GIN indexes.
"""

import html
import math
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, case, desc, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Inventory, Product
from app.schemas.catalog import (
    AutocompleteHit,
    CategoryFacet,
    CategoryRef,
    CategoryWithCount,
    Facets,
    Lang,
    Pagination,
    PriceRange,
    ProductDetail,
    ProductPage,
    ProductSummary,
    SortOption,
    ValueFacet,
)

MARK_OPEN = "<mark class='bg-neutral-200 font-semibold'>"


@dataclass(frozen=True, slots=True)
class CatalogQuery:
    q: str | None = None
    categories: tuple[str, ...] = ()
    units: tuple[str, ...] = ()
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    in_stock: bool = False
    sort: SortOption = "relevance"
    page: int = 1
    page_size: int = 24
    is_b2b: bool = False
    lang: Lang = "hy"


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def effective_price(is_b2b: bool) -> ColumnElement[Decimal]:
    if is_b2b:
        return func.coalesce(Product.wholesale_price, Product.retail_price)
    return Product.retail_price  # type: ignore[return-value]


def stock_column() -> ColumnElement[int]:
    return func.coalesce(Inventory.quantity_on_hand, 0)


def display_name(lang: Lang) -> ColumnElement[str]:
    """Name column for a language, falling back to Armenian when untranslated."""
    if lang == "ru":
        return func.coalesce(Product.name_ru, Product.name)
    if lang == "en":
        return func.coalesce(Product.name_en, Product.name)
    return Product.name  # type: ignore[return-value]


def search_condition(q: str) -> ColumnElement[bool]:
    pattern = f"%{_escape_like(q)}%"
    return or_(
        Product.name.ilike(pattern, escape="\\"),
        Product.name_ru.ilike(pattern, escape="\\"),
        Product.name_en.ilike(pattern, escape="\\"),
        Product.sku.ilike(pattern, escape="\\"),
        Product.barcode == q,
        literal(q).op("<%")(Product.name),
    )


def _conditions(query: CatalogQuery, *, skip: str | None = None) -> list[ColumnElement[bool]]:
    """WHERE clauses; `skip` drops one facet's own filter so its counts stay useful."""
    conds: list[ColumnElement[bool]] = [Product.is_active.is_(True), Category.is_active.is_(True)]
    if query.q:
        conds.append(search_condition(query.q))
    if query.categories and skip != "category":
        conds.append(Category.slug.in_(query.categories))
    if query.units and skip != "unit":
        conds.append(Product.unit_of_measure.in_(query.units))
    price = effective_price(query.is_b2b)
    if skip != "price":
        if query.min_price is not None:
            conds.append(price >= query.min_price)
        if query.max_price is not None:
            conds.append(price <= query.max_price)
    if query.in_stock:
        conds.append(stock_column() > 0)
    return conds


def _base(*columns: Any) -> Select[Any]:
    return (
        select(*columns)
        .select_from(Product)
        .join(Category, Category.id == Product.category_id)
        .outerjoin(Inventory, Inventory.product_id == Product.id)
    )


def _order_by(query: CatalogQuery) -> list[Any]:
    price = effective_price(query.is_b2b)
    name = display_name(query.lang)
    if query.sort == "relevance" and query.q:
        q = query.q
        return [
            case(
                (or_(Product.sku == q, Product.barcode == q), 0),
                (name.ilike(f"{_escape_like(q)}%", escape="\\"), 1),
                else_=2,
            ),
            desc(func.word_similarity(q, Product.name)),
            name,
        ]
    options: dict[str, list[Any]] = {
        "price_asc": [price, name],
        "price_desc": [desc(price), name],
        "newest": [desc(Product.created_at)],
        "sku": [Product.sku],
    }
    return options.get(query.sort, [name])


def _summary(
    product: Product, category_slug: str, category_name: str, stock: int, is_b2b: bool
) -> ProductSummary:
    price, tier = product.price_for(is_b2b=is_b2b)
    return ProductSummary(
        id=product.id,
        sku=product.sku,
        slug=product.slug,
        name=product.name,
        name_ru=product.name_ru,
        name_en=product.name_en,
        unit_of_measure=product.unit_of_measure,
        category=CategoryRef(slug=category_slug, name=category_name),
        price=price,
        pricing_tier=tier,
        retail_price=product.retail_price,
        compare_at_price=product.compare_at_price,
        currency=product.currency,
        image_url=product.image_url,
        in_stock=stock > 0,
        available_quantity=stock,
    )


async def list_products(db: AsyncSession, query: CatalogQuery) -> ProductPage:
    where = and_(*_conditions(query))
    rows = (
        await db.execute(
            _base(Product, Category.slug, Category.name, stock_column())
            .where(where)
            .order_by(*_order_by(query), Product.id)
            .limit(query.page_size)
            .offset((query.page - 1) * query.page_size)
        )
    ).all()
    total = await db.scalar(_base(func.count(Product.id)).where(where)) or 0

    category_rows = (
        await db.execute(
            _base(Category.slug, Category.name, func.count(Product.id))
            .where(*_conditions(query, skip="category"))
            .group_by(Category.slug, Category.name, Category.display_order)
            .order_by(Category.display_order)
        )
    ).all()
    unit_rows = (
        await db.execute(
            _base(Product.unit_of_measure, func.count(Product.id))
            .where(*_conditions(query, skip="unit"))
            .group_by(Product.unit_of_measure)
            .order_by(desc(func.count(Product.id)), Product.unit_of_measure)
        )
    ).all()
    price = effective_price(query.is_b2b)
    low, high = (
        await db.execute(_base(func.min(price), func.max(price)).where(*_conditions(query, skip="price")))
    ).one()

    return ProductPage(
        items=[_summary(p, slug, name, stock, query.is_b2b) for p, slug, name, stock in rows],
        pagination=Pagination(
            page=query.page,
            page_size=query.page_size,
            total_items=total,
            total_pages=math.ceil(total / query.page_size) if total else 0,
        ),
        facets=Facets(
            categories=[CategoryFacet(slug=s, name=n, count=c) for s, n, c in category_rows],
            units=[ValueFacet(value=u, count=c) for u, c in unit_rows],
            price_range=PriceRange(min=low, max=high),
        ),
    )


async def get_product(db: AsyncSession, slug: str, *, is_b2b: bool) -> ProductDetail | None:
    row = (
        await db.execute(
            _base(Product, Category.slug, Category.name, stock_column()).where(
                Product.slug == slug, Product.is_active, Category.is_active
            )
        )
    ).first()
    if row is None:
        return None
    product, cat_slug, cat_name, stock = row
    summary = _summary(product, cat_slug, cat_name, stock, is_b2b)
    return ProductDetail(
        **summary.model_dump(),
        description=product.description,
        barcode=product.barcode,
        vat_applicable=product.vat_applicable,
        specifications=product.specifications,
    )


async def list_categories(db: AsyncSession) -> list[CategoryWithCount]:
    rows = (
        await db.execute(
            select(Category.slug, Category.name, func.count(Product.id).filter(Product.is_active))
            .outerjoin(Product, Product.category_id == Category.id)
            .where(Category.is_active)
            .group_by(Category.id)
            .order_by(Category.display_order)
        )
    ).all()
    return [CategoryWithCount(slug=s, name=n, product_count=c) for s, n, c in rows]


def _best_match_name(product: Product, q: str, lang: Lang) -> str:
    """The display name, unless only another language's name contains the query."""
    preferred = product.name_in(lang)
    if q.lower() in preferred.lower():
        return preferred
    for candidate in (product.name, product.name_ru, product.name_en):
        if candidate and q.lower() in candidate.lower():
            return candidate
    return preferred


def highlight(name: str, q: str) -> str:
    """HTML-escape the name and wrap case-insensitive matches of `q` in <mark>."""
    if not q:
        return html.escape(name)
    parts: list[str] = []
    last = 0
    for m in re.finditer(re.escape(q), name, re.IGNORECASE):
        parts.append(html.escape(name[last : m.start()]))
        parts.append(f"{MARK_OPEN}{html.escape(m.group(0))}</mark>")
        last = m.end()
    parts.append(html.escape(name[last:]))
    return "".join(parts)


async def autocomplete(
    db: AsyncSession, q: str, *, limit: int, is_b2b: bool, lang: Lang = "hy"
) -> list[AutocompleteHit]:
    query = CatalogQuery(q=q, sort="relevance", page_size=limit, is_b2b=is_b2b, lang=lang)
    rows = (
        await db.execute(
            _base(Product, stock_column())
            .where(*_conditions(query))
            .order_by(*_order_by(query), Product.id)
            .limit(limit)
        )
    ).all()
    hits = []
    for product, stock in rows:
        price, _tier = product.price_for(is_b2b=is_b2b)
        hits.append(
            AutocompleteHit(
                id=product.id,
                sku=product.sku,
                slug=product.slug,
                name=product.name,
                name_ru=product.name_ru,
                name_en=product.name_en,
                price=price,
                unit_of_measure=product.unit_of_measure,
                image_url=product.image_url,
                in_stock=stock > 0,
                highlight=highlight(_best_match_name(product, q, lang), q),
            )
        )
    return hits
