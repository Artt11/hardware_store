"""Cart, checkout and order API contract. Money is Decimal (serialized as a string)."""

import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.cart import MAX_LINE_QUANTITY

PHONE_REGEX = re.compile(r"^\+?[0-9 ()-]{6,20}$")


class CartItemView(BaseModel):
    product_id: uuid.UUID
    sku: str
    slug: str
    name: str
    unit_of_measure: str
    image_url: str | None
    unit_price: Decimal
    pricing_tier: Literal["retail", "wholesale"]
    quantity: int
    line_total: Decimal
    available_quantity: int
    is_available: bool = Field(description="Product active and quantity in stock")


class CartView(BaseModel):
    items: list[CartItemView]
    item_count: int
    subtotal: Decimal
    shipping_estimate: Decimal = Field(description="Express delivery cost for the current subtotal")
    free_shipping_threshold: Decimal
    amount_to_free_shipping: Decimal
    currency: str = "AMD"


class SetQuantityRequest(BaseModel):
    quantity: int = Field(ge=1, le=MAX_LINE_QUANTITY)


class Customer(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=200)
    phone: str = Field(max_length=30)
    email: EmailStr | None = Field(
        default=None, description="Required for guests; defaults to the account email"
    )

    @field_validator("phone")
    @classmethod
    def _valid_phone(cls, value: str) -> str:
        if not PHONE_REGEX.match(value):
            raise ValueError("Invalid phone number")
        return value


class ShippingAddress(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    city: str = Field(min_length=2, max_length=100)
    address: str = Field(min_length=3, max_length=300)
    postal_code: str | None = Field(default=None, max_length=10)


class CheckoutRequest(BaseModel):
    delivery_method: Literal["express", "pickup"]
    payment_method: Literal["card", "cash_on_delivery", "b2b_invoice"]
    customer: Customer
    shipping_address: ShippingAddress | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _address_for_delivery(self) -> Self:
        if self.delivery_method == "express" and self.shipping_address is None:
            raise ValueError("shipping_address is required for express delivery")
        return self


class OrderItemView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: uuid.UUID
    sku_snapshot: str
    name_snapshot: str
    unit_of_measure: str
    pricing_tier: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class OrderSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_number: str
    status: str
    order_type: str
    payment_method: str
    payment_status: str
    delivery_method: str
    subtotal: Decimal
    shipping_amount: Decimal
    total_amount: Decimal
    currency: str
    created_at: datetime


class OrderDetail(OrderSummary):
    customer_name: str
    customer_phone: str
    customer_email: str
    company_name: str | None
    tax_id: str | None
    payment_due_at: datetime | None
    shipping_address: dict[str, str | None] | None
    notes: str | None
    items: list[OrderItemView]


class OrderPage(BaseModel):
    items: list[OrderSummary]
    page: int
    page_size: int
    total_items: int


class StockShortage(BaseModel):
    product_id: uuid.UUID
    sku: str
    name: str
    requested: int
    available: int
