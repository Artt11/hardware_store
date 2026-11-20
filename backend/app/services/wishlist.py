"""Wishlist operations. Inserts use ON CONFLICT DO NOTHING so repeated or
concurrent adds are harmless (the unique constraint decides, not a pre-check).
The size cap is enforced under a lock on the user's row, so parallel adds from
several tabs cannot each see room for one more and overshoot it together."""

import uuid
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.user import User
from app.models.wishlist import WishlistItem
from app.schemas.wishlist import MAX_WISHLIST_ITEMS, WishlistItemResponse, WishlistResponse
from app.services.stock import available_stock


class ProductNotFound(Exception):
    pass


class WishlistFull(Exception):
    pass


def _item(product: Product, added_at: datetime, stock: int, *, is_b2b: bool) -> WishlistItemResponse:
    price, tier = product.price_for(is_b2b=is_b2b)
    available = max(stock, 0) if product.is_active else 0
    return WishlistItemResponse(
        product_id=product.id,
        sku=product.sku,
        slug=product.slug,
        name=product.name,
        name_ru=product.name_ru,
        name_en=product.name_en,
        unit_of_measure=product.unit_of_measure,
        price=price,
        pricing_tier=tier,
        retail_price=product.retail_price,
        currency=product.currency,
        image_url=product.image_url,
        in_stock=available > 0,
        available_quantity=available,
        added_at=added_at,
    )


async def get_wishlist(db: AsyncSession, user: User) -> WishlistResponse:
    """Prices follow the viewer (wholesale for verified companies), like the catalog."""
    stock = available_stock().label("stock")
    rows = (
        await db.execute(
            select(WishlistItem.created_at, Product, stock)
            .join(Product, Product.id == WishlistItem.product_id)
            .where(WishlistItem.user_id == user.id)
            .order_by(WishlistItem.created_at.desc())
        )
    ).all()
    items = [_item(product, added_at, stock, is_b2b=user.is_b2b) for added_at, product, stock in rows]
    return WishlistResponse(items_count=len(items), items=items)


async def _lock_and_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Serialise wishlist writes per user, then count (see module docstring)."""
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())
    return await db.scalar(select(func.count()).where(WishlistItem.user_id == user_id)) or 0


async def add_item(db: AsyncSession, user_id: uuid.UUID, product_id: uuid.UUID) -> None:
    exists = await db.scalar(select(Product.id).where(Product.id == product_id, Product.is_active))
    if exists is None:
        raise ProductNotFound
    if await _lock_and_count(db, user_id) >= MAX_WISHLIST_ITEMS:
        raise WishlistFull
    await db.execute(
        insert(WishlistItem)
        .values(user_id=user_id, product_id=product_id)
        .on_conflict_do_nothing(index_elements=["user_id", "product_id"])
    )
    await db.commit()


async def remove_item(db: AsyncSession, user_id: uuid.UUID, product_id: uuid.UUID) -> None:
    """Idempotent: removing an item that is not there is not an error."""
    await db.execute(
        delete(WishlistItem).where(WishlistItem.user_id == user_id, WishlistItem.product_id == product_id)
    )
    await db.commit()


async def sync_guest_items(db: AsyncSession, user_id: uuid.UUID, product_ids: list[uuid.UUID]) -> None:
    """Merge guest IDs; unknown/inactive products are ignored, cap is respected."""
    if not product_ids:
        return
    room = MAX_WISHLIST_ITEMS - await _lock_and_count(db, user_id)
    if room <= 0:
        return
    valid = (
        await db.scalars(
            select(Product.id).where(Product.id.in_(set(product_ids)), Product.is_active).limit(room)
        )
    ).all()
    if valid:
        await db.execute(
            insert(WishlistItem)
            .values([{"user_id": user_id, "product_id": pid} for pid in valid])
            .on_conflict_do_nothing(index_elements=["user_id", "product_id"])
        )
    await db.commit()
