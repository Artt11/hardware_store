"""Atomic checkout. One transaction, locks taken in a fixed order to avoid deadlocks:

  cart row -> user row (invoice credit check) -> products -> inventory
  (products and inventory both `SELECT ... FOR UPDATE ORDER BY id`)

Locking the cart first makes a double-submitted checkout harmless: the second
request waits, then finds the cart empty. Stock is re-validated under the locks
and decremented in the same transaction, so it can never be oversold.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Cart, CartItem, Inventory, Order, OrderItem, Product, User
from app.schemas.commerce import CheckoutRequest, StockShortage
from app.services.cart import hash_token, shipping_cost

TAX_AMOUNT = Decimal("0.00")  # retail prices in Armenia are VAT-inclusive


class EmptyCart(Exception):
    pass


class GuestEmailRequired(Exception):
    pass


class InvoiceNotAllowed(Exception):
    pass


class CreditLimitExceeded(Exception):
    def __init__(self, available_credit: Decimal) -> None:
        super().__init__("credit limit exceeded")
        self.available_credit = available_credit


class OutOfStock(Exception):
    def __init__(self, shortages: list[StockShortage]) -> None:
        super().__init__("insufficient stock")
        self.shortages = shortages


async def _lock_cart(db: AsyncSession, *, user: User | None, guest_token: str | None) -> Cart | None:
    stmt = select(Cart).with_for_update()
    if user is not None:
        stmt = stmt.where(Cart.user_id == user.id)
    elif guest_token:
        stmt = stmt.where(Cart.guest_token_hash == hash_token(guest_token), Cart.expires_at > func.now())
    else:
        return None
    return await db.scalar(stmt)


async def place_order(
    db: AsyncSession, request: CheckoutRequest, *, user: User | None, guest_token: str | None
) -> Order:
    if request.payment_method == "b2b_invoice" and (user is None or not user.is_b2b):
        raise InvoiceNotAllowed
    if user is None and request.customer.email is None:
        raise GuestEmailRequired

    cart = await _lock_cart(db, user=user, guest_token=guest_token)
    lines = (
        []
        if cart is None
        else (
            await db.execute(
                select(CartItem.product_id, CartItem.quantity).where(CartItem.cart_id == cart.id)
            )
        ).all()
    )
    if cart is None or not lines:
        raise EmptyCart
    requested: dict[uuid.UUID, int] = {pid: qty for pid, qty in lines}
    product_ids = sorted(requested)

    if request.payment_method == "b2b_invoice":
        assert user is not None
        await db.execute(select(User.id).where(User.id == user.id).with_for_update())

    products = {
        p.id: p
        for p in await db.scalars(
            select(Product).where(Product.id.in_(product_ids)).order_by(Product.id).with_for_update()
        )
    }
    inventory = {
        inv.product_id: inv
        for inv in await db.scalars(
            select(Inventory)
            .where(Inventory.product_id.in_(product_ids))
            .order_by(Inventory.id)
            .with_for_update()
        )
    }

    shortages: list[StockShortage] = []
    for pid in product_ids:
        product, inv = products.get(pid), inventory.get(pid)
        available = (
            inv.quantity_on_hand if inv is not None and product is not None and product.is_active else 0
        )
        if requested[pid] > available:
            shortages.append(
                StockShortage(
                    product_id=pid,
                    sku=product.sku if product else "",
                    name=product.name if product else "",
                    requested=requested[pid],
                    available=available,
                )
            )
    if shortages:
        raise OutOfStock(shortages)

    is_b2b = bool(user and user.is_b2b)
    order_lines: list[OrderItem] = []
    subtotal = Decimal("0.00")
    for pid in product_ids:
        product, quantity = products[pid], requested[pid]
        unit_price, tier = product.price_for(is_b2b=is_b2b)
        line_total = unit_price * quantity
        subtotal += line_total
        order_lines.append(
            OrderItem(
                product_id=pid,
                sku_snapshot=product.sku,
                name_snapshot=product.name,
                unit_of_measure=product.unit_of_measure,
                pricing_tier=tier,
                vat_applicable=product.vat_applicable,
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )
        inventory[pid].quantity_on_hand -= quantity

    shipping = shipping_cost(subtotal, request.delivery_method)
    total = subtotal + shipping + TAX_AMOUNT

    payment_due_at = None
    payment_status = "pending"
    if request.payment_method == "b2b_invoice":
        assert user is not None
        outstanding = await db.scalar(
            select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                Order.user_id == user.id, Order.payment_status == "invoiced", Order.status != "cancelled"
            )
        ) or Decimal("0")
        available_credit = user.credit_limit - outstanding
        if total > available_credit:
            raise CreditLimitExceeded(max(Decimal("0.00"), available_credit))
        payment_status = "invoiced"
        payment_due_at = datetime.now(UTC) + timedelta(days=user.payment_terms_days)

    order = Order(
        user_id=user.id if user else None,
        customer_email=str(request.customer.email or (user.email if user else "")),
        customer_name=request.customer.name,
        customer_phone=request.customer.phone,
        order_type="b2b" if is_b2b else "b2c",
        company_name=user.company_name if is_b2b and user else None,
        tax_id=user.tax_id if is_b2b and user else None,
        payment_method=request.payment_method,
        payment_status=payment_status,
        payment_due_at=payment_due_at,
        delivery_method=request.delivery_method,
        subtotal=subtotal,
        shipping_amount=shipping,
        tax_amount=TAX_AMOUNT,
        total_amount=total,
        shipping_address=request.shipping_address.model_dump() if request.shipping_address else None,
        notes=request.notes,
        items=order_lines,
    )
    db.add(order)
    await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    await db.commit()
    return order
