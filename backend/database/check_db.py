#!/usr/bin/env python3
"""
AuraTools Database Inspector
Run directly from terminal to inspect tables and rows:
    ./store/bin/python backend/database/check_db.py
"""
import asyncio
import asyncpg
import json

DATABASE_URL = "postgresql://admin@localhost:5432/hardware_store"

async def check():
    print("=" * 70)
    print("  AURATOOLS DATABASE HEALTH & SCHEMA INSPECTION")
    print("=" * 70)
    
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print(f"[*] Connection: SUCCESS (Connected to {DATABASE_URL})")
    except Exception as e:
        print(f"[!] Connection FAILED: {e}")
        return

    try:
        # 1. List Tables
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """)
        print(f"\n[*] Tables in Database ({len(tables)}):")
        for t in tables:
            count = await conn.fetchval(f"SELECT count(*) FROM {t['table_name']};")
            print(f"    - {t['table_name']:<20} ({count} rows)")

        # 2. Inspect Users Table
        print("\n[*] Users Table (B2C & B2B Dual Accounts):")
        users = await conn.fetch("SELECT id, email, account_type, company_name, tax_id, role FROM users;")
        for u in users:
            acct_info = f"Company: {u['company_name']} (Tax ID: {u['tax_id']})" if u['account_type'] == 'company' else "Individual"
            print(f"    - [{u['account_type'].upper()}] {u['email']:<26} | {acct_info}")

        # 3. Inspect Products Table (First 15 rows from "Products Սուրո.xlsx")
        total_products = await conn.fetchval("SELECT COUNT(*) FROM products;")
        print(f"\n[*] Products Table (Showing first 15 of {total_products} rows):")
        products = await conn.fetch("""
            SELECT sku, name, unit_of_measure, category, retail_price, wholesale_price, barcode, is_active
            FROM products
            ORDER BY sku ASC
            LIMIT 15;
        """)
        for p in products:
            retail = float(p['retail_price'] or 0)
            unit = p['unit_of_measure'] or 'հատ'
            active_str = "Active" if p['is_active'] else "Closed"
            print(f"    - {p['sku']:<8} | {retail:>9,.0f} ֏ / {unit:<4} | {active_str:<6} | {p['name']}")

        # 4. Inspect Wishlists
        print("\n[*] Persistent Wishlist Items:")
        wishlist = await conn.fetch("""
            SELECT u.email, p.name, p.sku
            FROM wishlist_items wi
            JOIN wishlists w ON wi.wishlist_id = w.id
            JOIN users u ON w.user_id = u.id
            JOIN products p ON wi.product_id = p.id;
        """)
        for w in wishlist:
            print(f"    - User: {w['email']} saved '{w['name']}' (SKU: {w['sku']})")

    finally:
        await conn.close()
        print("\n" + "=" * 70)
        print("  INSPECTION COMPLETE")
        print("=" * 70)

if __name__ == "__main__":
    asyncio.run(check())
