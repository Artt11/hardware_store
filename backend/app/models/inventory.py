"""
Inventory ORM Model (`inventory` table).
Tracks warehouse stock levels, reserved quantities, and reorder thresholds.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.product import Product, ProductVariant


class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_code", name="uq_inventory_product_warehouse"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("product_variants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    warehouse_code: Mapped[str] = mapped_column(String(32), default="EVN-MAIN", nullable=False, index=True)
    aisle_bin: Mapped[Optional[str]] = mapped_column(String(64), default="A-01-01", nullable=True)

    quantity_on_hand: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quantity_reserved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reorder_point: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    reorder_quantity: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    last_restocked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=True,
    )

    # Relationships
    product: Mapped["Product"] = relationship("Product", back_populates="inventory_records")
    variant: Mapped[Optional["ProductVariant"]] = relationship(
        "ProductVariant",
        back_populates="inventory_records",
    )

    @property
    def quantity_available(self) -> int:
        """Net sellable stock across B2C & B2B channels."""
        return max(self.quantity_on_hand - self.quantity_reserved, 0)

