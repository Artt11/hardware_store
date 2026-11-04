-- ============================================================================
-- MIGRATION 001: PRODUCTS TABLE SCHEMA FOR EXCEL CATALOG ("Products Սուրո.xlsx")
-- Module: Product Database Schema, Excel Data Migration & Frontend Rendering
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create or upgrade the Products table with direct Armenian Excel column mappings
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,

    -- Direct Excel Column Mappings ("Products Սուրո.xlsx", Header Row Index 1 / Row 2)
    sku VARCHAR(64) UNIQUE NOT NULL,                                  -- "Կոդ"
    name VARCHAR(500) NOT NULL,                                       -- "Անվանում" / "Լրիվ անվանում"
    unit_of_measure VARCHAR(64) DEFAULT 'հատ' NOT NULL,               -- "Չափման միավոր" (e.g., տուփ, հատ, կգ, մ, զույգ)
    category VARCHAR(150) DEFAULT 'Uncategorized' NOT NULL,           -- "Խումբ"
    retail_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (retail_price >= 0),      -- "Մանրածախ գին դրամով"
    wholesale_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (wholesale_price >= 0), -- "Մեծածախ գին դրամով"
    barcode VARCHAR(128),                                             -- "Գծիկավոր կոդ"
    vat_applicable BOOLEAN DEFAULT TRUE NOT NULL,                     -- "ԱԱՀ"
    discount_percent NUMERIC(5, 2) DEFAULT 0.00 NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100), -- "Զեղչ (%)"
    description TEXT,                                                 -- "Բնութագիր"
    image_url TEXT,                                                   -- "Նկար"
    is_active BOOLEAN DEFAULT TRUE NOT NULL,                          -- Derived from "Փակված" (If Փակված is False -> True)

    -- Storefront & Compatibility Metadata
    slug VARCHAR(320) UNIQUE,
    short_description VARCHAR(500),
    base_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL CHECK (base_price >= 0),
    compare_at_price NUMERIC(12, 2),
    currency VARCHAR(3) DEFAULT 'AMD' NOT NULL,
    stock_quantity INT DEFAULT 25 NOT NULL CHECK (stock_quantity >= 0),
    low_stock_threshold INT DEFAULT 5 NOT NULL,
    is_published BOOLEAN DEFAULT TRUE NOT NULL,
    weight_kg NUMERIC(6, 3),
    dimensions_cm JSONB,
    specifications JSONB DEFAULT '{}'::jsonb NOT NULL,
    search_vector tsvector,
    rating_average NUMERIC(3, 2) DEFAULT 4.80 CHECK (rating_average BETWEEN 0 AND 5),
    rating_count INT DEFAULT 12 CHECK (rating_count >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Idempotent ALTER statements if `products` table already existed from v1.0.0 schema
DROP TRIGGER IF EXISTS trg_products_search_vector ON products;
ALTER TABLE products ALTER COLUMN brand_id DROP NOT NULL;
ALTER TABLE products ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE products ALTER COLUMN slug DROP NOT NULL;
ALTER TABLE products ALTER COLUMN name TYPE VARCHAR(500);
ALTER TABLE products ALTER COLUMN base_price TYPE NUMERIC(12, 2);
ALTER TABLE products ALTER COLUMN compare_at_price TYPE NUMERIC(12, 2);
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_compare_at_price_check;

ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(64) DEFAULT 'հատ' NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(150) DEFAULT 'Uncategorized' NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12, 2) DEFAULT 0.00 NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(128);
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_applicable BOOLEAN DEFAULT TRUE NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) DEFAULT 0.00 NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;

-- Performance Indexes for Filtering, Sorting, and Search
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category_name ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_retail_price ON products(retail_price);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_unit_of_measure ON products(unit_of_measure);

-- Update Full-Text Search Trigger to support Armenian & multilingual tokens via 'simple' dictionary
CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector =
        setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.sku, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.barcode, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.category, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_search_vector ON products;
CREATE TRIGGER trg_products_search_vector
BEFORE INSERT OR UPDATE OF name, sku, barcode, category, description ON products
FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();
