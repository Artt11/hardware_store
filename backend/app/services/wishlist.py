"""Wishlist operations. Inserts use ON CONFLICT DO NOTHING so repeated or
concurrent adds are harmless (the unique constraint decides, not a pre-check)."""

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.wishlist import WishlistItem
from app.schemas.wishlist import MAX_WISHLIST_ITEMS, WishlistItemResponse, WishlistResponse
from app.services.stock import available_stock


class ProductNotFound(Exception):
    pass


class WishlistFull(Exception):
    pass


async def get_wishlist(db: AsyncSession, user_id: uuid.UUID) -> WishlistResponse:
    stock = available_stock().label("stock")
    rows = (
        await db.execute(
            select(WishlistItem.created_at, Product, stock)
            .join(Product, Product.id == WishlistItem.product_id)
            .where(WishlistItem.user_id == user_id)
            .order_by(WishlistItem.created_at.desc())
        )
    ).all()
    items = [
        WishlistItemResponse(
            product_id=product.id,
            sku=product.sku,
            slug=product.slug,
            name=product.name,
            unit_of_measure=product.unit_of_measure,
            retail_price=product.retail_price,
            currency=product.currency,
            image_url=product.image_url,
            in_stock=product.is_active and stock > 0,
            added_at=added_at,
        )
        for added_at, product, stock in rows
    ]
    return WishlistResponse(items_count=len(items), items=items)


async def add_item(db: AsyncSession, user_id: uuid.UUID, product_id: uuid.UUID) -> None:
    exists = await db.scalar(select(Product.id).where(Product.id == product_id, Product.is_active))
    if exists is None:
        raise ProductNotFound
    count = await db.scalar(select(func.count()).where(WishlistItem.user_id == user_id)) or 0
    if count >= MAX_WISHLIST_ITEMS:
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
    count = await db.scalar(select(func.count()).where(WishlistItem.user_id == user_id)) or 0
    room = MAX_WISHLIST_ITEMS - count
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
