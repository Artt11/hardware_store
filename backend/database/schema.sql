-- ============================================================================
-- B2C / B2B HARDWARE & CONSTRUCTION E-COMMERCE PLATFORM
-- PostgreSQL 15+ Production Relational Schema (ARM64 Optimized)
-- ============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- 1. USERS (B2C Individual Customers & B2B Trade/Contractor Accounts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    -- B2C vs B2B Account Classification
    account_type VARCHAR(20) DEFAULT 'individual' NOT NULL CHECK (account_type IN ('individual', 'company')),
    role VARCHAR(20) DEFAULT 'customer' NOT NULL CHECK (role IN ('customer', 'b2b_contractor', 'b2b_wholesale', 'staff', 'admin')),

    -- Individual / Contact Details
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(30),

    -- B2B Company & Tax Details
    company_name VARCHAR(150),
    tax_id VARCHAR(50),                     -- Armenian HVHH (ՀՎՀՀ) / Tax Identification Number
    company_registration_number VARCHAR(64),
    contact_person VARCHAR(100),
    credit_limit NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (credit_limit >= 0),
    payment_terms_days INT DEFAULT 0 NOT NULL CHECK (payment_terms_days >= 0),
    trade_discount_tier NUMERIC(5, 2) DEFAULT 0.00 NOT NULL CHECK (trade_discount_tier BETWEEN 0 AND 100),

    -- Security & Session Management
    token_version INT DEFAULT 1 NOT NULL,
    failed_login_attempts INT DEFAULT 0 NOT NULL,
    locked_until TIMESTAMPTZ NULL,
    last_login_at TIMESTAMPTZ NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,

    -- Enforce company_name and tax_id for B2B company accounts
    CONSTRAINT chk_company_fields CHECK (
        account_type = 'individual' OR (company_name IS NOT NULL AND tax_id IS NOT NULL)
    )
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS company_registration_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    ADD COLUMN IF NOT EXISTS payment_terms_days INT DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS trade_discount_tier NUMERIC(5, 2) DEFAULT 0.00 NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_tax_id ON users(tax_id) WHERE tax_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES & BRANDS (Hierarchical Hardware Taxonomy)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(160) UNIQUE NOT NULL,
    description TEXT,
    icon_svg TEXT,
    display_order INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    logo_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brands_slug ON brands(slug);

-- ----------------------------------------------------------------------------
-- 3. PRODUCTS (Master Catalog + Armenian Excel Mapping)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,

    -- Core Catalog & Excel Mapping ("Products.xlsx" / "Products Սուրո.xlsx")
    sku VARCHAR(64) UNIQUE NOT NULL,                                                  -- "Կոդ"
    name VARCHAR(500) NOT NULL,                                                       -- "Անվանում" / "Լրիվ անվանում"
    unit_of_measure VARCHAR(64) DEFAULT 'հատ' NOT NULL,                               -- "Չափման միավոր" (տուփ, հատ, կգ, մ, զույգ)
    category VARCHAR(150) DEFAULT 'Uncategorized' NOT NULL,                           -- "Խումբ"
    retail_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (retail_price >= 0),      -- "Մանրածախ գին դրամով" (B2C Price)
    wholesale_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (wholesale_price >= 0),-- "Մեծածախ գին դրամով" (B2B Trade Price)
    barcode VARCHAR(128),                                                             -- "Գծիկավոր կոդ"
    vat_applicable BOOLEAN DEFAULT TRUE NOT NULL,                                     -- "ԱԱՀ"
    discount_percent NUMERIC(5, 2) DEFAULT 0.00 NOT NULL CHECK (discount_percent BETWEEN 0 AND 100), -- "Զեղչ (%)"
    description TEXT,                                                                 -- "Բնութագիր"
    image_url TEXT,                                                                   -- "Նկար"
    is_active BOOLEAN DEFAULT TRUE NOT NULL,                                          -- Derived from "Փակված"

    -- E-Commerce Storefront & Faceted Metadata
    slug VARCHAR(320) UNIQUE,
    short_description VARCHAR(500),
    base_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (base_price >= 0),
    compare_at_price NUMERIC(12, 2),
    currency VARCHAR(3) DEFAULT 'AMD' NOT NULL,
    stock_quantity INT DEFAULT 25 NOT NULL CHECK (stock_quantity >= 0),
    low_stock_threshold INT DEFAULT 5 NOT NULL,
    is_published BOOLEAN DEFAULT TRUE NOT NULL,
    weight_kg NUMERIC(8, 3),
    dimensions_cm JSONB,
    specifications JSONB DEFAULT '{}'::jsonb NOT NULL,

    -- Full-Text Search & Ratings
    search_vector tsvector,
    rating_average NUMERIC(3, 2) DEFAULT 4.80 CHECK (rating_average BETWEEN 0 AND 5),
    rating_count INT DEFAULT 12 CHECK (rating_count >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_category_name ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_retail_price ON products(retail_price);
CREATE INDEX IF NOT EXISTS idx_products_wholesale_price ON products(wholesale_price);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_published_stock ON products(is_published, stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_specs_gin ON products USING gin(specifications);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_products_category_lower ON products (LOWER(COALESCE(category, 'Uncategorized')));
CREATE INDEX IF NOT EXISTS idx_products_unit_lower ON products (LOWER(COALESCE(unit_of_measure, 'հատ')));
CREATE INDEX IF NOT EXISTS idx_products_sku_lower ON products (LOWER(sku));
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON products USING gin (sku gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 4. PRODUCT VARIANTS (JSONB Attributes, Retail vs. B2B Trade Pricing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(64) UNIQUE NOT NULL,
    variant_name VARCHAR(255) NOT NULL,
    barcode VARCHAR(128),

    -- Flexible hardware specifications (e.g., {"size": "M8x40mm", "voltage": "18V", "pack_size": 100, "finish": "Zinc"})
    attributes JSONB DEFAULT '{}'::jsonb NOT NULL,

    -- Dual B2C Retail & B2B Trade Pricing
    retail_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (retail_price >= 0),
    trade_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (trade_price >= 0),
    compare_at_price NUMERIC(12, 2),
    min_trade_order_qty INT DEFAULT 1 NOT NULL CHECK (min_trade_order_qty > 0),

    unit_of_measure VARCHAR(64) DEFAULT 'հատ' NOT NULL,
    weight_kg NUMERIC(8, 3),
    is_default BOOLEAN DEFAULT FALSE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_product_variants_retail_price ON product_variants(retail_price);
CREATE INDEX IF NOT EXISTS idx_product_variants_trade_price ON product_variants(trade_price);
CREATE INDEX IF NOT EXISTS idx_product_variants_attributes_gin ON product_variants USING gin(attributes);

-- ----------------------------------------------------------------------------
-- 5. INVENTORY (Warehouse Stock, Reserved Quantities & Reorder Thresholds)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,

    warehouse_code VARCHAR(32) DEFAULT 'EVN-MAIN' NOT NULL,
    aisle_bin VARCHAR(64) DEFAULT 'A-01-01',

    quantity_on_hand INT DEFAULT 0 NOT NULL CHECK (quantity_on_hand >= 0),
    quantity_reserved INT DEFAULT 0 NOT NULL CHECK (quantity_reserved >= 0),
    quantity_available INT GENERATED ALWAYS AS (GREATEST(quantity_on_hand - quantity_reserved, 0)) STORED,

    reorder_point INT DEFAULT 5 NOT NULL CHECK (reorder_point >= 0),
    reorder_quantity INT DEFAULT 50 NOT NULL CHECK (reorder_quantity > 0),

    last_restocked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT uq_inventory_product_warehouse UNIQUE (product_id, warehouse_code)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant_id ON inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_code);
CREATE INDEX IF NOT EXISTS idx_inventory_available ON inventory(quantity_available);

-- ----------------------------------------------------------------------------
-- 6. PRODUCT IMAGES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    alt_text VARCHAR(255),
    display_order INT DEFAULT 0 NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, display_order);

-- ----------------------------------------------------------------------------
-- 7. CARTS & WISHLISTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NULL,
    session_token VARCHAR(128) UNIQUE NULL,
    currency VARCHAR(3) DEFAULT 'AMD' NOT NULL,
    subtotal NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    tax_total NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    shipping_total NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    grand_total NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days') NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_cart_owner CHECK (user_id IS NOT NULL OR session_token IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_session ON carts(session_token);

CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES carts(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INT DEFAULT 1 NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_cart_product UNIQUE(cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

CREATE TABLE IF NOT EXISTS wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) DEFAULT 'Favorites' NOT NULL,
    is_default BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_user_default_wishlist UNIQUE (user_id, is_default)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);

CREATE TABLE IF NOT EXISTS wishlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_id UUID REFERENCES wishlists(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_wishlist_product UNIQUE (wishlist_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_product ON wishlist_items(product_id);

-- ----------------------------------------------------------------------------
-- 8. ORDERS & ORDER ITEMS (B2C Retail & B2B Trade Invoice Orders)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(32) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL NULL,
    guest_email CITEXT NULL,

    -- B2C vs B2B Order Metadata
    order_type VARCHAR(20) DEFAULT 'b2c' NOT NULL CHECK (order_type IN ('b2c', 'b2b')),
    company_name VARCHAR(150),
    tax_id VARCHAR(50),
    purchase_order_number VARCHAR(64),

    status VARCHAR(30) DEFAULT 'pending' NOT NULL CHECK (
        status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
    ),
    currency VARCHAR(3) DEFAULT 'AMD' NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (discount_amount >= 0),
    shipping_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (shipping_amount >= 0),
    tax_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (tax_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),

    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    shipping_carrier VARCHAR(50),
    tracking_number VARCHAR(100),

    payment_method VARCHAR(50) DEFAULT 'card' NOT NULL CHECK (
        payment_method IN ('card', 'idram', 'telcell', 'b2b_invoice', 'cash_on_delivery')
    ),
    payment_status VARCHAR(30) DEFAULT 'pending' NOT NULL CHECK (
        payment_status IN ('pending', 'captured', 'invoiced', 'failed', 'refunded')
    ),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) DEFAULT 'b2c' NOT NULL,
    ADD COLUMN IF NOT EXISTS company_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT NOT NULL,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    sku_snapshot VARCHAR(64) NOT NULL,
    name_snapshot VARCHAR(500) NOT NULL,
    unit_of_measure VARCHAR(64) DEFAULT 'հատ' NOT NULL,
    pricing_tier VARCHAR(20) DEFAULT 'retail' NOT NULL CHECK (pricing_tier IN ('retail', 'wholesale')),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(64) DEFAULT 'հատ' NOT NULL,
    ADD COLUMN IF NOT EXISTS pricing_tier VARCHAR(20) DEFAULT 'retail' NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- ----------------------------------------------------------------------------
-- 9. AUTOMATIC UPDATED_AT & FULL-TEXT SEARCH TRIGGERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_timestamp ON users;
CREATE TRIGGER trg_users_timestamp BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_categories_timestamp ON categories;
CREATE TRIGGER trg_categories_timestamp BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_products_timestamp ON products;
CREATE TRIGGER trg_products_timestamp BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_product_variants_timestamp ON product_variants;
CREATE TRIGGER trg_product_variants_timestamp BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_inventory_timestamp ON inventory;
CREATE TRIGGER trg_inventory_timestamp BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_carts_timestamp ON carts;
CREATE TRIGGER trg_carts_timestamp BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_wishlists_timestamp ON wishlists;
CREATE TRIGGER trg_wishlists_timestamp BEFORE UPDATE ON wishlists FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trg_orders_timestamp ON orders;
CREATE TRIGGER trg_orders_timestamp BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector =
        setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.sku, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.category, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_search_vector ON products;
CREATE TRIGGER trg_products_search_vector
BEFORE INSERT OR UPDATE OF name, sku, category, description ON products
FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();
