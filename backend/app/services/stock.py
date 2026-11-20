"""Stock lives in `inventory` (one row per product). Missing row means 0 in stock."""

from sqlalchemy import ScalarSelect, func, select

from app.models.inventory import Inventory
from app.models.product import Product


def available_stock() -> ScalarSelect[int]:
    """Correlated scalar subquery: sellable units for the enclosing Product row."""
    return (
        select(func.coalesce(func.max(Inventory.quantity_on_hand), 0))
        .where(Inventory.product_id == Product.id)
        .correlate(Product)
        .scalar_subquery()
    )
