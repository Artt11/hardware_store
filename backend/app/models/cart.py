"""Persistent carts for signed-in users and guests.

A cart belongs to exactly one owner: a user, or a guest identified by a random
server-issued token of which only the SHA-256 hex digest is stored. Prices are not
stored on cart lines: they are computed live and snapshotted onto order lines.
Guest carts expire; user carts do not.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.product import Product

MAX_LINE_QUANTITY = 10_000


class Cart(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "carts"
    __table_args__ = (
        CheckConstraint("(user_id IS NULL) <> (guest_token_hash IS NULL)", name="exactly_one_owner"),
        CheckConstraint(
            "guest_token_hash IS NULL OR guest_token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_hex"
        ),
        CheckConstraint("(user_id IS NULL) = (expires_at IS NOT NULL)", name="only_guest_carts_expire"),
    )

    # Plain unique constraint (NULLs are distinct in PostgreSQL), so ON CONFLICT (user_id) works.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    guest_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
        order_by="(CartItem.created_at, CartItem.id)",
    )


class CartItem(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "product_id"),
        CheckConstraint(f"quantity BETWEEN 1 AND {MAX_LINE_QUANTITY}", name="quantity_range"),
    )

    cart_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carts.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    cart: Mapped[Cart] = relationship(back_populates="items", lazy="raise")
    product: Mapped["Product"] = relationship(lazy="raise")
