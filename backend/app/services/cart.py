"""Persistent carts. Guests are identified by a random server-issued token sent as
`X-Session-Token`; only its SHA-256 hex digest is stored (audit C3: no shared
default cart). Prices are computed live for the viewer and never stored on lines.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cart, CartItem, Inventory, Product, User
from app.models.cart import MAX_LINE_QUANTITY
from app.schemas.commerce import CartItemView, CartView

FREE_SHIPPING_THRESHOLD = Decimal("50000.00")
EXPRESS_SHIPPING_COST = Decimal("2500.00")
GUEST_CART_LIFETIME = timedelta(days=30)
ZERO = Decimal("0.00")


class ProductUnavailable(Exception):
    pass


class InsufficientStock(Exception):
    def __init__(self, available: int) -> None:
        super().__init__(f"only {available} available")
        self.available = available


def new_guest_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def shipping_cost(subtotal: Decimal, delivery_method: str) -> Decimal:
    if delivery_method == "pickup" or subtotal >= FREE_SHIPPING_THRESHOLD:
        return ZERO
    return EXPRESS_SHIPPING_COST


async def find_cart(db: AsyncSession, *, user: User | None, guest_token: str | None) -> Cart | None:
    if user is not None:
        return await db.scalar(select(Cart).where(Cart.user_id == user.id))
    if guest_token:
        return await db.scalar(
            select(Cart).where(Cart.guest_token_hash == hash_token(guest_token), Cart.expires_at > func.now())
        )
    return None


async def get_or_create_cart(
    db: AsyncSession, *, user: User | None, guest_token: str | None
) -> tuple[Cart, str | None]:
    """Returns the cart and, when a new guest cart was created, its new token."""
    cart = await find_cart(db, user=user, guest_token=guest_token)
    if cart is not None:
        if cart.expires_at is not None:  # sliding expiry for active guest carts
            cart.expires_at = datetime.now(UTC) + GUEST_CART_LIFETIME
        return cart, None
    if user is not None:
        # Race-safe: concurrent first adds for one user converge on the same row.
        await db.execute(
            insert(Cart).values(user_id=user.id).on_conflict_do_nothing(index_elements=["user_id"])
        )
        cart = await db.scalar(select(Cart).where(Cart.user_id == user.id))
        assert cart is not None
        return cart, None
    token = new_guest_token()
    cart = Cart(guest_token_hash=hash_token(token), expires_at=datetime.now(UTC) + GUEST_CART_LIFETIME)
    db.add(cart)
    await db.flush()
    return cart, token


async def set_quantity(db: AsyncSession, cart: Cart, product_id: uuid.UUID, quantity: int) -> None:
    row = (
        await db.execute(
            select(Product.is_active, func.coalesce(Inventory.quantity_on_hand, 0))
            .outerjoin(Inventory, Inventory.product_id == Product.id)
            .where(Product.id == product_id)
        )
    ).first()
    if row is None or not row[0]:
        raise ProductUnavailable
    available = int(row[1])
    if quantity > available:
        raise InsufficientStock(available)
    await db.execute(
        insert(CartItem)
        .values(cart_id=cart.id, product_id=product_id, quantity=quantity)
        .on_conflict_do_update(index_elements=["cart_id", "product_id"], set_={"quantity": quantity})
    )


async def remove_item(db: AsyncSession, cart: Cart, product_id: uuid.UUID) -> None:
    await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id, CartItem.product_id == product_id))


async def clear(db: AsyncSession, cart: Cart) -> None:
    await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))


async def merge_guest_cart(db: AsyncSession, *, user: User, guest_token: str | None) -> None:
    """Move a guest cart into the user's cart (quantities summed, capped). Never fails login."""
    if not guest_token:
        return
    guest = await find_cart(db, user=None, guest_token=guest_token)
    if guest is None:
        return
    target, _ = await get_or_create_cart(db, user=user, guest_token=None)
    lines = (
        await db.execute(select(CartItem.product_id, CartItem.quantity).where(CartItem.cart_id == guest.id))
    ).all()
    if lines:
        stmt = insert(CartItem).values(
            [{"cart_id": target.id, "product_id": pid, "quantity": qty} for pid, qty in lines]
        )
        await db.execute(
            stmt.on_conflict_do_update(
                index_elements=["cart_id", "product_id"],
                set_={"quantity": func.least(CartItem.quantity + stmt.excluded.quantity, MAX_LINE_QUANTITY)},
            )
        )
    await db.delete(guest)


async def build_view(db: AsyncSession, cart: Cart | None, *, is_b2b: bool) -> CartView:
    rows: list[Any] = []
    if cart is not None:
        result = await db.execute(
            select(CartItem.quantity, Product, func.coalesce(Inventory.quantity_on_hand, 0))
            .join(Product, Product.id == CartItem.product_id)
            .outerjoin(Inventory, Inventory.product_id == Product.id)
            .where(CartItem.cart_id == cart.id)
            .order_by(CartItem.created_at, CartItem.id)
        )
        rows = list(result.all())
    items: list[CartItemView] = []
    subtotal = ZERO
    for quantity, product, stock in rows:
        price, tier = product.price_for(is_b2b=is_b2b)
        line_total = price * quantity
        subtotal += line_total
        items.append(
            CartItemView(
                product_id=product.id,
                sku=product.sku,
                slug=product.slug,
                name=product.name,
                name_ru=product.name_ru,
                name_en=product.name_en,
                unit_of_measure=product.unit_of_measure,
                image_url=product.image_url,
                unit_price=price,
                pricing_tier=tier,
                quantity=quantity,
                line_total=line_total,
                available_quantity=int(stock),
                is_available=product.is_active and stock >= quantity,
            )
        )
    return CartView(
        items=items,
        item_count=sum(i.quantity for i in items),
        subtotal=subtotal,
        shipping_estimate=shipping_cost(subtotal, "express") if items else ZERO,
        free_shipping_threshold=FREE_SHIPPING_THRESHOLD,
        amount_to_free_shipping=max(ZERO, FREE_SHIPPING_THRESHOLD - subtotal),
    )
