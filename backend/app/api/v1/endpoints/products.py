"""Catalog endpoints (thin: query parsing here, logic in app.services.catalog)."""

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import DbSession, OptionalUser
from app.schemas.catalog import MAX_PAGE_SIZE, CategoryWithCount, Lang, ProductDetail, ProductPage, SortOption
from app.services import catalog
from app.services.catalog import CatalogQuery

router = APIRouter(tags=["Catalog"])


@router.get("/products", response_model=ProductPage)
async def list_products(
    db: DbSession,
    user: OptionalUser,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[list[str] | None, Query(max_length=20)] = None,
    unit: Annotated[list[str] | None, Query(max_length=20)] = None,
    min_price: Annotated[Decimal | None, Query(ge=0, max_digits=12, decimal_places=2)] = None,
    max_price: Annotated[Decimal | None, Query(ge=0, max_digits=12, decimal_places=2)] = None,
    in_stock: bool = False,
    sort: SortOption = "relevance",
    lang: Lang = "hy",
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 24,
) -> ProductPage:
    query = CatalogQuery(
        q=(q or "").strip() or None,
        categories=tuple(category or ()),
        units=tuple(unit or ()),
        min_price=min_price,
        max_price=max_price,
        in_stock=in_stock,
        sort=sort,
        page=page,
        page_size=page_size,
        is_b2b=bool(user and user.is_b2b),
        lang=lang,
    )
    return await catalog.list_products(db, query)


@router.get("/products/{slug}", response_model=ProductDetail)
async def get_product(slug: str, db: DbSession, user: OptionalUser) -> ProductDetail:
    product = await catalog.get_product(db, slug, is_b2b=bool(user and user.is_b2b))
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    return product


@router.get("/categories", response_model=list[CategoryWithCount])
async def list_categories(db: DbSession) -> list[CategoryWithCount]:
    return await catalog.list_categories(db)
