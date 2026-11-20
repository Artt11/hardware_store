/**
 * Types mirroring the backend schemas (backend/app/schemas/*.py).
 * Money arrives as decimal strings ("4500.00"); use `toAmount` / `formatAmd` to display.
 */

export type Money = string;

export interface CategoryRef {
  slug: string;
  name: string;
}

export interface ProductSummary {
  id: string;
  sku: string;
  slug: string;
  name: string;
  name_ru: string | null;
  name_en: string | null;
  unit_of_measure: string;
  category: CategoryRef;
  price: Money;
  pricing_tier: 'retail' | 'wholesale';
  retail_price: Money;
  compare_at_price: Money | null;
  currency: string;
  image_url: string | null;
  in_stock: boolean;
  available_quantity: number;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  barcode: string | null;
  vat_applicable: boolean;
  specifications: Record<string, unknown>;
}

export interface CategoryFacet {
  slug: string;
  name: string;
  count: number;
}

export interface ProductPage {
  items: ProductSummary[];
  pagination: { page: number; page_size: number; total_items: number; total_pages: number };
  facets: {
    categories: CategoryFacet[];
    units: { value: string; count: number }[];
    price_range: { min: Money | null; max: Money | null };
  };
}

export type SortOption = 'relevance' | 'featured' | 'price_asc' | 'price_desc' | 'name' | 'newest';

export interface CatalogFilters {
  lang?: 'hy' | 'ru' | 'en';
  q?: string;
  category?: string[];
  unit?: string[];
  min_price?: string;
  max_price?: string;
  in_stock?: boolean;
  sort?: SortOption;
  page?: number;
  page_size?: number;
}

export interface AutocompleteHit {
  id: string;
  sku: string;
  slug: string;
  name: string;
  name_ru: string | null;
  name_en: string | null;
  price: Money;
  unit_of_measure: string;
  image_url: string | null;
  in_stock: boolean;
  highlight: string;
}

export interface UserProfile {
  id: string;
  email: string;
  account_type: 'individual' | 'company';
  role: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_name: string | null;
  tax_id: string | null;
  contact_person: string | null;
  is_verified: boolean;
  is_b2b: boolean;
  created_at: string;
}

export interface RegisterPayload {
  account_type: 'individual' | 'company';
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  company_name?: string;
  tax_id?: string;
  contact_person?: string;
}

export interface CartItem {
  product_id: string;
  sku: string;
  slug: string;
  name: string;
  name_ru: string | null;
  name_en: string | null;
  unit_of_measure: string;
  image_url: string | null;
  unit_price: Money;
  pricing_tier: 'retail' | 'wholesale';
  quantity: number;
  line_total: Money;
  available_quantity: number;
  is_available: boolean;
}

export interface Cart {
  items: CartItem[];
  item_count: number;
  subtotal: Money;
  shipping_estimate: Money;
  free_shipping_threshold: Money;
  amount_to_free_shipping: Money;
  currency: string;
}

export type DeliveryMethod = 'express' | 'pickup';
export type PaymentMethod = 'card' | 'cash_on_delivery' | 'b2b_invoice';

export interface CheckoutPayload {
  delivery_method: DeliveryMethod;
  payment_method: PaymentMethod;
  customer: { name: string; phone: string; email?: string };
  shipping_address?: { city: string; address: string; postal_code?: string };
  notes?: string;
}

export interface OrderItem {
  product_id: string;
  sku_snapshot: string;
  name_snapshot: string;
  unit_of_measure: string;
  pricing_tier: string;
  quantity: number;
  unit_price: Money;
  line_total: Money;
}

export interface OrderSummary {
  order_number: string;
  status: string;
  order_type: 'b2c' | 'b2b';
  payment_method: PaymentMethod;
  payment_status: string;
  delivery_method: DeliveryMethod;
  subtotal: Money;
  shipping_amount: Money;
  total_amount: Money;
  currency: string;
  created_at: string;
}

export interface OrderDetail extends OrderSummary {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  company_name: string | null;
  tax_id: string | null;
  payment_due_at: string | null;
  shipping_address: Record<string, string | null> | null;
  notes: string | null;
  items: OrderItem[];
}

export interface OrderPage {
  items: OrderSummary[];
  page: number;
  page_size: number;
  total_items: number;
}

export interface StockShortage {
  product_id: string;
  sku: string;
  name: string;
  requested: number;
  available: number;
}

export interface WishlistItem {
  product_id: string;
  sku: string;
  slug: string;
  name: string;
  name_ru: string | null;
  name_en: string | null;
  unit_of_measure: string;
  /** Viewer's price: wholesale for verified companies when available. */
  price: Money;
  pricing_tier: 'retail' | 'wholesale';
  retail_price: Money;
  currency: string;
  image_url: string | null;
  in_stock: boolean;
  available_quantity: number;
  added_at: string;
}

export const toAmount = (value: Money | null | undefined): number => Number(value ?? 0);
