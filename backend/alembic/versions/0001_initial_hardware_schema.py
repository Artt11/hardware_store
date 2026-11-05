"""Initial B2C/B2B Hardware E-Commerce Schema

Revision ID: 0001_initial_hardware_schema
Revises:
Create Date: 2026-11-04 20:05:00
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_hardware_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Users table (B2C & B2B accounts)
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("account_type", sa.String(length=20), server_default="individual", nullable=False),
        sa.Column("role", sa.String(length=20), server_default="customer", nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=True),
        sa.Column("last_name", sa.String(length=100), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("company_name", sa.String(length=150), nullable=True),
        sa.Column("tax_id", sa.String(length=50), nullable=True),
        sa.Column("company_registration_number", sa.String(length=64), nullable=True),
        sa.Column("contact_person", sa.String(length=100), nullable=True),
        sa.Column("credit_limit", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("payment_terms_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("trade_discount_tier", sa.Numeric(5, 2), server_default="0.00", nullable=False),
        sa.Column("token_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("failed_login_attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("account_type IN ('individual', 'company')", name="chk_users_account_type"),
        sa.CheckConstraint(
            "account_type = 'individual' OR (company_name IS NOT NULL AND tax_id IS NOT NULL)",
            name="chk_company_fields",
        ),
        if_not_exists=True,
    )

    # 2. Categories table
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        if_not_exists=True,
    )

    # 3. Products table
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sku", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("slug", sa.String(length=320), nullable=True, unique=True),
        sa.Column("unit_of_measure", sa.String(length=64), server_default="հատ", nullable=False),
        sa.Column("category", sa.String(length=150), server_default="Uncategorized", nullable=False),
        sa.Column("retail_price", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("wholesale_price", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("base_price", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("compare_at_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("discount_percent", sa.Numeric(5, 2), server_default="0.00", nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="AMD", nullable=False),
        sa.Column("barcode", sa.String(length=128), nullable=True),
        sa.Column("vat_applicable", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("stock_quantity", sa.Integer(), server_default="25", nullable=False),
        sa.Column("low_stock_threshold", sa.Integer(), server_default="5", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("specifications", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        if_not_exists=True,
    )

    # 4. Product Variants table
    op.create_table(
        "product_variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False, unique=True),
        sa.Column("variant_name", sa.String(length=255), nullable=False),
        sa.Column("barcode", sa.String(length=128), nullable=True),
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("retail_price", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("trade_price", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("compare_at_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("min_trade_order_qty", sa.Integer(), server_default="1", nullable=False),
        sa.Column("unit_of_measure", sa.String(length=64), server_default="հատ", nullable=False),
        sa.Column("weight_kg", sa.Numeric(8, 3), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        if_not_exists=True,
    )

    # 5. Inventory table
    op.create_table(
        "inventory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("warehouse_code", sa.String(length=32), server_default="EVN-MAIN", nullable=False),
        sa.Column("aisle_bin", sa.String(length=64), server_default="A-01-01", nullable=True),
        sa.Column("quantity_on_hand", sa.Integer(), server_default="0", nullable=False),
        sa.Column("quantity_reserved", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reorder_point", sa.Integer(), server_default="5", nullable=False),
        sa.Column("reorder_quantity", sa.Integer(), server_default="50", nullable=False),
        sa.Column("last_restocked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("product_id", "warehouse_code", name="uq_inventory_product_warehouse"),
        if_not_exists=True,
    )

    # 6. Orders & OrderItems tables
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("order_number", sa.String(length=32), nullable=False, unique=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("guest_email", sa.String(length=255), nullable=True),
        sa.Column("order_type", sa.String(length=20), server_default="b2c", nullable=False),
        sa.Column("company_name", sa.String(length=150), nullable=True),
        sa.Column("tax_id", sa.String(length=50), nullable=True),
        sa.Column("purchase_order_number", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="pending", nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="AMD", nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False),
        sa.Column("discount_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("shipping_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("tax_amount", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("shipping_address", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("billing_address", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("shipping_carrier", sa.String(length=50), nullable=True),
        sa.Column("tracking_number", sa.String(length=100), nullable=True),
        sa.Column("payment_method", sa.String(length=50), server_default="card", nullable=False),
        sa.Column("payment_status", sa.String(length=30), server_default="pending", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        if_not_exists=True,
    )

    op.create_table(
        "order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sku_snapshot", sa.String(length=64), nullable=False),
        sa.Column("name_snapshot", sa.String(length=500), nullable=False),
        sa.Column("unit_of_measure", sa.String(length=64), server_default="հատ", nullable=False),
        sa.Column("pricing_tier", sa.String(length=20), server_default="retail", nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table("order_items", if_exists=True)
    op.drop_table("orders", if_exists=True)
    op.drop_table("inventory", if_exists=True)
    op.drop_table("product_variants", if_exists=True)
    op.drop_table("products", if_exists=True)
    op.drop_table("categories", if_exists=True)
    op.drop_table("users", if_exists=True)

