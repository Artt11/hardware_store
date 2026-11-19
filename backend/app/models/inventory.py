"""Inventory: the single source of truth for stock, one row per product.
Checkout locks these rows (FOR UPDATE, ordered by id) and decrements them."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.product import Product


class Inventory(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "inventory"
    __table_args__ = (
        CheckConstraint("quantity_on_hand >= 0", name="on_hand_non_negative"),
        CheckConstraint("reorder_point >= 0", name="reorder_point_non_negative"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    quantity_on_hand: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    reorder_point: Mapped[int] = mapped_column(Integer, server_default="5", nullable=False)

    product: Mapped["Product"] = relationship(back_populates="inventory", lazy="raise")
