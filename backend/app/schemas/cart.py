from typing import List, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field


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


class CheckoutCartItemInput(BaseModel):
    product_id: UUID
    sku: str
    name: str
    unit_of_measure: str = "հատ"
    quantity: int = Field(..., ge=1)
    unit_price: Optional[float] = Field(default=None, ge=0)


class CheckoutOrderRequest(BaseModel):
    recipient_name: str = Field(..., min_length=2, max_length=150)
    phone: str = Field(..., min_length=6, max_length=30)
    city: str = Field(default="Երևան", max_length=100)
    shipping_address: str = Field(..., min_length=2, max_length=300)
    zip_code: str = Field(default="0001", max_length=20)
    delivery_method: Literal["express", "pickup"] = "express"
    payment_method: Literal["card", "cash", "b2b_invoice"] = "card"
    company_tax_id: Optional[str] = Field(default=None, max_length=50)
    items: List[CheckoutCartItemInput] = Field(default_factory=list)


class OrderConfirmationResponse(BaseModel):
    order_id: UUID
    order_number: str
    user_id: Optional[UUID] = None
    account_type: str
    subtotal: float
    shipping_total: float
    tax_total: float
    grand_total: float
    status: str
    created_at: str


class OrderHistoryItemResponse(BaseModel):
    id: UUID
    product_id: UUID
    sku: str
    name: str
    unit_of_measure: str
    pricing_tier: str
    quantity: int
    unit_price: float
    total_price: float


class OrderHistoryResponse(BaseModel):
    order_id: UUID
    order_number: str
    order_type: str
    status: str
    payment_method: str
    payment_status: str
    currency: str
    subtotal: float
    shipping_total: float
    tax_total: float
    grand_total: float
    items_count: int
    created_at: str
    items: List[OrderHistoryItemResponse] = Field(default_factory=list)
