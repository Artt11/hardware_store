'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Heart,
  ShoppingBag,
  X,
  SlidersHorizontal,
  ArrowRight,
  Loader2,
  User,
  Building2,
  Menu,
  ChevronDown,
  Wrench,
  Hammer,
  Drill,
  PaintBucket,
  Pipette,
  Ruler,
  Shield,
  Layers,
  Phone,
  MapPin,
  Truck,
  Globe,
} from 'lucide-react';
import { SearchHit } from '../../types/search';
import { FacetOption } from '../../types/product';
import { useWishlist } from '../../hooks/useWishlist';
import { useAuth } from '../../context/AuthContext';
import { useLanguage, Language } from '../../context/LanguageContext';
import { API_BASE_URL } from '../../config/api';

interface HeaderProps {
  cartCount?: number;
  cartTotal?: number;
  onOpenCart?: () => void;
  onOpenMobileFilters?: () => void;
  onSelectProduct?: (productId: string) => void;
  onSearchSubmit?: (query: string) => void;
  onOpenDashboard?: () => void;
  categories?: FacetOption[];
  selectedCategories?: string[];
  onSelectCategory?: (category: string | null) => void;
}

const MEGA_MENU_DEPARTMENTS = [
  { name: 'Ամրակման միջոցներ', icon: Layers },
  { name: 'Կտրող և հղկող գործիքներ', icon: Drill },
  { name: 'Ձեռքի գործիքներ', icon: Hammer },
  { name: 'Ներկարարական և քիմիա', icon: PaintBucket },
  { name: 'Սանտեխնիկա և խողովակներ', icon: Pipette },
  { name: 'Էլեկտրական գործիքներ', icon: Wrench },
  { name: 'Չափիչ գործիքներ', icon: Ruler },
  { name: 'Անվտանգություն և հանդերձանք', icon: Shield },
];

const LANGUAGE_OPTIONS: { code: Language; label: string; flag: string }[] = [
  { code: 'hy', label: 'ARM', flag: '🇦🇲' },
  { code: 'ru', label: 'RUS', flag: '🇷🇺' },
  { code: 'en', label: 'ENG', flag: '🇬🇧' },
];

export const Header: React.FC<HeaderProps> = ({
  cartCount = 0,
  cartTotal = 0,
  onOpenCart,
  onOpenMobileFilters,
  onSelectProduct,
  onSearchSubmit,
  onOpenDashboard,
  categories = [],
  selectedCategories = [],
  onSelectCategory,
}) => {
  const { count: wishlistCount } = useWishlist();
  const { isAuthenticated, user, openAuthModal } = useAuth();
  const {
    lang,
    setLang,
    t,
    translateCategory,
    translateDepartmentSubtitle,
    translateUnit,
  } = useLanguage();

  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const megaMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
          `${API_BASE_URL}/search/autocomplete?q=${encodeURIComponent(
            query.trim()
          )}&limit=6`
        );
        if (response.ok) {
          const data = await response.json();
          setHits(data.products || []);
          setSuggestions(data.suggestions || []);
        }
      } catch {
        setHits([]);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
      if (
        megaMenuRef.current &&
        !megaMenuRef.current.contains(event.target as Node)
      ) {
        setIsMegaMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    onSearchSubmit?.('');
    inputRef.current?.focus();
  };

  const getCategoryCount = (name: string) => {
    const found = categories.find((c) => c.value === name);
    return found ? found.count : null;
  };

  return (
    <header className="sticky top-0 z-40 w-full shadow-md">
      {/* Top Industrial Utility Strip + Language Switcher (ARM | RUS | ENG) */}
      <div className="bg-[#093B3F] text-white/90 text-[11px]">
        <div className="mx-auto flex h-9 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <MapPin className="h-3 w-3 text-[#FFAB00]" />
              <span>{t('storeLocation')}</span>
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 text-white/75">
              <Truck className="h-3 w-3 text-emerald-400" />
              <span>{t('fastDeliveryBanner')}</span>
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href="tel:+37410550000"
              className="hidden sm:inline-flex items-center gap-1 font-mono font-semibold text-white hover:text-[#FFAB00] transition-colors"
            >
              <Phone className="h-3 w-3" />
              <span>+374 (10) 55-00-00</span>
            </a>

            {/* Trilingual Switcher Pill: ARM | RUS | ENG */}
            <div
              role="group"
              aria-label="Language switcher"
              className="flex items-center gap-0.5 rounded-lg bg-black/25 p-0.5"
            >
              <Globe className="h-3 w-3 text-[#FFAB00] ml-1.5 mr-1 hidden sm:inline" />
              {LANGUAGE_OPTIONS.map((opt) => {
                const active = lang === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setLang(opt.code)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold tracking-wider transition-all ${
                      active
                        ? 'bg-[#FFAB00] text-[#0B0F17] shadow-sm'
                        : 'text-white/75 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="mr-1">{opt.flag}</span>
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => openAuthModal('register')}
              className="hidden lg:inline-flex items-center gap-1 rounded bg-[#DA291C] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-[#b82216] transition-colors"
            >
              <Building2 className="h-2.5 w-2.5" />
              <span>{t('b2bTradePass')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Industrial Header Bar (#0D5257 Bunnings Teal) */}
      <div className="bg-[#0D5257] text-white">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-3 sm:gap-6 px-4 sm:px-6 lg:px-10">
          {/* Brand Logo & Mega-Menu Trigger */}
          <div className="flex items-center gap-3 sm:gap-5" ref={megaMenuRef}>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onSelectCategory?.(null);
                onSearchSubmit?.('');
              }}
              className="group flex items-center gap-2.5 text-white transition-opacity hover:opacity-95"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#DA291C] text-white font-black text-lg tracking-tighter shadow-sm">
                Ս
              </div>
              <div className="flex flex-col">
                <span className="text-lg sm:text-xl font-black tracking-tight leading-none">
                  SURO<span className="font-light text-[#FFAB00]">BUILD</span>
                </span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-white/70 mt-0.5">
                  {t('brandTagline')}
                </span>
              </div>
            </a>

            {/* Hardware Categories Mega-Menu Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMegaMenuOpen((prev) => !prev)}
                aria-expanded={isMegaMenuOpen}
                className={`hidden md:inline-flex h-11 items-center gap-2.5 rounded-xl px-4 text-xs font-extrabold uppercase tracking-wider transition-all ${
                  isMegaMenuOpen
                    ? 'bg-[#DA291C] text-white shadow-lg'
                    : 'bg-[#093B3F] text-white hover:bg-[#072d30]'
                }`}
              >
                <Menu className="h-4 w-4" />
                <span>{t('departmentsBtn')}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    isMegaMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Mega-Menu Dropdown Panel */}
              <AnimatePresence>
                {isMegaMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.18 }}
                    className="absolute left-0 top-full mt-3 w-[760px] rounded-2xl bg-white p-6 text-[#0B0F17] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.28)] z-50"
                  >
                    <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-100">
                      <div>
                        <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#0D5257]">
                          {t('megaMenuTitle')}
                        </h3>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {t('megaMenuSubtitle')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCategory?.(null);
                          setIsMegaMenuOpen(false);
                        }}
                        className="rounded-lg bg-[#0D5257]/10 px-3 py-1.5 text-xs font-bold text-[#0D5257] hover:bg-[#0D5257] hover:text-white transition-colors"
                      >
                        {t('viewAllProducts')}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {MEGA_MENU_DEPARTMENTS.map((dept) => {
                        const Icon = dept.icon;
                        const count = getCategoryCount(dept.name);
                        const isSelected = selectedCategories.includes(dept.name);
                        return (
                          <button
                            key={dept.name}
                            type="button"
                            onClick={() => {
                              onSelectCategory?.(dept.name);
                              setIsMegaMenuOpen(false);
                            }}
                            className={`group flex items-start gap-3.5 rounded-xl p-3.5 text-left transition-all ${
                              isSelected
                                ? 'bg-[#0D5257] text-white shadow-sm'
                                : 'bg-[#F6F8F9] hover:bg-[#0D5257]/[0.07]'
                            }`}
                          >
                            <div
                              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                                isSelected
                                  ? 'bg-white/15 text-white'
                                  : 'bg-white text-[#0D5257] shadow-sm group-hover:bg-[#0D5257] group-hover:text-white'
                              }`}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-xs font-bold truncate ${
                                    isSelected ? 'text-white' : 'text-[#0B0F17]'
                                  }`}
                                >
                                  {translateCategory(dept.name)}
                                </span>
                                {count !== null && (
                                  <span
                                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                                      isSelected
                                        ? 'bg-white/20 text-white'
                                        : 'bg-white text-neutral-600'
                                    }`}
                                  >
                                    {count}
                                  </span>
                                )}
                              </div>
                              <p
                                className={`mt-0.5 text-[11px] line-clamp-1 ${
                                  isSelected ? 'text-white/80' : 'text-neutral-500'
                                }`}
                              >
                                {translateDepartmentSubtitle(dept.name)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Center Prominent Smart Search Bar */}
          <div ref={searchContainerRef} className="relative flex-1 max-w-2xl">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-4 h-4 w-4 text-neutral-400" />
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
                placeholder={t('searchPlaceholder')}
                className="h-12 w-full rounded-xl bg-white pl-11 pr-24 text-sm text-[#0B0F17]
                           placeholder:text-neutral-400 shadow-inner outline-none
                           focus:ring-2 focus:ring-[#FFAB00] transition-all"
              />

              <div className="absolute right-1.5 flex items-center gap-1">
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-neutral-400" />
                ) : (
                  query && (
                    <button
                      type="button"
                      onClick={handleClear}
                      aria-label="Clear search"
                      className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => {
                    onSearchSubmit?.(query.trim());
                    setIsSearchOpen(false);
                  }}
                  className="h-9 rounded-lg bg-[#DA291C] px-3.5 text-xs font-bold text-white hover:bg-[#b82216] transition-colors"
                >
                  {t('searchBtn')}
                </button>
              </div>
            </div>

            {/* Instant Visual Autocomplete Dropdown */}
            <AnimatePresence>
              {isSearchOpen && (query.trim().length > 0 || hits.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="absolute left-0 top-full mt-2 w-full overflow-hidden rounded-2xl bg-white text-[#0B0F17]
                             shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] z-50"
                >
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 bg-[#F6F8F9] px-4 py-2.5 text-xs">
                      <span className="text-[11px] font-bold text-neutral-400 uppercase">
                        {t('suggestions')}
                      </span>
                      {suggestions.map((sug, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setQuery(sug);
                            onSearchSubmit?.(sug);
                            setIsSearchOpen(false);
                          }}
                          className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-[#0D5257] shadow-sm hover:bg-[#0D5257] hover:text-white transition-colors"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-neutral-100">
                    {hits.length > 0 ? (
                      hits.map((hit, idx) => (
                        <div
                          key={hit.id}
                          onClick={() => {
                            onSelectProduct?.(hit.id);
                            setIsSearchOpen(false);
                          }}
                          className={`group flex items-center justify-between gap-3.5 rounded-xl p-2.5 transition-colors cursor-pointer ${
                            selectedIndex === idx ? 'bg-neutral-100' : 'hover:bg-[#F6F8F9]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 p-1">
                              <img
                                src={
                                  hit.thumbnailUrl ||
                                  (hit as any).thumbnail_url ||
                                  'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=160&q=80'
                                }
                                alt={hit.name}
                                className="h-full w-full object-cover rounded"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-[#0D5257]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0D5257]">
                                  {translateUnit(hit.brand)}
                                </span>
                                <span className="text-[10px] text-neutral-400 truncate">
                                  {translateCategory(hit.category)}
                                </span>
                              </div>
                              <h4
                                className="truncate text-xs font-bold text-[#0B0F17] mt-0.5"
                                dangerouslySetInnerHTML={{
                                  __html: hit.highlight || hit.name,
                                }}
                              />
                              <p className="text-[11px] font-mono text-neutral-400">
                                {t('skuLabel')}: {hit.sku}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end flex-shrink-0">
                            <span className="text-xs font-extrabold text-[#0B0F17] tabular-nums">
                              {hit.currency === 'AMD'
                                ? `${Number(hit.price || 0).toLocaleString('en-US', {
                                    maximumFractionDigits: 0,
                                  })} ֏`
                                : `$${Number(hit.price || 0).toFixed(2)}`}
                            </span>
                            <span className="text-[10px] text-emerald-600 font-bold">
                              {(hit.inStock ?? (hit as any).in_stock ?? true)
                                ? t('inStockShort')
                                : t('backorderShort')}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      !isLoading && (
                        <div className="py-8 text-center text-xs text-neutral-400">
                          {t('noSearchResults')} «{query}»
                        </div>
                      )
                    )}
                  </div>

                  {query.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        onSearchSubmit?.(query.trim());
                        setIsSearchOpen(false);
                      }}
                      className="flex w-full items-center justify-between bg-[#F6F8F9] px-4 py-3 text-xs font-bold text-[#0D5257] hover:bg-[#0D5257] hover:text-white transition-colors"
                    >
                      <span>
                        {t('viewAllSearchResults')} «{query}»
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Utility Controls: Mobile Filter, Account, Wishlist, Cart */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onOpenMobileFilters}
              aria-label="Open Filters"
              className="flex lg:hidden h-11 w-11 items-center justify-center rounded-xl bg-[#093B3F] text-white hover:bg-[#072d30]"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>

            {isAuthenticated && user ? (
              <button
                type="button"
                onClick={onOpenDashboard}
                aria-label="User Profile"
                className="flex h-11 items-center gap-2.5 rounded-xl bg-[#093B3F] px-3.5 text-xs font-bold text-white hover:bg-[#072d30] transition-colors"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFAB00] text-[#0B0F17] text-xs font-black">
                  {user.account_type === 'company' ? (
                    <Building2 className="h-3.5 w-3.5" />
                  ) : (
                    user.first_name?.[0] || 'U'
                  )}
                </div>
                <div className="hidden xl:flex flex-col items-start leading-tight">
                  <span className="text-[10px] font-medium text-white/70">
                    {user.account_type === 'company' ? t('b2bPartner') : t('myAccount')}
                  </span>
                  <span className="max-w-[95px] truncate font-bold">
                    {user.account_type === 'company'
                      ? user.company_name
                      : user.first_name || t('myAccount')}
                  </span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="flex h-11 items-center gap-2 rounded-xl bg-[#093B3F] px-3.5 text-xs font-bold text-white hover:bg-[#072d30] transition-colors"
              >
                <User className="h-4 w-4 text-[#FFAB00]" />
                <div className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-[10px] font-normal text-white/70">
                    {t('loginRegister')}
                  </span>
                  <span>{t('myAccount')}</span>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('catalog-grid-anchor');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#093B3F] text-white hover:bg-[#072d30] transition-colors"
              aria-label="View Favorites"
            >
              <Heart
                className={`h-4 w-4 ${
                  wishlistCount > 0 ? 'fill-[#DA291C] text-[#DA291C]' : 'text-white'
                }`}
              />
              {wishlistCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#DA291C] px-1 text-[10px] font-black text-white shadow">
                  {wishlistCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              aria-label="Open Cart"
              className="relative flex h-11 items-center gap-2.5 rounded-xl bg-[#DA291C] px-4 text-xs font-extrabold text-white shadow-md hover:bg-[#b82216] transition-all"
            >
              <ShoppingBag className="h-4 w-4" />
              <div className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-[10px] font-medium text-white/85">{t('cartLabel')}</span>
                <span className="font-mono text-xs font-black tabular-nums">
                  {cartTotal > 0 ? `${cartTotal.toLocaleString()} ֏` : '0 ֏'}
                </span>
              </div>
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-black text-[#DA291C]">
                {cartCount}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
