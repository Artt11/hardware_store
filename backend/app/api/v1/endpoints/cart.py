"""
PostgreSQL-Backed Cart, Atomic Checkout & Order History Endpoints (`backend/app/api/v1/endpoints/cart.py`).
Fixes:
- BUG-01: Persists all Carts, CartItems, Orders, and OrderItems in PostgreSQL via SQLAlchemy ORM.
- BUG-03 & BUG-04: Enforces B2B wholesale pricing for company accounts and validates 8-digit Armenian HVHH tax IDs.
- ISSUE-01: Acquires row-level `SELECT ... FOR UPDATE` locks during checkout, validates available stock,
  and atomically decrements `products.stock_quantity` and `inventory.quantity_on_hand`.
- ISSUE-02: Adds `GET /api/v1/cart/orders` returning the authenticated user's persisted PostgreSQL orders.
"""

import re
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.core.middleware import rate_limiter
from app.core.security import decode_access_token, get_current_user_payload, security_bearer
from app.models.cart import Cart, CartItem
from app.models.inventory import Inventory
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.schemas.cart import (
    AddToCartRequest,
    CartItemDetail,
    CartResponse,
    CheckoutOrderRequest,
    OrderConfirmationResponse,
    OrderHistoryItemResponse,
    OrderHistoryResponse,
    UpdateCartItemRequest,
)

router = APIRouter(prefix="/cart", tags=["Cart & Checkout"])

FREE_SHIPPING_THRESHOLD_AMD = Decimal("50000.00")
STANDARD_SHIPPING_COST_AMD = Decimal("2500.00")
HVHH_REGEX = re.compile(r"^\d{8}$")


async def get_optional_user_payload(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Optional[dict]:
    if not credentials or not credentials.credentials:
        return None
    try:
        return decode_access_token(credentials.credentials)
    except Exception:
        return None


def resolve_effective_price(product: Product, account_type: str = "individual") -> Decimal:
    """Return B2B wholesale_price for company accounts when > 0, else retail_price."""
    retail = Decimal(str(product.retail_price or product.base_price or "0.00"))
    wholesale = Decimal(str(product.wholesale_price or "0.00"))
    if account_type == "company" and wholesale > Decimal("0.00"):
        return wholesale
    return retail


async def get_or_create_cart(
    db: AsyncSession,
    user_id: Optional[UUID],
    session_token: str,
) -> Cart:
    if user_id is not None:
        stmt = (
            select(Cart)
            .options(selectinload(Cart.items).selectinload(CartItem.product))
            .where(Cart.user_id == user_id)
        )
        cart = (await db.execute(stmt)).scalar_one_or_none()
        if cart is not None:
            return cart

    stmt = (
        select(Cart)
        .options(selectinload(Cart.items).selectinload(CartItem.product))
        .where(Cart.session_token == session_token)
    )
    cart = (await db.execute(stmt)).scalar_one_or_none()
    if cart is not None:
        if user_id is not None and cart.user_id is None:
            cart.user_id = user_id
            await db.commit()
        return cart

    cart = Cart(
        id=uuid4(),
        user_id=user_id,
        session_token=session_token,
        currency="AMD",
    )
    db.add(cart)
    await db.commit()
    await db.refresh(cart)
    return cart


def serialize_cart(cart: Cart, account_type: str = "individual") -> CartResponse:
    item_details: List[CartItemDetail] = []
    subtotal = Decimal("0.00")

    for ci in cart.items or []:
        product = ci.product
        if product is None:
            continue
        unit_price = resolve_effective_price(product, account_type)
        line_total = (unit_price * Decimal(ci.quantity)).quantize(Decimal("0.01"))
        subtotal += line_total

        item_details.append(
            CartItemDetail(
                id=ci.id,
                product_id=ci.product_id,
                name=product.name,
                slug=product.slug or f"product-{product.sku.lower()}",
                sku=product.sku,
                thumbnail_url=product.image_url,
                unit_price=float(unit_price),
                quantity=ci.quantity,
                line_total=float(line_total),
                stock_quantity=int(product.stock_quantity or 0),
                in_stock=bool(product.is_active and (product.stock_quantity or 0) > 0),
            )
        )

    shipping_total = (
        Decimal("0.00")
        if (subtotal == Decimal("0.00") or subtotal >= FREE_SHIPPING_THRESHOLD_AMD)
        else STANDARD_SHIPPING_COST_AMD
    )
    tax_total = Decimal("0.00")
    grand_total = subtotal + shipping_total + tax_total

    return CartResponse(
        id=cart.id,
        session_token=cart.session_token,
        user_id=cart.user_id,
        items_count=sum(i.quantity for i in item_details),
        subtotal=float(subtotal),
        tax_total=float(tax_total),
        shipping_total=float(shipping_total),
        grand_total=float(grand_total),
        items=item_details,
    )


@router.get("", response_model=CartResponse)
async def get_cart(
    x_session_token: Optional[str] = Header(default="default-guest-session"),
    auth_user: Optional[dict] = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Retrieve current shopping cart from PostgreSQL `carts` & `cart_items` tables."""
    user_id = UUID(str(auth_user["sub"])) if auth_user and auth_user.get("sub") else None
    account_type = auth_user.get("account_type", "individual") if auth_user else "individual"
    session_token = x_session_token or "default-guest-session"

    cart = await get_or_create_cart(db, user_id, session_token)
    return serialize_cart(cart, account_type)


@router.get("/orders", response_model=List[OrderHistoryResponse])
async def list_user_orders(
    auth_payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """
    ISSUE-02 Fix: Returns the authenticated user's persisted order history from
    PostgreSQL `orders` and `order_items` using `selectinload` (no N+1 queries).
    """
    try:
        user_id = UUID(str(auth_payload.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user token subject.",
        )

    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.user_id == user_id)
        .order_by(Order.created_at.desc())
    )
    orders = (await db.execute(stmt)).scalars().all()

    results: List[OrderHistoryResponse] = []
    for o in orders:
        item_responses = [
            OrderHistoryItemResponse(
                id=oi.id,
                product_id=oi.product_id,
                sku=oi.sku_snapshot,
                name=oi.name_snapshot,
                unit_of_measure=oi.unit_of_measure or "հատ",
                pricing_tier=oi.pricing_tier or "retail",
                quantity=oi.quantity,
                unit_price=float(oi.unit_price),
                total_price=float(oi.total_price),
            )
            for oi in (o.items or [])
        ]
        results.append(
            OrderHistoryResponse(
                order_id=o.id,
                order_number=o.order_number,
                order_type=o.order_type or "b2c",
                status=o.status,
                payment_method=o.payment_method,
                payment_status=o.payment_status,
                currency=o.currency or "AMD",
                subtotal=float(o.subtotal),
                shipping_total=float(o.shipping_amount),
                tax_total=float(o.tax_amount),
                grand_total=float(o.total_amount),
                items_count=sum(i.quantity for i in item_responses),
                created_at=(
                    o.created_at.isoformat()
                    if isinstance(o.created_at, datetime)
                    else datetime.now(timezone.utc).isoformat()
                ),
                items=item_responses,
            )
        )
    return results


@router.post("/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
async def add_item_to_cart(
    payload: AddToCartRequest,
    x_session_token: Optional[str] = Header(default="default-guest-session"),
    auth_user: Optional[dict] = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Add or increment a product in PostgreSQL `cart_items`."""
    user_id = UUID(str(auth_user["sub"])) if auth_user and auth_user.get("sub") else None
    account_type = auth_user.get("account_type", "individual") if auth_user else "individual"
    session_token = x_session_token or "default-guest-session"

    prod_stmt = select(Product).where(Product.id == payload.product_id)
    product = (await db.execute(prod_stmt)).scalar_one_or_none()
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found in catalog.",
        )

    cart = await get_or_create_cart(db, user_id, session_token)
    unit_price = resolve_effective_price(product, account_type)

    existing_item = next(
        (item for item in (cart.items or []) if item.product_id == payload.product_id),
        None,
    )
    if existing_item is not None:
        existing_item.quantity += payload.quantity
        existing_item.unit_price = unit_price
    else:
        new_item = CartItem(
            id=uuid4(),
            cart_id=cart.id,
            product_id=product.id,
            quantity=payload.quantity,
            unit_price=unit_price,
        )
        db.add(new_item)

    await db.commit()
    refreshed_cart = await get_or_create_cart(db, user_id, session_token)
    return serialize_cart(refreshed_cart, account_type)


@router.patch("/items/{product_id}", response_model=CartResponse)
async def update_cart_item_quantity(
    product_id: UUID,
    payload: UpdateCartItemRequest,
    x_session_token: Optional[str] = Header(default="default-guest-session"),
    auth_user: Optional[dict] = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Update quantity of an item in PostgreSQL `cart_items`."""
    user_id = UUID(str(auth_user["sub"])) if auth_user and auth_user.get("sub") else None
    account_type = auth_user.get("account_type", "individual") if auth_user else "individual"
    session_token = x_session_token or "default-guest-session"

    cart = await get_or_create_cart(db, user_id, session_token)
    if payload.quantity <= 0:
        await db.execute(
            delete(CartItem).where(
                CartItem.cart_id == cart.id,
                CartItem.product_id == product_id,
            )
        )
    else:
        for item in cart.items or []:
            if item.product_id == product_id:
                item.quantity = payload.quantity
                break

    await db.commit()
    refreshed_cart = await get_or_create_cart(db, user_id, session_token)
    return serialize_cart(refreshed_cart, account_type)


@router.delete("/items/{product_id}", response_model=CartResponse)
async def remove_item_from_cart(
    product_id: UUID,
    x_session_token: Optional[str] = Header(default="default-guest-session"),
    auth_user: Optional[dict] = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Remove an item from PostgreSQL `cart_items`."""
    user_id = UUID(str(auth_user["sub"])) if auth_user and auth_user.get("sub") else None
    account_type = auth_user.get("account_type", "individual") if auth_user else "individual"
    session_token = x_session_token or "default-guest-session"

    cart = await get_or_create_cart(db, user_id, session_token)
    await db.execute(
        delete(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.product_id == product_id,
        )
    )
    await db.commit()
    refreshed_cart = await get_or_create_cart(db, user_id, session_token)
    return serialize_cart(refreshed_cart, account_type)


@router.post("/checkout", response_model=OrderConfirmationResponse, status_code=status.HTTP_201_CREATED)
async def checkout_order(
    payload: CheckoutOrderRequest,
    request: Request,
    x_session_token: Optional[str] = Header(default="default-guest-session"),
    auth_user: Optional[dict] = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Persists a B2C or B2B Order into PostgreSQL (`orders` and `order_items`).
    ISSUE-01 Fix: Locks product & inventory rows using `SELECT ... FOR UPDATE`,
    validates sufficient stock (`409 Conflict` on oversell), and decrements stock atomically.
    """
    rate_limiter.check_rate_limit(request, "checkout", max_requests=10, window_seconds=60)

    if payload.payment_method == "b2b_invoice":
        tax_id_clean = (payload.company_tax_id or "").strip()
        if not HVHH_REGEX.match(tax_id_clean):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="B2B Tax Invoice requires a valid 8-digit Armenian Tax ID (ՀՎՀՀ).",
            )

    user_id = UUID(str(auth_user["sub"])) if auth_user and auth_user.get("sub") else None
    account_type = auth_user.get("account_type", "individual") if auth_user else "individual"
    is_b2b = account_type == "company" or payload.payment_method == "b2b_invoice"
    pricing_tier = "wholesale" if account_type == "company" else "retail"

    # Normalize requested items from payload or from persisted PostgreSQL Cart
    requested_items = list(payload.items or [])
    cart: Optional[Cart] = None
    if not requested_items:
        cart = await get_or_create_cart(db, user_id, x_session_token or "default-guest-session")
        if not cart.items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot checkout with an empty cart.",
            )

    # Aggregate requested quantities per product_id and lock rows deterministically
    target_product_ids = sorted(
        {item.product_id for item in requested_items}
        if requested_items
        else {ci.product_id for ci in (cart.items if cart else [])}
    )
    if not target_product_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot checkout with an empty cart.",
        )

    locked_products = (
        await db.execute(
            select(Product)
            .where(Product.id.in_(target_product_ids))
            .order_by(Product.id)
            .with_for_update()
        )
    ).scalars().all()
    prod_map: Dict[UUID, Product] = {p.id: p for p in locked_products}

    locked_inventory = (
        await db.execute(
            select(Inventory)
            .where(Inventory.product_id.in_(target_product_ids))
            .order_by(Inventory.product_id)
            .with_for_update()
        )
    ).scalars().all()
    inv_map: Dict[UUID, Inventory] = {inv.product_id: inv for inv in locked_inventory}

    order_id = uuid4()
    order_number = f"SURO-{int(time.time()) % 1000000:06d}"
    subtotal = Decimal("0.00")
    order_item_models: List[OrderItem] = []

    if requested_items:
        for req_item in requested_items:
            db_prod = prod_map.get(req_item.product_id)
            if db_prod is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Product {req_item.sku} not found in catalog.",
                )

            available_stock = int(db_prod.stock_quantity or 0)
            if not db_prod.is_active or available_stock < req_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Insufficient stock for '{db_prod.name}' (SKU: {db_prod.sku}). "
                        f"Requested {req_item.quantity}, available {available_stock}."
                    ),
                )

            # Atomically decrement stock on product and warehouse inventory
            db_prod.stock_quantity = available_stock - req_item.quantity
            inv_row = inv_map.get(db_prod.id)
            if inv_row is not None:
                inv_row.quantity_on_hand = max(0, int(inv_row.quantity_on_hand or 0) - req_item.quantity)

            unit_price = resolve_effective_price(db_prod, account_type)
            line_total = (unit_price * Decimal(req_item.quantity)).quantize(Decimal("0.01"))
            subtotal += line_total

            order_item_models.append(
                OrderItem(
                    id=uuid4(),
                    order_id=order_id,
                    product_id=db_prod.id,
                    sku_snapshot=db_prod.sku,
                    name_snapshot=db_prod.name,
                    unit_of_measure=db_prod.unit_of_measure or req_item.unit_of_measure,
                    pricing_tier=pricing_tier,
                    quantity=req_item.quantity,
                    unit_price=unit_price,
                    total_price=line_total,
                )
            )
    elif cart is not None:
        for ci in cart.items:
            db_prod = prod_map.get(ci.product_id)
            if db_prod is None:
                continue

            available_stock = int(db_prod.stock_quantity or 0)
            if not db_prod.is_active or available_stock < ci.quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Insufficient stock for '{db_prod.name}' (SKU: {db_prod.sku}). "
                        f"Requested {ci.quantity}, available {available_stock}."
                    ),
                )

            db_prod.stock_quantity = available_stock - ci.quantity
            inv_row = inv_map.get(db_prod.id)
            if inv_row is not None:
                inv_row.quantity_on_hand = max(0, int(inv_row.quantity_on_hand or 0) - ci.quantity)

            unit_price = resolve_effective_price(db_prod, account_type)
            line_total = (unit_price * Decimal(ci.quantity)).quantize(Decimal("0.01"))
            subtotal += line_total

            order_item_models.append(
                OrderItem(
                    id=uuid4(),
                    order_id=order_id,
                    product_id=db_prod.id,
                    sku_snapshot=db_prod.sku,
                    name_snapshot=db_prod.name,
                    unit_of_measure=db_prod.unit_of_measure or "հատ",
                    pricing_tier=pricing_tier,
                    quantity=ci.quantity,
                    unit_price=unit_price,
                    total_price=line_total,
                )
            )

    if not order_item_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot checkout with an empty cart.",
        )

    shipping_amount = (
        Decimal("0.00")
        if payload.delivery_method == "pickup" or subtotal >= FREE_SHIPPING_THRESHOLD_AMD
        else STANDARD_SHIPPING_COST_AMD
    )
    tax_amount = Decimal("0.00")
    total_amount = subtotal + shipping_amount + tax_amount

    payment_method_db = (
        "cash_on_delivery" if payload.payment_method == "cash" else payload.payment_method
    )
    address_json = {
        "recipient_name": payload.recipient_name.strip(),
        "phone": payload.phone.strip(),
        "city": payload.city.strip(),
        "address": payload.shipping_address.strip(),
        "zip_code": payload.zip_code.strip(),
        "delivery_method": payload.delivery_method,
    }

    new_order = Order(
        id=order_id,
        order_number=order_number,
        user_id=user_id,
        order_type="b2b" if is_b2b else "b2c",
        tax_id=(payload.company_tax_id or "").strip() or None,
        status="pending",
        currency="AMD",
        subtotal=subtotal,
        discount_amount=Decimal("0.00"),
        shipping_amount=shipping_amount,
        tax_amount=tax_amount,
        total_amount=total_amount,
        shipping_address=address_json,
        billing_address=address_json,
        payment_method=payment_method_db,
        payment_status="invoiced" if payment_method_db == "b2b_invoice" else "pending",
    )
    db.add(new_order)
    for oi in order_item_models:
        db.add(oi)

    # Clear persisted cart items if a DB cart exists for this user/session
    if user_id is not None or x_session_token:
        existing_cart = await get_or_create_cart(
            db, user_id, x_session_token or "default-guest-session"
        )
        await db.execute(delete(CartItem).where(CartItem.cart_id == existing_cart.id))

    await db.commit()

    return OrderConfirmationResponse(
        order_id=order_id,
        order_number=order_number,
        user_id=user_id,
        account_type=account_type,
        subtotal=float(subtotal),
        shipping_total=float(shipping_amount),
        tax_total=float(tax_amount),
        grand_total=float(total_amount),
        status="processing",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
