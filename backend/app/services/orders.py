"""Order history. Users only ever see their own orders (lookup is scoped by user_id,
so another user's order number returns 404, not 403: no existence leak)."""

import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Order
from app.schemas.commerce import OrderDetail, OrderPage, OrderSummary


async def list_orders(db: AsyncSession, user_id: uuid.UUID, *, page: int, page_size: int) -> OrderPage:
    total = await db.scalar(select(func.count()).select_from(Order).where(Order.user_id == user_id)) or 0
    orders = await db.scalars(
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(desc(Order.created_at), desc(Order.order_number))
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return OrderPage(
        items=[OrderSummary.model_validate(o) for o in orders],
        page=page,
        page_size=page_size,
        total_items=total,
    )


async def get_order(db: AsyncSession, user_id: uuid.UUID, order_number: str) -> OrderDetail | None:
    order = await db.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.user_id == user_id, Order.order_number == order_number)
    )
    return OrderDetail.model_validate(order) if order else None
