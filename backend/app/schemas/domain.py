"""
OOP Pydantic v2 Base Schemas & Domain Models (`backend/app/schemas/domain.py`).
Uses class inheritance from `BaseDomainSchema` and `TimestampedSchema` to eliminate
field duplication across Create, Update, and Read DTOs.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class BaseDomainSchema(BaseModel):
    """Root Pydantic BaseModel configured for SQLAlchemy ORM compatibility."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class TimestampedSchema(BaseDomainSchema):
    """Shared primary key and audit timestamps inherited by all read schemas."""

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# 1. User Schemas (B2C & B2B Inheritance Hierarchy)
# ---------------------------------------------------------------------------
class UserBase(BaseDomainSchema):
    email: EmailStr
    account_type: Literal["individual", "company"] = "individual"
    role: str = "customer"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    contact_person: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)


class UserRead(UserBase, TimestampedSchema):
    credit_limit: Decimal = Decimal("0.00")
    payment_terms_days: int = 0
    trade_discount_tier: Decimal = Decimal("0.00")
    is_active: bool = True
    is_verified: bool = False


# ---------------------------------------------------------------------------
# 2. Product Variant & Inventory Schemas
# ---------------------------------------------------------------------------
class ProductVariantBase(BaseDomainSchema):
    sku: str
    variant_name: str
    barcode: Optional[str] = None
    attributes: Dict[str, Any] = Field(default_factory=dict)
    retail_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    trade_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    compare_at_price: Optional[Decimal] = None
    min_trade_order_qty: int = Field(default=1, ge=1)
    unit_of_measure: str = "հատ"
    is_default: bool = False
    is_active: bool = True


class ProductVariantCreate(ProductVariantBase):
    product_id: uuid.UUID


class ProductVariantRead(ProductVariantBase, TimestampedSchema):
    product_id: uuid.UUID


class InventoryBase(BaseDomainSchema):
    warehouse_code: str = "EVN-MAIN"
    aisle_bin: Optional[str] = "A-01-01"
    quantity_on_hand: int = Field(default=0, ge=0)
    quantity_reserved: int = Field(default=0, ge=0)
    reorder_point: int = Field(default=5, ge=0)
    reorder_quantity: int = Field(default=50, ge=1)


class InventoryCreate(InventoryBase):
    product_id: uuid.UUID
    variant_id: Optional[uuid.UUID] = None


class InventoryRead(InventoryBase, TimestampedSchema):
    product_id: uuid.UUID
    variant_id: Optional[uuid.UUID] = None
    quantity_available: int = 0


# ---------------------------------------------------------------------------
# 3. Product Schemas
# ---------------------------------------------------------------------------
class ProductBase(BaseDomainSchema):
    sku: str
    name: str
    slug: Optional[str] = None
    unit_of_measure: str = "հատ"
    category: str = "Uncategorized"
    retail_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    wholesale_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    barcode: Optional[str] = None
    vat_applicable: bool = True
    discount_percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    is_active: bool = True
    stock_quantity: int = Field(default=25, ge=0)
    specifications: Dict[str, Any] = Field(default_factory=dict)


class ProductCreate(ProductBase):
    category_id: Optional[uuid.UUID] = None


class ProductRead(ProductBase, TimestampedSchema):
    category_id: Optional[uuid.UUID] = None
    variants: List[ProductVariantRead] = Field(default_factory=list)
    inventory_records: List[InventoryRead] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# 4. Order Schemas
# ---------------------------------------------------------------------------
class OrderItemBase(BaseDomainSchema):
    product_id: uuid.UUID
    variant_id: Optional[uuid.UUID] = None
    sku_snapshot: str
    name_snapshot: str
    unit_of_measure: str = "հատ"
    pricing_tier: Literal["retail", "wholesale"] = "retail"
    quantity: int = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    total_price: Decimal = Field(..., ge=0)


class OrderItemRead(OrderItemBase, TimestampedSchema):
    order_id: uuid.UUID


class OrderBase(BaseDomainSchema):
    order_number: str
    order_type: Literal["b2c", "b2b"] = "b2c"
    company_name: Optional[str] = None
    tax_id: Optional[str] = None
    purchase_order_number: Optional[str] = None
    status: str = "pending"
    currency: str = "AMD"
    subtotal: Decimal = Field(..., ge=0)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    shipping_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    total_amount: Decimal = Field(..., ge=0)
    shipping_address: Dict[str, Any] = Field(default_factory=dict)
    billing_address: Dict[str, Any] = Field(default_factory=dict)
    payment_method: str = "card"
    payment_status: str = "pending"
    notes: Optional[str] = None


class OrderCreate(OrderBase):
    user_id: Optional[uuid.UUID] = None
    guest_email: Optional[EmailStr] = None
    items: List[OrderItemBase] = Field(default_factory=list)


class OrderRead(OrderBase, TimestampedSchema):
    user_id: Optional[uuid.UUID] = None
    guest_email: Optional[EmailStr] = None
    items: List[OrderItemRead] = Field(default_factory=list)

