import time
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Header, status, Depends
from typing import Optional
from uuid import UUID, uuid4

from app.schemas.cart import CartResponse, CartItemDetail, AddToCartRequest, UpdateCartItemRequest

router = APIRouter(prefix="/cart", tags=["Cart"])

# In-memory session mock cart for testing without external DB connection
_mock_cart = {
    "items": [
        CartItemDetail(
            id=UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            product_id=UUID("7f3e8f80-1a2b-4c5d-9e0f-112233445566"),
            name="M18 FUEL™ 1/2\" Hammer Drill/Driver Kit",
            slug="m18-fuel-hammer-drill-kit",
            sku="MIL-2904-22",
            thumbnail_url="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80",
            unit_price=299.00,
            quantity=1,
            line_total=299.00,
            stock_quantity=18,
            in_stock=True
        )
    ]
}

def calculate_totals(items):
    subtotal = sum(i.unit_price * i.quantity for i in items)
    tax_total = round(subtotal * 0.0825, 2)
    shipping_total = 0.00 if (subtotal >= 99.0 or subtotal == 0) else 9.99
    grand_total = round(subtotal + tax_total + shipping_total, 2)
    return subtotal, tax_total, shipping_total, grand_total

@router.get("", response_model=CartResponse)
async def get_cart(x_session_token: Optional[str] = Header(None)):
    """
    Retrieve current shopping cart items with automated tax and shipping calculations.
    """
    items = _mock_cart["items"]
    sub, tax, ship, grand = calculate_totals(items)
    return CartResponse(
        id=UUID("12345678-1234-5678-1234-567812345678"),
        session_token=x_session_token or "guest-session-token",
        items_count=sum(i.quantity for i in items),
        subtotal=sub,
        tax_total=tax,
        shipping_total=ship,
        grand_total=grand,
        items=items
    )

@router.post("/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
async def add_item_to_cart(payload: AddToCartRequest):
    """
    Add an item to the shopping cart.
    """
    # Check if already in cart
    existing = next((i for i in _mock_cart["items"] if i.product_id == payload.product_id), None)
    if existing:
        existing.quantity += payload.quantity
        existing.line_total = round(existing.quantity * existing.unit_price, 2)
    else:
        _mock_cart["items"].append(
            CartItemDetail(
                id=uuid4(),
                product_id=payload.product_id,
                name="Tool Item",
                slug="tool-item",
                sku="TL-001",
                thumbnail_url="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80",
                unit_price=149.00,
                quantity=payload.quantity,
                line_total=round(payload.quantity * 149.00, 2),
                stock_quantity=20,
                in_stock=True
            )
        )
    return await get_cart()

@router.delete("/items/{product_id}", response_model=CartResponse)
async def remove_item_from_cart(product_id: UUID):
    """
    Remove an item from the shopping cart.
    """
    _mock_cart["items"] = [i for i in _mock_cart["items"] if i.product_id != product_id]
    return await get_cart()

from app.core.security import get_current_user_payload
from app.core.middleware import rate_limiter
from starlette.requests import Request
from pydantic import BaseModel

class CheckoutOrderRequest(BaseModel):
    shipping_address: str
    zip_code: str
    payment_method: str = "card"

class OrderConfirmationResponse(BaseModel):
    order_id: UUID
    order_number: str
    user_id: UUID
    account_type: str
    subtotal: float
    shipping_total: float
    tax_total: float
    grand_total: float
    status: str
    created_at: str

@router.post("/checkout", response_model=OrderConfirmationResponse, status_code=status.HTTP_201_CREATED)
async def protected_checkout(
    payload: CheckoutOrderRequest,
    request: Request,
    auth_user: dict = Depends(get_current_user_payload)
):
    """
    Strictly Protected Checkout endpoint.
    Guest checkout is categorically disabled. Only authenticated B2C/B2B users may place orders.
    Enforces rate limiting to prevent automated checkout attacks.
    """
    # 1. Rate Limiting Protection on Checkout
    rate_limiter.check_rate_limit(request, "checkout", max_requests=10, window_seconds=60)
    
    items = _mock_cart["items"]
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot checkout with an empty cart.")
        
    sub, tax, ship, grand = calculate_totals(items)
    order_id = uuid4()
    order_num = f"AUR-{int(time.time())}"
    
    # Empties the cart upon confirmed purchase
    _mock_cart["items"] = []
    
    return OrderConfirmationResponse(
        order_id=order_id,
        order_number=order_num,
        user_id=UUID(auth_user["sub"]),
        account_type=auth_user.get("account_type", "individual"),
        subtotal=sub,
        shipping_total=ship,
        tax_total=tax,
        grand_total=grand,
        status="processing",
        created_at=datetime.now(timezone.utc).isoformat()
    )
