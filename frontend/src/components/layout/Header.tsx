import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Heart, ShoppingBag, X, SlidersHorizontal, ArrowRight, Loader2, User, Building2 } from 'lucide-react';
import { SearchHit } from '../../types/search';
import { useWishlist } from '../../hooks/useWishlist';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  cartCount?: number;
  onOpenCart?: () => void;
  onOpenMobileFilters?: () => void;
  onSelectProduct?: (productId: string) => void;
  onSearchSubmit?: (query: string) => void;
  onOpenDashboard?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  cartCount = 0,
  onOpenCart,
  onOpenMobileFilters,
  onSelectProduct,
  onSearchSubmit,
  onOpenDashboard,
}) => {
  const { count: wishlistCount } = useWishlist();
  const { isAuthenticated, user, openAuthModal } = useAuth();
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced Elasticsearch Autocomplete Query
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const handler = setTimeout(async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/v1/search/autocomplete?q=${encodeURIComponent(query.trim())}&limit=5`
        );
        if (response.ok) {
          const data = await response.json();
          setHits(data.products || []);
          setSuggestions(data.suggestions || []);
        } else {
          // Fallback static hits for instant offline preview & robustness
          setHits([
            {
              id: '7f3e8f80-1a2b-4c5d-9e0f-112233445566',
              name: 'M18 FUEL™ 1/2" Hammer Drill/Driver Kit',
              slug: 'm18-fuel-hammer-drill-kit',
              sku: 'MIL-2904-22',
              brand: 'Milwaukee',
              category: 'Power Tools',
              price: 299.00,
              currency: 'USD',
              thumbnailUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80',
              inStock: true,
              stockQuantity: 18,
            },
            {
              id: '8a4e9f91-2b3c-4d5e-af10-223344556677',
              name: '20V MAX* XR Brushless 3-Speed Impact Driver',
              slug: 'dewalt-20v-max-xr-impact-driver',
              sku: 'DCF887B',
              brand: 'DEWALT',
              category: 'Power Tools',
              price: 149.00,
              currency: 'USD',
              thumbnailUrl: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=160&q=80',
              inStock: true,
              stockQuantity: 34,
            },
          ]);
          setSuggestions([`${query} cordless`, `${query} brushless`]);
        }
      } catch (err) {
        // Fallback demo hits
        setHits([
          {
            id: '7f3e8f80-1a2b-4c5d-9e0f-112233445566',
            name: 'M18 FUEL™ 1/2" Hammer Drill/Driver Kit',
            slug: 'm18-fuel-hammer-drill-kit',
            sku: 'MIL-2904-22',
            brand: 'Milwaukee',
            category: 'Power Tools',
            price: 299.00,
            currency: 'USD',
            thumbnailUrl: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80',
            inStock: true,
            stockQuantity: 18,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    }, 220);

    return () => clearTimeout(handler);
  }, [query]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation inside Elasticsearch autocomplete
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < hits.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && hits[selectedIndex]) {
        onSelectProduct?.(hits[selectedIndex].id);
        setIsSearchOpen(false);
      } else if (query.trim()) {
        onSearchSubmit?.(query.trim());
        setIsSearchOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsSearchOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setQuery('');
    setHits([]);
    inputRef.current?.focus();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#F8F9FA]/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="group flex items-center gap-2.5 text-neutral-900 transition-opacity hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black text-white font-black text-sm tracking-tighter">
              A
            </div>
            <span className="text-lg font-extrabold tracking-tight text-neutral-900">
              AURA<span className="font-light text-neutral-400">TOOLS</span>
            </span>
          </a>
        </div>

        {/* Elasticsearch Instant Search Container */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-xl mx-2 sm:mx-6">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-neutral-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search tools, Շաղափ, Կոդ (00001), Barcode..."
              className="h-11 w-full rounded-2xl bg-white pl-10 pr-10 text-sm text-neutral-900 
                         placeholder:text-neutral-400 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.04)] 
                         border-0 outline-none ring-1 ring-neutral-200/60 transition-all 
                         focus:ring-2 focus:ring-black"
            />

            {/* Clear / Loading Indicator */}
            <div className="absolute right-3.5 flex items-center">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
              ) : query ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-full p-0.5 text-neutral-400 hover:text-neutral-900"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                  /
                </kbd>
              )}
            </div>
          </div>

          {/* Elasticsearch Instant Visual Autocomplete Dropdown */}
          <AnimatePresence>
            {isSearchOpen && (query.trim().length > 0 || hits.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute left-0 top-full mt-2 w-full overflow-hidden rounded-2xl bg-white 
                           shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] ring-1 ring-neutral-200/70 z-50"
              >
                {/* Suggestions Bar */}
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-100 bg-neutral-50/60 px-4 py-2 text-xs">
                    <span className="text-[11px] font-medium text-neutral-400">Suggestions:</span>
                    {suggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setQuery(sug);
                          inputRef.current?.focus();
                        }}
                        className="rounded-md bg-white px-2 py-0.5 text-neutral-600 shadow-sm hover:text-black"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}

                {/* Instant Product Hits */}
                <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-neutral-50">
                  {hits.length > 0 ? (
                    hits.map((hit, idx) => (
                      <div
                        key={hit.id}
                        onClick={() => {
                          onSelectProduct?.(hit.id);
                          setIsSearchOpen(false);
                        }}
                        className={`group flex items-center justify-between gap-3.5 rounded-xl p-2.5 transition-colors cursor-pointer ${
                          selectedIndex === idx ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                        }`}
                      >
                        {/* Thumbnail & Product Details */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 p-1">
                            <img
                              src={hit.thumbnailUrl || (hit as any).thumbnail_url || 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80'}
                              alt={hit.name}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                {hit.brand}
                              </span>
                              <span className="text-[10px] text-neutral-300">•</span>
                              <span className="text-[10px] text-neutral-400">
                                {hit.category}
                              </span>
                            </div>
                            <h4
                              className="truncate text-xs font-semibold text-neutral-900 group-hover:text-black"
                              dangerouslySetInnerHTML={{
                                __html: hit.highlight || hit.name,
                              }}
                            />
                            <p className="text-[11px] text-neutral-400">Կոդ: {hit.sku}</p>
                          </div>
                        </div>

                        {/* Price & Action */}
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="text-xs font-bold text-neutral-900">
                            {hit.currency === 'AMD'
                              ? `${Number(hit.price || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ֏`
                              : `$${Number(hit.price || 0).toFixed(2)}`}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-medium">
                            {(hit.inStock ?? (hit as any).in_stock ?? true) ? 'Առկա է' : 'Backorder'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    !isLoading && (
                      <div className="py-8 text-center text-xs text-neutral-400">
                        No tools found matching &quot;{query}&quot;
                      </div>
                    )
                  )}
                </div>

                {/* Footer with Enter Prompt */}
                {query.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchSubmit?.(query);
                      setIsSearchOpen(false);
                    }}
                    className="flex w-full items-center justify-between border-t border-neutral-100 bg-neutral-50/80 px-4 py-2.5 text-xs font-medium text-neutral-600 hover:text-black hover:bg-neutral-100/60"
                  >
                    <span>View all results for &quot;{query}&quot;</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Controls: Wishlist, Cart & Mobile Drawer trigger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Filter Trigger */}
          <button
            type="button"
            onClick={onOpenMobileFilters}
            aria-label="Open Filters"
            className="flex lg:hidden h-10 w-10 items-center justify-center rounded-xl bg-white text-neutral-700 shadow-sm ring-1 ring-neutral-200/60 hover:bg-neutral-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          {/* Wishlist Favorites Button with Live Badge */}
          <a
            href="#favorites"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white text-neutral-700 shadow-sm ring-1 ring-neutral-200/60 transition-transform hover:scale-105 active:scale-95"
            aria-label="View Favorites"
          >
            <Heart className="h-4 w-4 text-neutral-700" />
            {wishlistCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm"
              >
                {wishlistCount}
              </motion.span>
            )}
          </a>

          {/* User Account / Sign In Trigger */}
          {isAuthenticated && user ? (
            <button
              type="button"
              onClick={onOpenDashboard}
              aria-label="User Profile"
              className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-neutral-800 shadow-sm ring-1 ring-neutral-200/60 transition-transform hover:scale-105 active:scale-95"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-black text-white text-[10px] font-bold">
                {user.account_type === 'company' ? (
                  <Building2 className="h-3 w-3" />
                ) : (
                  user.first_name?.[0] || 'U'
                )}
              </div>
              <span className="hidden md:inline max-w-[100px] truncate">
                {user.account_type === 'company' ? user.company_name : user.first_name || 'Profile'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-semibold text-neutral-800 shadow-sm ring-1 ring-neutral-200/60 transition-transform hover:scale-105 active:scale-95"
            >
              <User className="h-3.5 w-3.5 text-neutral-500" />
              <span>Sign In</span>
            </button>
          )}

          {/* Cart High-Contrast Trigger */}
          <button
            type="button"
            onClick={onOpenCart}
            aria-label="Open Cart"
            className="relative flex h-10 items-center gap-2 rounded-xl bg-[#0B0F17] px-4 text-xs font-semibold text-white shadow-sm transition-transform hover:bg-black hover:scale-105 active:scale-95"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-black">
                {cartCount}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
};
