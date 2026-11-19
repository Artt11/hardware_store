"""Wishlist endpoints (thin: validation + auth here, logic in app.services.wishlist).

POST and DELETE are idempotent and safe to retry."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import CurrentUserId, DbSession
from app.schemas.wishlist import WishlistAddRequest, WishlistResponse, WishlistSyncRequest
from app.services import wishlist as service

router = APIRouter(prefix="/wishlist", tags=["Wishlist"])


@router.get("", response_model=WishlistResponse)
async def get_wishlist(
    user_id: CurrentUserId,
    db: DbSession,
) -> WishlistResponse:
    return await service.get_wishlist(db, user_id)


@router.post("", response_model=WishlistResponse)
async def add_to_wishlist(
    payload: WishlistAddRequest,
    user_id: CurrentUserId,
    db: DbSession,
) -> WishlistResponse:
    try:
        await service.add_item(db, user_id, payload.product_id)
    except service.ProductNotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.") from None
    except service.WishlistFull:
        raise HTTPException(status.HTTP_409_CONFLICT, "Wishlist is full.") from None
    return await service.get_wishlist(db, user_id)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_wishlist(
    product_id: UUID,
    user_id: CurrentUserId,
    db: DbSession,
) -> Response:
    await service.remove_item(db, user_id, product_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/sync", response_model=WishlistResponse)
async def sync_guest_wishlist(
    payload: WishlistSyncRequest,
    user_id: CurrentUserId,
    db: DbSession,
) -> WishlistResponse:
    await service.sync_guest_items(db, user_id, payload.product_ids)
    return await service.get_wishlist(db, user_id)
