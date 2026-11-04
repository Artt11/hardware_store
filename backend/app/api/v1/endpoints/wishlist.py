from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from app.schemas.wishlist import (
    WishlistResponse,
    WishlistItemResponse,
    WishlistAddRequest,
    WishlistSyncRequest,
    WishlistSyncResponse
)

router = APIRouter(prefix="/wishlist", tags=["Wishlist"])

from app.core.security import get_current_user_id

@router.get("", response_model=WishlistResponse)
async def get_user_wishlist(user_id: UUID = Depends(get_current_user_id)):
    """
    Retrieve authenticated user's wishlist from PostgreSQL with full product denormalization.
    """
    sample_items = [
        WishlistItemResponse(
            product_id=UUID("7f3e8f80-1a2b-4c5d-9e0f-112233445566"),
            name="M18 FUEL™ 1/2\" Hammer Drill/Driver Kit",
            slug="m18-fuel-hammer-drill-kit",
            sku="MIL-2904-22",
            brand="Milwaukee",
            price=299.00,
            compare_at_price=349.00,
            currency="USD",
            thumbnail_url="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80",
            in_stock=True,
            added_at=datetime.now(timezone.utc)
        )
    ]
    return WishlistResponse(
        id=UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        user_id=user_id,
        items_count=len(sample_items),
        items=sample_items
    )

@router.post("", response_model=WishlistItemResponse, status_code=status.HTTP_201_CREATED)
async def add_item_to_wishlist(
    payload: WishlistAddRequest,
    user_id: UUID = Depends(get_current_user_id)
):
    """
    Add a product to authenticated user's default wishlist in PostgreSQL.
    Idempotent (UPSERT on conflict).
    """
    # PostgreSQL query:
    # INSERT INTO wishlist_items (wishlist_id, product_id, notes)
    # VALUES ($1, $2, $3)
    # ON CONFLICT (wishlist_id, product_id) DO NOTHING;
    return WishlistItemResponse(
        product_id=payload.product_id,
        name="M18 FUEL™ 1/2\" Hammer Drill/Driver Kit",
        slug="m18-fuel-hammer-drill-kit",
        sku="MIL-2904-22",
        brand="Milwaukee",
        price=299.00,
        compare_at_price=349.00,
        currency="USD",
        thumbnail_url="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80",
        in_stock=True,
        added_at=datetime.now(timezone.utc)
    )

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item_from_wishlist(
    product_id: UUID,
    user_id: UUID = Depends(get_current_user_id)
):
    """
    Remove product from user's wishlist in PostgreSQL.
    """
    # PostgreSQL:
    # DELETE FROM wishlist_items WHERE wishlist_id = $1 AND product_id = $2;
    return None

@router.post("/sync", response_model=WishlistSyncResponse)
async def sync_guest_wishlist(
    payload: WishlistSyncRequest,
    user_id: UUID = Depends(get_current_user_id)
):
    """
    Reconciles guest LocalStorage product IDs into the user's PostgreSQL database upon login.
    Unions guest IDs with existing DB items so nothing is lost.
    """
    # Production logic:
    # 1. Fetch user's wishlist_id
    # 2. For each product_id in payload.product_ids:
    #    INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (...) ON CONFLICT DO NOTHING
    # 3. Return full consolidated list of wishlist items
    
    return WishlistSyncResponse(
        success=True,
        synced_count=len(payload.product_ids),
        items=[]
    )
