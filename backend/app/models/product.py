"""Catalog: categories and products. Stock lives in `inventory`, not here."""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Money, Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.inventory import Inventory


class Category(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "categories"

    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    products: Mapped[list["Product"]] = relationship(back_populates="category", lazy="raise")


class Product(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("retail_price >= 0", name="retail_price_non_negative"),
        # NULL wholesale price means "B2B pays retail"; never 0 (that would be free).
        CheckConstraint(
            "wholesale_price IS NULL OR (wholesale_price > 0 AND wholesale_price <= retail_price)",
            name="wholesale_price_valid",
        ),
        CheckConstraint("compare_at_price IS NULL OR compare_at_price >= 0", name="compare_at_non_negative"),
        CheckConstraint("discount_percent BETWEEN 0 AND 100", name="discount_percent_range"),
        CheckConstraint("currency = 'AMD'", name="currency_amd"),
        # pg_trgm GIN indexes back ILIKE '%term%' and similarity() search on name/sku.
        # Requires a UTF-8 database locale, otherwise Armenian letters produce no trigrams.
        Index(
            "ix_products_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}
        ),
        Index("ix_products_sku_trgm", "sku", postgresql_using="gin", postgresql_ops={"sku": "gin_trgm_ops"}),
        Index(
            "ix_products_specifications",
            "specifications",
            postgresql_using="gin",
            postgresql_ops={"specifications": "jsonb_path_ops"},
        ),
        Index("ix_products_active_category_price", "is_active", "category_id", "retail_price"),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    unit_of_measure: Mapped[str] = mapped_column(String(32), server_default="հատ", nullable=False)

    retail_price: Mapped[Decimal] = mapped_column(Money, nullable=False)
    wholesale_price: Mapped[Decimal | None] = mapped_column(Money)
    compare_at_price: Mapped[Decimal | None] = mapped_column(Money)
    discount_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), server_default="0", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), server_default="AMD", nullable=False)
    vat_applicable: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    barcode: Mapped[str | None] = mapped_column(String(128), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(255))
    specifications: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default=text("'{}'::jsonb"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), nullable=False)

    category: Mapped[Category] = relationship(back_populates="products", lazy="raise")
    inventory: Mapped["Inventory | None"] = relationship(
        back_populates="product", lazy="raise", uselist=False
    )

    def price_for(self, *, is_b2b: bool) -> tuple[Decimal, str]:
        """Unit price and pricing tier for a customer type."""
        if is_b2b and self.wholesale_price is not None:
            return self.wholesale_price, "wholesale"
        return self.retail_price, "retail"
