from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID
# from datetime import datetime


class CartItemDetail(BaseModel):
    id: UUID
    product_id: UUID
    name: str
    slug: str
    sku: str
    thumbnail_url: Optional[str] = None
    unit_price: float
    quantity: int
    line_total: float
    stock_quantity: int
    in_stock: bool


class CartResponse(BaseModel):
    id: UUID
    session_token: Optional[str] = None
    user_id: Optional[UUID] = None
    items_count: int
    subtotal: float
    tax_total: float
    shipping_total: float
    grand_total: float
    items: List[CartItemDetail]


class AddToCartRequest(BaseModel):
    product_id: UUID
    quantity: int = Field(default=1, ge=1)


class UpdateCartItemRequest(BaseModel):
    quantity: int = Field(ge=0)
