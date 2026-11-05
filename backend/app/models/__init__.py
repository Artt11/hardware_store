"""
Central export of all SQLAlchemy ORM models so Alembic `Base.metadata`
automatically discovers every table and foreign key relationship.
"""

from app.models.base import Base
from app.models.cart import Cart, CartItem
from app.models.inventory import Inventory
from app.models.order import Order, OrderItem
from app.models.product import Category, Product, ProductVariant
from app.models.user import User
from app.models.wishlist import Wishlist, WishlistItem

__all__ = [
    "Base",
    "User",
    "Category",
    "Product",
    "ProductVariant",
    "Inventory",
    "Cart",
    "CartItem",
    "Wishlist",
    "WishlistItem",
    "Order",
    "OrderItem",
]
