-- ============================================================================
-- SEED DATA: BRANDS, CATEGORIES, PRODUCTS & USERS
-- ============================================================================

-- 1. Insert Brands
INSERT INTO brands (id, name, slug, description) VALUES
('b1111111-1111-1111-1111-111111111111', 'Milwaukee', 'milwaukee', 'Heavy-duty professional power tools'),
('b2222222-2222-2222-2222-222222222222', 'DEWALT', 'dewalt', 'Guaranteed tough jobsite equipment'),
('b3333333-3333-3333-3333-333333333333', 'Makita', 'makita', 'Precision cordless tools and technology'),
('b4444444-4444-4444-4444-444444444444', 'Bosch', 'bosch', 'German engineering and stationary equipment'),
('b5555555-5555-5555-5555-555555555555', 'Stiletto', 'stiletto', 'Precision titanium framing hammers')
ON CONFLICT (slug) DO NOTHING;

-- 2. Insert Categories
INSERT INTO categories (id, name, slug, description, display_order) VALUES
('c1111111-1111-1111-1111-111111111111', 'Power Tools', 'power-tools', 'Cordless and corded jobsite tools', 1),
('c2222222-2222-2222-2222-222222222222', 'Hand Tools', 'hand-tools', 'Precision manual hammers and drivers', 2),
('c3333333-3333-3333-3333-333333333333', 'Stationary Tools', 'stationary-tools', 'Miter saws and bench equipment', 3)
ON CONFLICT (slug) DO NOTHING;

-- 3. Insert Users (B2C Individual & B2B Company)
INSERT INTO users (
    id, email, password_hash, account_type, first_name, last_name, company_name, tax_id, contact_person, role
) VALUES
(
    '11111111-2222-3333-4444-555555555555',
    'admin@auratools.com',
    '$2b$12$7k8m1u6cMlhQ7Y0f9uG7yeYhL3qXlFk4tPqP/H/Z2M/zP9V6H3sWy',
    'individual',
    'Alexander',
    'Vance',
    NULL,
    NULL,
    NULL,
    'admin'
),
(
    '22222222-3333-4444-5555-666666666666',
    'contractor@buildcorp.com',
    '$2b$12$7k8m1u6cMlhQ7Y0f9uG7yeYhL3qXlFk4tPqP/H/Z2M/zP9V6H3sWy',
    'company',
    NULL,
    NULL,
    'Apex Construction Corp',
    'US-EIN-94-2849104',
    'Marcus Brody',
    'customer'
)
ON CONFLICT (email) DO NOTHING;

-- 4. Insert Products with JSONB Specifications
INSERT INTO products (
    id, brand_id, category_id, sku, name, slug, short_description,
    base_price, compare_at_price, stock_quantity, specifications
) VALUES
(
    '7f3e8f80-1a2b-4c5d-9e0f-112233445566',
    'b1111111-1111-1111-1111-111111111111',
    'c1111111-1111-1111-1111-111111111111',
    'MIL-2904-22',
    'M18 FUEL™ 1/2" Hammer Drill/Driver Kit',
    'm18-fuel-hammer-drill-kit',
    'Delivers up to 1,400 in-lbs of torque with AutoStop Control.',
    299.00,
    349.00,
    18,
    '{"voltage": "18V", "motor_type": "Brushless", "chuck_size": "1/2 in", "power_source": "Cordless"}'::jsonb
),
(
    '8a4e9f91-2b3c-4d5e-af10-223344556677',
    'b2222222-2222-2222-2222-222222222222',
    'c1111111-1111-1111-1111-111111111111',
    'DCF887B',
    '20V MAX* XR Brushless 3-Speed Impact Driver',
    'dewalt-20v-max-xr-impact-driver',
    'Compact 3-speed brushless driver delivering 1,825 in-lbs torque.',
    149.00,
    179.00,
    34,
    '{"voltage": "20V Max", "motor_type": "Brushless", "max_torque": "1,825 in-lbs", "power_source": "Cordless"}'::jsonb
),
(
    '9b5f0a02-3c4d-5e6f-b021-334455667788',
    'b5555555-5555-5555-5555-555555555555',
    'c2222222-2222-2222-2222-222222222222',
    'STL-TI16MS',
    'Titanium 16 oz. Smooth Face Fiberglass Hammer',
    'stiletto-titanium-16oz-hammer',
    'Strikes like a 28 oz steel hammer with 45% less weight.',
    119.50,
    NULL,
    12,
    '{"material": "Solid Titanium Head", "handle": "Fiberglass", "weight": "16 oz", "power_source": "Manual"}'::jsonb
),
(
    'ac601b13-4d5e-6f70-c132-445566778899',
    'b4444444-4444-4444-4444-444444444444',
    'c3333333-3333-3333-3333-333333333333',
    'GCM12SD',
    '12" Dual-Bevel Sliding Compound Miter Saw',
    'bosch-12-dual-bevel-miter-saw',
    'Axial-Glide system for smooth cuts and zero back-clearance.',
    649.00,
    699.00,
    5,
    '{"voltage": "120V Corded", "blade_diameter": "12 in", "no_load_rpm": "3,800 RPM", "power_source": "Corded"}'::jsonb
)
ON CONFLICT (sku) DO NOTHING;

-- 5. Insert Wishlist Item for Admin User
INSERT INTO wishlists (id, user_id, name, is_default) VALUES
('ea111111-1111-1111-1111-111111111111', '11111111-2222-3333-4444-555555555555', 'Favorites', TRUE)
ON CONFLICT (user_id, is_default) DO NOTHING;

INSERT INTO wishlist_items (wishlist_id, product_id) VALUES
('ea111111-1111-1111-1111-111111111111', '7f3e8f80-1a2b-4c5d-9e0f-112233445566')
ON CONFLICT (wishlist_id, product_id) DO NOTHING;
