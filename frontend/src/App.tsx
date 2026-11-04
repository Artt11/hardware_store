import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { ProductCard } from './components/product/ProductCard';
import { FacetedFilter } from './components/product/FacetedFilter';
import { CartDrawer, CartItem } from './components/cart/CartDrawer';
import { ProductDetailModal } from './components/product/ProductDetailModal';
import { WishlistProvider } from './context/WishlistContext';
import { AuthProvider } from './context/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { UserDashboard } from './components/profile/UserDashboard';
import { Product, FilterState, FacetOption } from './types/product';
import { Sparkles, ArrowUpDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000/api/v1';

// Real seed fallback items from "Products Սուրո.xlsx" in case backend server is offline
const FALLBACK_SURO_CATALOG: Product[] = [
  {
    id: '253b27e4-49d0-5234-a359-18480c94f894',
    sku: '00001',
    name: 'Պտուտակ գիպսոկարդոնի մետաղի 3,5x25 (1000 հատ)',
    slug: 'product-00001',
    unit_of_measure: 'տուփ',
    category: 'Uncategorized',
    retail_price: 1000,
    wholesale_price: 0,
    barcode: '13515324',
    vat_applicable: true,
    discount_percent: 0,
    description: 'Պտուտակ գիպսոկարդոնի մետաղի 3,5x25 (1000 հատ)',
    image_url: null,
    is_active: true,
    brand: 'Սուրո',
    price: 1000,
    currency: 'AMD',
    inStock: true,
    stockQuantity: 25,
    ratingAverage: 4.9,
    ratingCount: 24,
    imageUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80',
    shortDescription: 'Կոդ: 00001 • Չափման միավոր: տուփ • Գծիկավոր կոդ: 13515324',
    specifications: {
      unit: 'տուփ',
      barcode: '13515324',
      atgaa_code: '3926',
    },
    isNew: true,
  },
  {
    id: 'a012d9e0-1b2c-5d3e-8f4a-112233445502',
    sku: '00002',
    name: 'Պտուտակ գիպսոկարդոնի մետաղի 3,5x35 (1000 հատ)',
    slug: 'product-00002',
    unit_of_measure: 'տուփ',
    category: 'Uncategorized',
    retail_price: 1500,
    wholesale_price: 0,
    barcode: '35512562',
    vat_applicable: true,
    discount_percent: 0,
    description: 'Պտուտակ գիպսոկարդոնի մետաղի 3,5x35 (1000 հատ)',
    image_url: null,
    is_active: true,
    brand: 'Սուրո',
    price: 1500,
    currency: 'AMD',
    inStock: true,
    stockQuantity: 25,
    ratingAverage: 4.8,
    ratingCount: 19,
    imageUrl: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=160&q=80',
    shortDescription: 'Կոդ: 00002 • Չափման միավոր: տուփ • Գծիկավոր կոդ: 35512562',
    specifications: {
      unit: 'տուփ',
      barcode: '35512562',
      atgaa_code: '7318',
    },
  },
  {
    id: 'b023e0f1-2c3d-5e4f-9a5b-223344556603',
    sku: '00003',
    name: 'Սիլիկոնե հերմետիկ սպիտակ 280մլ',
    slug: 'product-00003',
    unit_of_measure: 'հատ',
    category: 'Uncategorized',
    retail_price: 1200,
    wholesale_price: 0,
    barcode: '2000000003',
    vat_applicable: true,
    discount_percent: 0,
    description: 'Սիլիկոնե հերմետիկ սպիտակ 280մլ',
    image_url: null,
    is_active: true,
    brand: 'Սուրո',
    price: 1200,
    currency: 'AMD',
    inStock: true,
    stockQuantity: 25,
    ratingAverage: 4.85,
    ratingCount: 15,
    imageUrl: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=800&q=80',
    thumbnailUrl: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=160&q=80',
    shortDescription: 'Կոդ: 00003 • Չափման միավոր: հատ',
    specifications: {
      unit: 'հատ',
    },
  },
];

function mapApiItemToProduct(item: any): Product {
  const retailPrice =
    typeof item.retail_price === 'number'
      ? item.retail_price
      : typeof item.base_price === 'number'
      ? item.base_price
      : Number(item.price || 0);
  const wholesalePrice =
    typeof item.wholesale_price === 'number' ? item.wholesale_price : 0;
  const unit = item.unit_of_measure || 'հատ';
  const category = item.category || item.category_name || 'Uncategorized';
  const isActive = item.is_active !== undefined ? Boolean(item.is_active) : Boolean(item.in_stock ?? true);
  const fallbackImg =
    item.primary_image_url ||
    item.image_url ||
    item.imageUrl ||
    'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80';

  const specs: Record<string, string> = {
    ...(item.key_specs || item.specifications || {}),
    Չափման_միավոր: unit,
  };
  if (item.barcode) {
    specs['Գծիկավոր_կոդ'] = String(item.barcode);
  }

  return {
    id: String(item.id),
    sku: String(item.sku || ''),
    name: String(item.name || ''),
    slug: String(item.slug || `product-${item.sku}`),
    unit_of_measure: unit,
    category,
    retail_price: retailPrice,
    wholesale_price: wholesalePrice,
    barcode: item.barcode ? String(item.barcode) : null,
    vat_applicable: item.vat_applicable !== undefined ? Boolean(item.vat_applicable) : true,
    discount_percent: Number(item.discount_percent || 0),
    description: item.description || null,
    image_url: item.image_url || null,
    is_active: isActive,
    brand: item.brand_name || item.brand || 'Սուրո',
    price: retailPrice,
    compareAtPrice: item.compare_at_price ? Number(item.compare_at_price) : undefined,
    currency: item.currency || 'AMD',
    inStock: isActive && Number(item.stock_quantity ?? 25) > 0,
    stockQuantity: Number(item.stock_quantity ?? 25),
    ratingAverage: Number(item.rating_average ?? 4.8),
    ratingCount: Number(item.rating_count ?? 12),
    imageUrl: fallbackImg,
    thumbnailUrl: item.thumbnail_url || fallbackImg,
    shortDescription:
      item.description ||
      `Կոդ: ${item.sku} • Չափման միավոր: ${unit}${item.barcode ? ` • Գծիկավոր կոդ: ${item.barcode}` : ''}`,
    specifications: specs,
  };
}

export const AppContent: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(24);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [sortBy, setSortBy] = useState<string>('sku');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [apiCategories, setApiCategories] = useState<FacetOption[]>([]);
  const [apiUnits, setApiUnits] = useState<FacetOption[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);

  // Faceted Filter State
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedBrands: [],
    selectedCategories: [],
    priceRange: [0, 300000],
    inStockOnly: false,
    selectedVoltages: [], // Mapped to unit_of_measure facets (հատ, տուփ, կգ, մ, զույգ)
  });

  // Reset to page 1 when filters or sorting change
  useEffect(() => {
    setPage(1);
  }, [
    filters.searchQuery,
    filters.selectedCategories,
    filters.selectedVoltages,
    filters.priceRange,
    filters.inStockOnly,
    sortBy,
    sortOrder,
  ]);

  // Fetch products from GET /api/v1/products with pagination, filtering & sorting
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      params.set('sort_by', sortBy);
      params.set('sort_order', sortOrder);

      if (filters.searchQuery?.trim()) {
        params.set('q', filters.searchQuery.trim());
      }
      if (filters.selectedCategories.length > 0) {
        params.set('category', filters.selectedCategories.join(','));
      }
      if (filters.selectedVoltages.length > 0) {
        params.set('unit_of_measure', filters.selectedVoltages.join(','));
      }
      if (filters.priceRange[0] > 0) {
        params.set('min_price', String(filters.priceRange[0]));
      }
      if (filters.priceRange[1] < 300000) {
        params.set('max_price', String(filters.priceRange[1]));
      }
      if (filters.inStockOnly) {
        params.set('in_stock_only', 'true');
      }

      const response = await fetch(`${API_BASE_URL}/products?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      const data = await response.json();

      if (Array.isArray(data)) {
        const mapped = data.map(mapApiItemToProduct);
        setProducts(mapped);
        setTotalProducts(mapped.length);
        setTotalPages(1);
      } else {
        const mapped = (data.items || []).map(mapApiItemToProduct);
        setProducts(mapped);
        setTotalProducts(Number(data.total ?? mapped.length));
        setTotalPages(Number(data.total_pages ?? 1));
        if (Array.isArray(data.categories)) {
          setApiCategories(data.categories);
        }
        if (Array.isArray(data.units)) {
          setApiUnits(data.units);
        }
      }
    } catch (err) {
      // Fallback if backend isn't running
      setProducts(FALLBACK_SURO_CATALOG);
      setTotalProducts(FALLBACK_SURO_CATALOG.length);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Open product detail modal by ID (fetches from API if not in current page slice)
  const handleSelectProductById = async (productId: string) => {
    const existing = products.find((p) => p.id === productId || p.sku === productId);
    if (existing) {
      setSelectedProduct(existing);
      return;
    }
    try {
      const resp = await fetch(`${API_BASE_URL}/products/${encodeURIComponent(productId)}`);
      if (resp.ok) {
        const detail = await resp.json();
        setSelectedProduct(mapApiItemToProduct(detail));
      }
    } catch {
      // Ignore if offline
    }
  };

  // Dynamic Facets Calculation
  const brandFacets = useMemo<FacetOption[]>(() => {
    return [{ value: 'Սուրո', label: `Սուրո (${totalProducts || products.length})`, count: totalProducts || products.length }];
  }, [totalProducts, products.length]);

  const categoryFacets = useMemo<FacetOption[]>(() => {
    if (apiCategories.length > 0) return apiCategories;
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: `${value} (${count})`,
      count,
    }));
  }, [apiCategories, products]);

  const unitFacets = useMemo<FacetOption[]>(() => {
    if (apiUnits.length > 0) return apiUnits;
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      const u = p.unit_of_measure || 'հատ';
      counts[u] = (counts[u] || 0) + 1;
    });
    return Object.entries(counts).map(([value, count]) => ({
      value,
      label: `${value} (${count})`,
      count,
    }));
  }, [apiUnits, products]);

  // Cart operations
  const handleAddToCart = (product: Product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, quantity } : item))
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => setCartItems([]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0B0F17] flex flex-col font-sans">
      {/* Header with Elasticsearch / Catalog Autocomplete */}
      <Header
        cartCount={cartItems.reduce((s, i) => s + i.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenMobileFilters={() => setIsMobileFiltersOpen(true)}
        onSelectProduct={handleSelectProductById}
        onSearchSubmit={(q) => setFilters((f) => ({ ...f, searchQuery: q }))}
        onOpenDashboard={() => setIsDashboardOpen(true)}
      />

      {/* Main Content Stage */}
      <main className="mx-auto flex-1 w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Minimal Hero Header: Vast Whitespace */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-neutral-200/50 pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-800">
                <Sparkles className="h-3 w-3" />
                Antigravity Catalog • Սուրո
              </span>
              <span className="text-xs text-neutral-400 font-mono">PostgreSQL + Elasticsearch</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-neutral-900">
              Շինարարական Ապրանքներ և Գործիքներ
            </h1>
            <p className="mt-2 text-sm text-neutral-500 max-w-xl">
              Ամբողջական տեսականի ներմուծված «Products Սուրո.xlsx» բազայից՝ ակնթարթային որոնմամբ և Antigravity ինտերֆեյսով։
            </p>
          </div>

          {/* Results Count & Sorting Control */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
              <span>
                Ցուցադրված է <strong className="text-neutral-900">{products.length}</strong> /{' '}
                <strong className="text-neutral-900">{totalProducts.toLocaleString()}</strong> ապրանք
              </span>
              {filters.searchQuery && (
                <span className="text-neutral-900 font-semibold">
                  «{filters.searchQuery}»
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-neutral-200/60">
              <ArrowUpDown className="h-3.5 w-3.5 text-neutral-400" />
              <select
                aria-label="Sort products"
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split(':');
                  setSortBy(field);
                  setSortOrder(dir as 'asc' | 'desc');
                }}
                className="bg-transparent text-xs font-semibold text-neutral-800 outline-none cursor-pointer"
              >
                <option value="sku:asc">Կոդ (00001 → 01391)</option>
                <option value="sku:desc">Կոդ (01391 → 00001)</option>
                <option value="retail_price:asc">Մանրածախ գին՝ Աճող</option>
                <option value="retail_price:desc">Մանրածախ գին՝ Նվազող</option>
                <option value="name:asc">Անվանում (Ա → Ֆ)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Catalog Section with Sidebar Filters & Product Grid */}
        <div className="flex gap-8 items-start">
          {/* Dynamic Faceted Sidebar Filter */}
          <FacetedFilter
            filters={filters}
            onChange={setFilters}
            brandFacets={brandFacets}
            categoryFacets={categoryFacets}
            voltageFacets={unitFacets}
            isMobileOpen={isMobileFiltersOpen}
            onCloseMobile={() => setIsMobileFiltersOpen(false)}
            totalFilteredCount={totalProducts}
          />

          {/* Product Grid with Antigravity Hover Effect */}
          <section className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-16 text-center shadow-sm">
                <Loader2 className="h-7 w-7 animate-spin text-neutral-400 mb-3" />
                <p className="text-sm font-semibold text-neutral-800">Loading product catalog...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-12 text-center shadow-sm">
                <p className="text-sm font-semibold text-neutral-900">No products match your filters</p>
                <p className="mt-1 text-xs text-neutral-400">
                  Try adjusting the price range or resetting selected filters.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setFilters({
                      searchQuery: '',
                      selectedBrands: [],
                      selectedCategories: [],
                      priceRange: [0, 300000],
                      inStockOnly: false,
                      selectedVoltages: [],
                    })
                  }
                  className="mt-4 rounded-xl bg-black px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={handleAddToCart}
                      onQuickView={(p) => setSelectedProduct(p)}
                    />
                  ))}
                </div>

                {/* Pagination Bar */}
                {totalPages > 1 && (
                  <div className="mt-10 flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-neutral-200/50">
                    <span className="text-xs text-neutral-500 font-mono">
                      Էջ <strong className="text-neutral-900">{page}</strong> / {totalPages} ({totalProducts.toLocaleString()} ապրանք)
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => {
                          setPage((p) => Math.max(1, p - 1));
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        <span>Նախորդ</span>
                      </button>

                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => {
                          setPage((p) => Math.min(totalPages, p + 1));
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#0B0F17] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span>Հաջորդ</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      {/* Slide-over Cart Drawer with One-Page Guest Checkout */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
      />

      {/* Product Detail Modal (PDP) with Zoomable Gallery & Sticky Add-to-Cart */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      {/* Enterprise Auth Modal (B2C & B2B Dual Flow) */}
      <AuthModal />

      {/* Protected User Dashboard */}
      <UserDashboard
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        onAddToCart={handleAddToCart}
      />

      {/* Footer */}
      <footer className="mt-20 border-t border-neutral-200/60 bg-white py-12 text-xs text-neutral-400">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <p>© 2026 AuraTools Technologies • Սուրո Catalog. Minimalist Antigravity E-Commerce Architecture.</p>
          <div className="flex gap-6">
            <a href="#privacy" className="hover:text-black">Privacy</a>
            <a href="#terms" className="hover:text-black">Terms</a>
            <a href="#support" className="hover:text-black">Jobsite Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <WishlistProvider>
        <AppContent />
      </WishlistProvider>
    </AuthProvider>
  );
}
