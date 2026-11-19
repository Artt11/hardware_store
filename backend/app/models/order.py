"""Orders and order lines: financial records.

- Orders snapshot the customer (email, name, phone), so they survive user deletion.
- Lines snapshot SKU, name, unit and price, and cannot be deleted (FK RESTRICT).
- Order numbers come from `next_order_number()` (sequence-backed, created in the
  migration), so concurrent checkouts never collide.
- Orders are cancelled by status, never deleted.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import HVHH_SQL_PATTERN, Base, Money, Timestamps, UUIDPrimaryKey, sql_in

if TYPE_CHECKING:
    from app.models.user import User

ORDER_TYPES = ("b2c", "b2b")
ORDER_STATUSES = ("pending", "confirmed", "shipped", "delivered", "cancelled")
PAYMENT_METHODS = ("card", "cash_on_delivery", "b2b_invoice")
PAYMENT_STATUSES = ("pending", "paid", "invoiced", "refunded")
DELIVERY_METHODS = ("express", "pickup")
PRICING_TIERS = ("retail", "wholesale")


class Order(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(sql_in("order_type", ORDER_TYPES), name="order_type_valid"),
        CheckConstraint(sql_in("status", ORDER_STATUSES), name="status_valid"),
        CheckConstraint(sql_in("payment_method", PAYMENT_METHODS), name="payment_method_valid"),
        CheckConstraint(sql_in("payment_status", PAYMENT_STATUSES), name="payment_status_valid"),
        CheckConstraint(sql_in("delivery_method", DELIVERY_METHODS), name="delivery_method_valid"),
        CheckConstraint("currency = 'AMD'", name="currency_amd"),
        CheckConstraint(f"tax_id IS NULL OR tax_id ~ '{HVHH_SQL_PATTERN}'", name="tax_id_hvhh"),
        # B2B orders belong to a signed-in company account with its legal identity.
        CheckConstraint(
            "order_type <> 'b2b' OR (user_id IS NOT NULL AND tax_id IS NOT NULL "
            "AND btrim(coalesce(company_name, '')) <> '')",
            name="b2b_has_company",
        ),
        CheckConstraint("payment_method <> 'b2b_invoice' OR order_type = 'b2b'", name="invoice_only_b2b"),
        CheckConstraint(
            "delivery_method = 'pickup' OR shipping_address IS NOT NULL", name="delivery_has_address"
        ),
        CheckConstraint(
            "shipping_address IS NULL OR jsonb_typeof(shipping_address) = 'object'", name="address_is_object"
        ),
        CheckConstraint(
            "subtotal >= 0 AND shipping_amount >= 0 AND tax_amount >= 0",
            name="amounts_non_negative",
        ),
        CheckConstraint("total_amount = subtotal + shipping_amount + tax_amount", name="total_adds_up"),
    )

    order_number: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, server_default=text("next_order_number()")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    customer_email: Mapped[str] = mapped_column(CITEXT, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(30), nullable=False)

    order_type: Mapped[str] = mapped_column(String(10), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(150))
    tax_id: Mapped[str | None] = mapped_column(String(8))

    status: Mapped[str] = mapped_column(String(20), server_default="pending", nullable=False)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    payment_status: Mapped[str] = mapped_column(String(20), server_default="pending", nullable=False)
    payment_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivery_method: Mapped[str] = mapped_column(String(10), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), server_default="AMD", nullable=False)

    subtotal: Mapped[Decimal] = mapped_column(Money, nullable=False)
    shipping_amount: Mapped[Decimal] = mapped_column(Money, server_default="0", nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Money, server_default="0", nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)

    # none_as_null: Python None must become SQL NULL, not JSON 'null' (see address_is_object).
    shipping_address: Mapped[dict[str, Any] | None] = mapped_column(JSONB(none_as_null=True))
    notes: Mapped[str | None] = mapped_column(Text)

    user: Mapped["User | None"] = relationship(back_populates="orders", lazy="raise")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="save-update, merge",
        passive_deletes=True,
        lazy="raise",
        order_by="OrderItem.created_at",
    )


class OrderItem(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("line_total = unit_price * quantity", name="line_total_adds_up"),
        CheckConstraint(sql_in("pricing_tier", PRICING_TIERS), name="pricing_tier_valid"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    sku_snapshot: Mapped[str] = mapped_column(String(64), nullable=False)
    name_snapshot: Mapped[str] = mapped_column(String(500), nullable=False)
    unit_of_measure: Mapped[str] = mapped_column(String(32), nullable=False)
    pricing_tier: Mapped[str] = mapped_column(String(10), nullable=False)
    vat_applicable: Mapped[bool] = mapped_column(nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Money, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Money, nullable=False)

    order: Mapped[Order] = relationship(back_populates="items", lazy="raise")
