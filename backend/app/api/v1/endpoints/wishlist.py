"""
PostgreSQL-Backed Wishlist Endpoints (`backend/app/api/v1/endpoints/wishlist.py`).
Fixes BUG-01: Replaces hardcoded mock wishlist arrays with SQLAlchemy ORM queries
against `wishlists`, `wishlist_items`, and `products` in PostgreSQL.
"""

from datetime import datetime, timezone
from typing import List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.core.security import get_current_user_id
from app.models.product import Product
from app.models.wishlist import Wishlist, WishlistItem
from app.schemas.wishlist import (
    WishlistAddRequest,
    WishlistItemResponse,
    WishlistResponse,
    WishlistSyncRequest,
    WishlistSyncResponse,
)

router = APIRouter(prefix="/wishlist", tags=["Wishlist"])


async def get_or_create_default_wishlist(db: AsyncSession, user_id: UUID) -> Wishlist:
    stmt = (
        select(Wishlist)
        .options(selectinload(Wishlist.items).selectinload(WishlistItem.product))
        .where(Wishlist.user_id == user_id, Wishlist.is_default.is_(True))
    )
    wishlist = (await db.execute(stmt)).scalar_one_or_none()
    if wishlist is not None:
        return wishlist

    wishlist = Wishlist(
        id=uuid4(),
        user_id=user_id,
        name="Favorites",
        is_default=True,
    )
    db.add(wishlist)
    await db.commit()
    await db.refresh(wishlist)
    return wishlist


def serialize_wishlist_item(wi: WishlistItem) -> WishlistItemResponse:
    product = wi.product
    price = float(product.retail_price or product.base_price or 0.0) if product else 0.0
    compare_at = (
        float(product.compare_at_price)
        if product and product.compare_at_price is not None
        else None
    )
    return WishlistItemResponse(
        product_id=wi.product_id,
        name=product.name if product else "Hardware Product",
        slug=(product.slug or f"product-{product.sku.lower()}") if product else "product",
        sku=product.sku if product else "",
        brand="Սուրո",
        price=price,
        compare_at_price=compare_at,
        currency=(product.currency or "AMD") if product else "AMD",
        thumbnail_url=product.image_url if product else None,
        in_stock=bool(product.is_active and (product.stock_quantity or 0) > 0) if product else True,
        added_at=wi.created_at or datetime.now(timezone.utc),
    )


@router.get("", response_model=WishlistResponse)
async def get_user_wishlist(
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve authenticated user's wishlist from PostgreSQL `wishlists` & `wishlist_items`."""
    wishlist = await get_or_create_default_wishlist(db, user_id)
    items: List[WishlistItemResponse] = [
        serialize_wishlist_item(wi) for wi in (wishlist.items or []) if wi.product is not None
    ]
    return WishlistResponse(
        id=wishlist.id,
        user_id=user_id,
        items_count=len(items),
        items=items,
    )


@router.post("", response_model=WishlistItemResponse, status_code=status.HTTP_201_CREATED)
async def add_item_to_wishlist(
    payload: WishlistAddRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db_session),
):
    """Idempotently add a product to the authenticated user's PostgreSQL wishlist."""
    prod_stmt = select(Product).where(Product.id == payload.product_id)
    product = (await db.execute(prod_stmt)).scalar_one_or_none()
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    wishlist = await get_or_create_default_wishlist(db, user_id)
    existing = next(
        (wi for wi in (wishlist.items or []) if wi.product_id == payload.product_id),
        None,
    )
    if existing is not None:
        existing.product = product
        return serialize_wishlist_item(existing)

    new_item = WishlistItem(
        id=uuid4(),
        wishlist_id=wishlist.id,
        product_id=product.id,
        notes=payload.notes,
    )
    db.add(new_item)
    await db.commit()
    new_item.product = product
    return serialize_wishlist_item(new_item)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item_from_wishlist(
    product_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove a product from the authenticated user's PostgreSQL wishlist."""
    wishlist = await get_or_create_default_wishlist(db, user_id)
    await db.execute(
        delete(WishlistItem).where(
            WishlistItem.wishlist_id == wishlist.id,
            WishlistItem.product_id == product_id,
        )
    )
    await db.commit()
    return None


@router.post("/sync", response_model=WishlistSyncResponse)
async def sync_guest_wishlist(
    payload: WishlistSyncRequest,
    user_id: UUID = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db_session),
):
    """Merge guest LocalStorage product UUIDs into the user's PostgreSQL wishlist."""
    wishlist = await get_or_create_default_wishlist(db, user_id)
    existing_ids = {wi.product_id for wi in (wishlist.items or [])}

    if payload.product_ids:
        valid_products = (
            await db.execute(select(Product.id).where(Product.id.in_(payload.product_ids)))
        ).scalars().all()
        for pid in valid_products:
            if pid not in existing_ids:
                db.add(
                    WishlistItem(
                        id=uuid4(),
                        wishlist_id=wishlist.id,
                        product_id=pid,
                    )
                )
                existing_ids.add(pid)
        await db.commit()

    refreshed = await get_or_create_default_wishlist(db, user_id)
    items = [
        serialize_wishlist_item(wi) for wi in (refreshed.items or []) if wi.product is not None
    ]
    return WishlistSyncResponse(
        success=True,
        synced_count=len(items),
        items=items,
    )
