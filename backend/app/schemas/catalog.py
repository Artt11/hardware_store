"""Catalog API contract. Money is Decimal (serialized as a string, e.g. "4500.00")."""

import uuid
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SortOption = Literal["relevance", "price_asc", "price_desc", "name", "newest", "sku"]
MAX_PAGE_SIZE = 100


class CategoryRef(BaseModel):
    slug: str
    name: str


class ProductSummary(BaseModel):
    id: uuid.UUID
    sku: str
    slug: str
    name: str
    unit_of_measure: str
    category: CategoryRef
    price: Decimal = Field(description="Price for the current viewer (wholesale for B2B when available)")
    pricing_tier: Literal["retail", "wholesale"]
    retail_price: Decimal
    compare_at_price: Decimal | None
    currency: str
    image_url: str | None
    in_stock: bool
    available_quantity: int


class ProductDetail(ProductSummary):
    description: str | None
    barcode: str | None
    vat_applicable: bool
    specifications: dict[str, Any]


class Pagination(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CategoryFacet(BaseModel):
    slug: str
    name: str
    count: int


class ValueFacet(BaseModel):
    value: str
    count: int


class PriceRange(BaseModel):
    min: Decimal | None
    max: Decimal | None


class Facets(BaseModel):
    categories: list[CategoryFacet]
    units: list[ValueFacet]
    price_range: PriceRange


class ProductPage(BaseModel):
    items: list[ProductSummary]
    pagination: Pagination
    facets: Facets


class CategoryWithCount(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    product_count: int


class AutocompleteHit(BaseModel):
    id: uuid.UUID
    sku: str
    slug: str
    name: str
    price: Decimal
    unit_of_measure: str
    image_url: str | None
    in_stock: bool
    highlight: str = Field(description="HTML-escaped name with <mark> around matches")


class AutocompleteResponse(BaseModel):
    query: str
    products: list[AutocompleteHit]
