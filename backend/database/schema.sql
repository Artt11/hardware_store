-- ============================================================================
-- HIGH-PERFORMANCE MINIMALIST HARDWARE & TOOL STORE
-- Relational PostgreSQL Schema (v1.0.0 Production-Ready)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ----------------------------------------------------------------------------
-- 1. USERS & AUTHENTICATION
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Dual Registration Flow (Individual B2C vs Company B2B)
    account_type VARCHAR(20) DEFAULT 'individual' NOT NULL CHECK (account_type IN ('individual', 'company')),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(150),
    tax_id VARCHAR(50),
    contact_person VARCHAR(100),
    phone VARCHAR(30),
    
    -- Enterprise Security & Session Invalidation
    token_version INT DEFAULT 1 NOT NULL, -- Incremented on logout/password change to revoke all active tokens
    failed_login_attempts INT DEFAULT 0 NOT NULL,
    locked_until TIMESTAMPTZ NULL,
    last_login_at TIMESTAMPTZ NULL,
    
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    role VARCHAR(20) DEFAULT 'customer' NOT NULL CHECK (role IN ('customer', 'admin', 'staff')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- B2B validation constraint: Company accounts must have company_name and tax_id
    CONSTRAINT chk_company_fields CHECK (
        account_type = 'individual' OR (company_name IS NOT NULL AND tax_id IS NOT NULL)
    )
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_account_type ON users(account_type);

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES & BRANDS
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    icon_svg TEXT,
    display_order INT DEFAULT 0 NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);

CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    logo_url TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_brands_slug ON brands(slug);

-- ----------------------------------------------------------------------------
-- 3. PRODUCTS & VARIANTS
-- Direct mapping for Armenian Excel catalog ("Products Սուրո.xlsx") + E-Commerce metadata
-- ----------------------------------------------------------------------------
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    
    -- Core Excel Catalog Fields ("Products Սուրո.xlsx")
    sku VARCHAR(64) UNIQUE NOT NULL,                                  -- "Կոդ"
    name VARCHAR(500) NOT NULL,                                       -- "Անվանում" / "Լրիվ անվանում"
    unit_of_measure VARCHAR(64) DEFAULT 'հատ' NOT NULL,               -- "Չափման միավոր" (e.g., տուփ, հատ)
    category VARCHAR(150) DEFAULT 'Uncategorized' NOT NULL,           -- "Խումբ"
    retail_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (retail_price >= 0),      -- "Մանրածախ գին դրամով"
    wholesale_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (wholesale_price >= 0), -- "Մեծածախ գին դրամով"
    barcode VARCHAR(128),                                             -- "Գծիկավոր կոդ"
    vat_applicable BOOLEAN DEFAULT TRUE NOT NULL,                     -- "ԱԱՀ"
    discount_percent NUMERIC(5, 2) DEFAULT 0.00 NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100), -- "Զեղչ (%)"
    description TEXT,                                                 -- "Բնութագիր"
    image_url TEXT,                                                   -- "Նկար"
    is_active BOOLEAN DEFAULT TRUE NOT NULL,                          -- Derived from "Փակված" (If Փակված is False -> True)

    -- Storefront & Faceted Metadata
    slug VARCHAR(320) UNIQUE,
    short_description VARCHAR(500),
    base_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (base_price >= 0),
    compare_at_price NUMERIC(12, 2),
    currency VARCHAR(3) DEFAULT 'AMD' NOT NULL,
    stock_quantity INT DEFAULT 25 NOT NULL CHECK (stock_quantity >= 0),
    low_stock_threshold INT DEFAULT 5 NOT NULL,
    is_published BOOLEAN DEFAULT TRUE NOT NULL,
    weight_kg NUMERIC(6, 3),
    dimensions_cm JSONB, -- {"length": 25.4, "width": 10.2, "height": 8.0}
    
    -- Technical faceted specs stored as JSONB for dynamic faceted filtering
    specifications JSONB DEFAULT '{}'::jsonb NOT NULL,
    
    -- Search & metadata
    search_vector tsvector,
    rating_average NUMERIC(3, 2) DEFAULT 4.80 CHECK (rating_average BETWEEN 0 AND 5),
    rating_count INT DEFAULT 12 CHECK (rating_count >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_category_name ON products(category);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_price ON products(base_price);
CREATE INDEX idx_products_retail_price ON products(retail_price);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_published_stock ON products(is_published, stock_quantity);
CREATE INDEX idx_products_specs_gin ON products USING gin(specifications);
CREATE INDEX idx_products_search ON products USING gin(search_vector);

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    alt_text VARCHAR(255),
    display_order INT DEFAULT 0 NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_product_images_product ON product_images(product_id, display_order);

-- ----------------------------------------------------------------------------
-- 4. CARTS & CART ITEMS
-- Supports both authenticated users and anonymous guest sessions via session_token
-- ----------------------------------------------------------------------------
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NULL,
    session_token VARCHAR(128) UNIQUE NULL, -- Guest cart persistent cookie token
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    subtotal NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    tax_total NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    shipping_total NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    grand_total NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days') NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_cart_owner CHECK (user_id IS NOT NULL OR session_token IS NOT NULL)
);

CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_session ON carts(session_token);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID REFERENCES carts(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    quantity INT DEFAULT 1 NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_cart_product UNIQUE(cart_id, product_id)
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

-- ----------------------------------------------------------------------------
-- 5. WISHLISTS & WISHLIST ITEMS
-- Fast lookup and synchronization from client LocalStorage
-- ----------------------------------------------------------------------------
CREATE TABLE wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) DEFAULT 'Favorites' NOT NULL,
    is_default BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_user_default_wishlist UNIQUE (user_id, is_default)
);

CREATE INDEX idx_wishlists_user ON wishlists(user_id);

CREATE TABLE wishlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_id UUID REFERENCES wishlists(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_wishlist_product UNIQUE (wishlist_id, product_id)
);

CREATE INDEX idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);
CREATE INDEX idx_wishlist_items_product ON wishlist_items(product_id);

-- ----------------------------------------------------------------------------
-- 6. ORDERS & ORDER ITEMS (Guest & Authenticated)
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(32) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL NULL,
    guest_email CITEXT NULL,
    status VARCHAR(30) DEFAULT 'pending' NOT NULL CHECK (
        status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
    ),
    currency VARCHAR(3) DEFAULT 'USD' NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    shipping_amount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    tax_amount NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    shipping_address JSONB NOT NULL,
    billing_address JSONB NOT NULL,
    shipping_carrier VARCHAR(50),
    tracking_number VARCHAR(100),
    payment_method VARCHAR(50) DEFAULT 'card' NOT NULL,
    payment_status VARCHAR(30) DEFAULT 'pending' NOT NULL CHECK (
        payment_status IN ('pending', 'captured', 'failed', 'refunded')
    ),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT NOT NULL,
    sku_snapshot VARCHAR(64) NOT NULL,
    name_snapshot VARCHAR(255) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ----------------------------------------------------------------------------
-- 7. AUTOMATIC TIMESTAMP TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_timestamp BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_categories_timestamp BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_products_timestamp BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_carts_timestamp BEFORE UPDATE ON carts FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_wishlists_timestamp BEFORE UPDATE ON wishlists FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_orders_timestamp BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ----------------------------------------------------------------------------
-- 8. PRODUCT FULL-TEXT SEARCH VECTOR SYNC TRIGGER
-- (Acts as a database fallback if Elasticsearch is temporarily syncing)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector = 
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.sku, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.short_description, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_search_vector 
BEFORE INSERT OR UPDATE OF name, sku, short_description, description ON products 
FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();
