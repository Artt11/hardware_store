'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { Catalog } from './components/product/Catalog';
import { FacetedFilter } from './components/product/FacetedFilter';
import { CartDrawer, CartItem } from './components/cart/CartDrawer';
import { ProductDetailModal } from './components/product/ProductDetailModal';
import { WishlistProvider } from './context/WishlistContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { AuthModal } from './components/auth/AuthModal';
import { UserDashboard } from './components/profile/UserDashboard';
import { getHighResFallbackImage } from './components/product/ProductCard';
import { Product, FilterState, FacetOption } from './types/product';
import { API_BASE_URL, getEffectiveUnitPrice } from './config/api';

const BATCH_LIMIT = 36;
const CART_STORAGE_KEY = 'suro_cart_v1';

export function mapApiItemToProduct(item: any): Product {
  const sku = String(item.sku || '');
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
  const isActive =
    item.is_active !== undefined ? Boolean(item.is_active) : Boolean(item.in_stock ?? true);

  const fallbackImg = getHighResFallbackImage(sku);
  const resolvedImage =
    item.primary_image_url || item.image_url || item.imageUrl || fallbackImg;

  const specs: Record<string, string> = {
    ...(item.key_specs || item.specifications || {}),
    Չափման_միավոր: unit,
  };
  if (item.barcode) {
    specs['Գծիկավոր_կոդ'] = String(item.barcode);
  }

  return {
    id: String(item.id),
    sku,
    name: String(item.name || ''),
    slug: String(item.slug || `product-${sku}`),
    unit_of_measure: unit,
    category,
    retail_price: retailPrice,
    wholesale_price: wholesalePrice,
    barcode: item.barcode ? String(item.barcode) : null,
    vat_applicable: item.vat_applicable !== undefined ? Boolean(item.vat_applicable) : true,
    discount_percent: Number(item.discount_percent || 0),
    description: item.description || null,
    image_url: resolvedImage,
    is_active: isActive,
    brand: item.brand_name || item.brand || 'Սուրո',
    price: retailPrice,
    compareAtPrice: item.compare_at_price ? Number(item.compare_at_price) : undefined,
    currency: item.currency || 'AMD',
    inStock: isActive && Number(item.stock_quantity ?? 25) > 0,
    stockQuantity: Number(item.stock_quantity ?? 25),
    ratingAverage: Number(item.rating_average ?? 4.8),
    ratingCount: Number(item.rating_count ?? 12),
    imageUrl: resolvedImage,
    thumbnailUrl: item.thumbnail_url || resolvedImage,
    shortDescription:
      item.description ||
      `Կոդ: ${sku} • Չափման միավոր: ${unit}${
        item.barcode ? ` • Գծիկավոր կոդ: ${item.barcode}` : ''
      }`,
    specifications: specs,
  };
}

export const AppContent: React.FC = () => {
  const { user, openAuthModal, isAuthModalOpen } = useAuth();
  const { t } = useLanguage();

  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<string>('sku');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [apiCategories, setApiCategories] = useState<FacetOption[]>([]);
  const [apiUnits, setApiUnits] = useState<FacetOption[]>([]);
  const localCatalogCacheRef = useRef<Product[] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);

  // BUG-05 Fix: Initialize cartItems from localStorage so cart survives page reloads
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore malformed storage
    }
    return [];
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // Ignore quota errors
    }
  }, [cartItems]);

  // BUG-07 Fix: Lock background body scroll when any drawer or modal is open
  useEffect(() => {
    const anyOverlayOpen =
      isMobileFiltersOpen ||
      isCartOpen ||
      Boolean(selectedProduct) ||
      isDashboardOpen ||
      isAuthModalOpen;
    document.body.style.overflow = anyOverlayOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileFiltersOpen, isCartOpen, selectedProduct, isDashboardOpen, isAuthModalOpen]);

  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedBrands: [],
    selectedCategories: [],
    priceRange: [0, 300000],
    inStockOnly: false,
    selectedVoltages: [],
  });

  const loadLocalFullSnapshot = useCallback(async (): Promise<Product[]> => {
    if (localCatalogCacheRef.current) {
      return localCatalogCacheRef.current;
    }
    const resp = await fetch('/products_catalog.json');
    if (!resp.ok) {
      return [];
    }
    const raw = await resp.json();
    const mapped = Array.isArray(raw) ? raw.map(mapApiItemToProduct) : [];
    localCatalogCacheRef.current = mapped;
    return mapped;
  }, []);

  // BUG-09 Fix: AbortController support to cancel in-flight requests and prevent race conditions
  const fetchCatalogSlice = useCallback(
    async (currentOffset: number, append: boolean, signal?: AbortSignal) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set('limit', String(BATCH_LIMIT));
        params.set('offset', String(currentOffset));
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

        const response = await fetch(`${API_BASE_URL}/products?${params.toString()}`, {
          signal,
        });
        if (!response.ok) {
          throw new Error(`API status ${response.status}`);
        }
        const data = await response.json();
        if (signal?.aborted) return;

        const mapped: Product[] = (Array.isArray(data) ? data : data.items || []).map(
          mapApiItemToProduct
        );
        const total = Number(data.total ?? mapped.length);

        setProducts((prev) => (append ? [...prev, ...mapped] : mapped));
        setTotalProducts(total);
        setOffset(currentOffset + mapped.length);
        setHasMore(Boolean(data.has_more ?? currentOffset + mapped.length < total));

        if (Array.isArray(data.categories)) {
          setApiCategories(data.categories);
        }
        if (Array.isArray(data.units)) {
          setApiUnits(data.units);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || signal?.aborted) {
          return;
        }
        const allLocal = await loadLocalFullSnapshot();
        if (signal?.aborted) return;

        const catCounts: Record<string, number> = {};
        const unitCounts: Record<string, number> = {};
        allLocal.forEach((p) => {
          catCounts[p.category] = (catCounts[p.category] || 0) + 1;
          unitCounts[p.unit_of_measure] = (unitCounts[p.unit_of_measure] || 0) + 1;
        });
        setApiCategories(
          Object.entries(catCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([value, count]) => ({ value, label: `${value} (${count})`, count }))
        );
        setApiUnits(
          Object.entries(unitCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([value, count]) => ({ value, label: `${value} (${count})`, count }))
        );

        const q = (filters.searchQuery || '').trim().toLowerCase();
        const filtered = allLocal.filter((p) => {
          if (filters.inStockOnly && !p.inStock) return false;
          if (
            filters.selectedCategories.length > 0 &&
            !filters.selectedCategories.includes(p.category)
          ) {
            return false;
          }
          if (
            filters.selectedVoltages.length > 0 &&
            !filters.selectedVoltages.includes(p.unit_of_measure)
          ) {
            return false;
          }
          if (p.retail_price < filters.priceRange[0]) return false;
          if (filters.priceRange[1] < 300000 && p.retail_price > filters.priceRange[1]) {
            return false;
          }
          if (
            q &&
            !p.name.toLowerCase().includes(q) &&
            !p.sku.toLowerCase().includes(q) &&
            !(p.barcode || '').toLowerCase().includes(q)
          ) {
            return false;
          }
          return true;
        });

        const dir = sortOrder === 'desc' ? -1 : 1;
        filtered.sort((a, b) => {
          if (sortBy === 'retail_price') return (a.retail_price - b.retail_price) * dir;
          if (sortBy === 'name') return a.name.localeCompare(b.name) * dir;
          return a.sku.localeCompare(b.sku) * dir;
        });

        const slice = filtered.slice(currentOffset, currentOffset + BATCH_LIMIT);
        setProducts((prev) => (append ? [...prev, ...slice] : slice));
        setTotalProducts(filtered.length);
        setOffset(currentOffset + slice.length);
        setHasMore(currentOffset + slice.length < filtered.length);
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [filters, sortBy, sortOrder, loadLocalFullSnapshot]
  );

  // BUG-09 Fix: Debounce filter changes by 200ms and abort any previous in-flight request
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      fetchCatalogSlice(0, false, controller.signal);
    }, 200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [fetchCatalogSlice]);

  const handleLoadMore = useCallback(() => {
    if (!isLoading && !isLoadingMore && hasMore) {
      fetchCatalogSlice(offset, true);
    }
  }, [isLoading, isLoadingMore, hasMore, offset, fetchCatalogSlice]);

  const handleResetFilters = useCallback(() => {
    setFilters({
      searchQuery: '',
      selectedBrands: [],
      selectedCategories: [],
      priceRange: [0, 300000],
      inStockOnly: false,
      selectedVoltages: [],
    });
  }, []);

  const handleToggleCategory = useCallback((category: string) => {
    setFilters((prev) => {
      const exists = prev.selectedCategories.includes(category);
      const next = exists
        ? prev.selectedCategories.filter((c) => c !== category)
        : [category];
      return { ...prev, selectedCategories: next };
    });
  }, []);

  const handleSelectSingleCategory = useCallback((category: string | null) => {
    setFilters((prev) => ({
      ...prev,
      selectedCategories: category ? [category] : [],
    }));
  }, []);

  const handleSelectProductById = useCallback(
    async (productId: string) => {
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
          return;
        }
      } catch {
        // Fallback to local snapshot
      }
      const allLocal = await loadLocalFullSnapshot();
      const found = allLocal.find((p) => p.id === productId || p.sku === productId);
      if (found) {
        setSelectedProduct(found);
      }
    },
    [products, loadLocalFullSnapshot]
  );

  const brandFacets = useMemo<FacetOption[]>(() => {
    return [
      {
        value: 'Սուրո',
        label: `Սուրո (${totalProducts || products.length})`,
        count: totalProducts || products.length,
      },
    ];
  }, [totalProducts, products.length]);

  const handleAddToCart = useCallback((product: Product, quantityToAdd: number = 1) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantityToAdd }
            : item
        );
      }
      return [...prev, { product, quantity: quantityToAdd }];
    });
  }, []);

  const handleRemoveItem = useCallback((productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  }, []);

  const handleUpdateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) {
        handleRemoveItem(productId);
        return;
      }
      setCartItems((prev) =>
        prev.map((item) => (item.product.id === productId ? { ...item, quantity } : item))
      );
    },
    [handleRemoveItem]
  );

  const handleClearCart = useCallback(() => setCartItems([]), []);
  const handleQuickView = useCallback((p: Product) => setSelectedProduct(p), []);
  const handleSortChange = useCallback((field: string, dir: 'asc' | 'desc') => {
    setSortBy(field);
    setSortOrder(dir);
  }, []);

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  // BUG-04 Fix: Apply B2B wholesale pricing in header cart total when company user is signed in
  const cartTotal = cartItems.reduce(
    (s, i) => s + getEffectiveUnitPrice(i.product, user) * i.quantity,
    0
  );

  return (
    <div className="min-h-screen bg-[#F5F7F8] text-[#0B0F17] flex flex-col font-sans">
      <Header
        cartCount={cartCount}
        cartTotal={cartTotal}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenMobileFilters={() => setIsMobileFiltersOpen(true)}
        onSelectProduct={handleSelectProductById}
        onSearchSubmit={(q) => setFilters((f) => ({ ...f, searchQuery: q }))}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        categories={apiCategories}
        selectedCategories={filters.selectedCategories}
        onSelectCategory={handleSelectSingleCategory}
      />

      <main className="mx-auto flex-1 w-full max-w-[1440px] px-4 sm:px-6 lg:px-10 py-8">
        {/* Industrial Promotional Hero Banner */}
        <div className="mb-8 rounded-2xl bg-gradient-to-r from-[#0D5257] to-[#093B3F] p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md bg-[#DA291C] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white mb-3">
              <span>{t('heroBadge')}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-tight">
              {t('heroTitle')}
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-white/80 max-w-2xl leading-relaxed">
              {t('heroSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => openAuthModal('register')}
              className="rounded-xl bg-[#FFAB00] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#0B0F17] shadow hover:bg-[#ffc13b] transition-colors"
            >
              {t('heroCta')}
            </button>
          </div>
        </div>

        {/* Symmetrical PLP Layout */}
        <div className="flex gap-8 items-start">
          <FacetedFilter
            filters={filters}
            onChange={setFilters}
            brandFacets={brandFacets}
            categoryFacets={apiCategories}
            voltageFacets={apiUnits}
            isMobileOpen={isMobileFiltersOpen}
            onCloseMobile={() => setIsMobileFiltersOpen(false)}
            totalFilteredCount={totalProducts}
          />

          <Catalog
            products={products}
            totalProducts={totalProducts}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            onResetFilters={handleResetFilters}
            onAddToCart={handleAddToCart}
            onQuickView={handleQuickView}
            categories={apiCategories}
            selectedCategories={filters.selectedCategories}
            onToggleCategory={handleToggleCategory}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onOpenMobileFilters={() => setIsMobileFiltersOpen(true)}
          />
        </div>
      </main>

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
      />

      <ProductDetailModal
        product={selectedProduct}
        isOpen={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={(p) => handleAddToCart(p, 1)}
      />

      <AuthModal />

      <UserDashboard
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        onAddToCart={(p) => handleAddToCart(p, 1)}
      />

      <Footer
        totalProducts={totalProducts || 1391}
        onSelectCategory={handleSelectSingleCategory}
        onOpenB2BRegister={() => openAuthModal('register')}
      />
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <WishlistProvider>
          <AppContent />
        </WishlistProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
