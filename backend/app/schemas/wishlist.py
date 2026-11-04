from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID
from datetime import datetime

class WishlistItemResponse(BaseModel):
    product_id: UUID
    name: str
    slug: str
    sku: str
    brand: str
    price: float
    compare_at_price: Optional[float] = None
    currency: str = "USD"
    thumbnail_url: Optional[str] = None
    in_stock: bool
    added_at: datetime

class WishlistResponse(BaseModel):
    id: UUID
    user_id: UUID
    items_count: int
    items: List[WishlistItemResponse]

class WishlistAddRequest(BaseModel):
    product_id: UUID
    notes: Optional[str] = None

class WishlistSyncRequest(BaseModel):
    # Used when guest logs in, sending local storage product IDs to merge
    product_ids: List[UUID] = Field(default_factory=list)

class WishlistSyncResponse(BaseModel):
    success: bool
    synced_count: int
    items: List[WishlistItemResponse]
