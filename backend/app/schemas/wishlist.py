from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

MAX_WISHLIST_ITEMS = 200


class WishlistItemResponse(BaseModel):
    product_id: UUID
    sku: str
    slug: str
    name: str
    name_ru: str | None
    name_en: str | None
    unit_of_measure: str
    retail_price: Decimal
    currency: str
    image_url: str | None
    in_stock: bool
    added_at: datetime


class WishlistResponse(BaseModel):
    items_count: int
    items: list[WishlistItemResponse]


class WishlistAddRequest(BaseModel):
    product_id: UUID


class WishlistSyncRequest(BaseModel):
    """Guest wishlist from localStorage, merged into the account on login."""

    product_ids: list[UUID] = Field(default_factory=list, max_length=MAX_WISHLIST_ITEMS)
