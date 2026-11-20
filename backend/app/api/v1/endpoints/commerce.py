"""Cart, checkout and order history (thin: logic lives in app.services).

Guests: the first cart write returns a new `X-Session-Token` response header; the
client sends it back on later requests. Without it, a guest has an empty cart.
PUT/DELETE on cart items are idempotent and safe to retry. Checkout is safe against
double submission (the cart row is locked and emptied in the same transaction).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import CurrentUser, DbSession, OptionalUser
from app.core.config import settings
from app.core.middleware import SESSION_TOKEN_HEADER, rate_limit
from app.schemas.commerce import CartView, CheckoutRequest, OrderDetail, OrderPage, SetQuantityRequest
from app.services import cart as cart_service
from app.services import checkout as checkout_service
from app.services import orders as order_service

router = APIRouter(tags=["Cart & Orders"])
GuestToken = Annotated[str | None, Header(alias=SESSION_TOKEN_HEADER, max_length=64)]
checkout_limit = rate_limit(
    "checkout",
    max_requests=settings.RATE_LIMIT_CHECKOUT_MAX,
    window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
)


def _with_token(view: CartView, new_token: str | None) -> JSONResponse:
    response = JSONResponse(view.model_dump(mode="json"))
    if new_token:
        response.headers[SESSION_TOKEN_HEADER] = new_token
    return response


@router.get("/cart", response_model=CartView)
async def get_cart(db: DbSession, user: OptionalUser, guest_token: GuestToken = None) -> CartView:
    cart = await cart_service.find_cart(db, user=user, guest_token=guest_token)
    return await cart_service.build_view(db, cart, is_b2b=bool(user and user.is_b2b))


@router.put("/cart/items/{product_id}", response_model=CartView)
async def set_cart_item(
    product_id: uuid.UUID,
    payload: SetQuantityRequest,
    db: DbSession,
    user: OptionalUser,
    guest_token: GuestToken = None,
) -> JSONResponse:
    cart, new_token = await cart_service.get_or_create_cart(db, user=user, guest_token=guest_token)
    try:
        await cart_service.set_quantity(db, cart, product_id, payload.quantity)
    except cart_service.ProductUnavailable:
        await db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.") from None
    except cart_service.InsufficientStock as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Only {exc.available} available.", headers=None
        ) from None
    await db.commit()
    return _with_token(await cart_service.build_view(db, cart, is_b2b=bool(user and user.is_b2b)), new_token)


@router.delete("/cart/items/{product_id}", response_model=CartView)
async def remove_cart_item(
    product_id: uuid.UUID, db: DbSession, user: OptionalUser, guest_token: GuestToken = None
) -> CartView:
    cart = await cart_service.find_cart(db, user=user, guest_token=guest_token)
    if cart is not None:
        await cart_service.remove_item(db, cart, product_id)
        await db.commit()
    return await cart_service.build_view(db, cart, is_b2b=bool(user and user.is_b2b))


@router.delete("/cart", status_code=status.HTTP_204_NO_CONTENT)
async def clear_cart(db: DbSession, user: OptionalUser, guest_token: GuestToken = None) -> Response:
    cart = await cart_service.find_cart(db, user=user, guest_token=guest_token)
    if cart is not None:
        await cart_service.clear(db, cart)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/checkout",
    response_model=OrderDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(checkout_limit)],
)
async def checkout(
    payload: CheckoutRequest, db: DbSession, user: OptionalUser, guest_token: GuestToken = None
) -> OrderDetail:
    try:
        order = await checkout_service.place_order(db, payload, user=user, guest_token=guest_token)
    except checkout_service.InvoiceNotAllowed:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Invoice payment is available only for approved company accounts."
        ) from None
    except checkout_service.GuestEmailRequired:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "customer.email is required for guests."
        ) from None
    except checkout_service.EmptyCart:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your cart is empty.") from None
    except checkout_service.OutOfStock as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "Some items are no longer available in the requested quantity.",
                "shortages": [s.model_dump(mode="json") for s in exc.shortages],
            },
        ) from None
    except checkout_service.CreditLimitExceeded as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "Order exceeds your available credit.",
                "available_credit": str(exc.available_credit),
            },
        ) from None
    return OrderDetail.model_validate(order)


@router.get("/orders", response_model=OrderPage)
async def list_orders(
    db: DbSession,
    user: CurrentUser,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> OrderPage:
    return await order_service.list_orders(db, user.id, page=page, page_size=page_size)


@router.get("/orders/{order_number}", response_model=OrderDetail)
async def get_order(order_number: str, db: DbSession, user: CurrentUser) -> OrderDetail:
    order = await order_service.get_order(db, user.id, order_number)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    return order
