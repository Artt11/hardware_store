'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  RotateCcw,
  ArrowUp,
  PackageSearch,
  LayoutGrid,
  List,
  ArrowUpDown,
  SlidersHorizontal,
} from 'lucide-react';
import { Product, FacetOption } from '../../types/product';
import { ProductCard } from './ProductCard';
import { useLanguage } from '../../context/LanguageContext';

interface CatalogProps {
  products: Product[];
  totalProducts: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onResetFilters: () => void;
  onAddToCart: (product: Product, quantity?: number) => void;
  onQuickView: (product: Product) => void;
  categories?: FacetOption[];
  selectedCategories?: string[];
  onToggleCategory?: (category: string) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;
  onOpenMobileFilters?: () => void;
}

export const Catalog: React.FC<CatalogProps> = ({
  products,
  totalProducts,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onResetFilters,
  onAddToCart,
  onQuickView,
  categories = [],
  selectedCategories = [],
  onToggleCategory,
  sortBy = 'sku',
  sortOrder = 'asc',
  onSortChange,
  onOpenMobileFilters,
}) => {
  const { t, translateCategory } = useLanguage();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: '420px 0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, onLoadMore]);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 900);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section id="catalog-grid-anchor" className="flex-1 min-w-0">
      {/* Quick Department Pills */}
      {categories.length > 0 && onToggleCategory && (
        <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => {
              if (selectedCategories.length > 0) {
                onResetFilters();
              }
            }}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-xs font-extrabold tracking-wide transition-all ${
              selectedCategories.length === 0
                ? 'bg-[#0D5257] text-white shadow-sm'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 shadow-sm'
            }`}
          >
            {t('allCategories')} ({totalProducts.toLocaleString()})
          </button>

          {categories.map((cat) => {
            const active = selectedCategories.includes(cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => onToggleCategory(cat.value)}
                className={`flex-shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold tracking-wide transition-all ${
                  active
                    ? 'bg-[#0D5257] text-white shadow-sm'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 shadow-sm'
                }`}
              >
                {translateCategory(cat.value)}{' '}
                <span className={active ? 'text-white/80 font-mono' : 'text-neutral-400 font-mono'}>
                  ({cat.count})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* PLP Control Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_4px_20px_-4px_rgba(11,15,23,0.04)]">
        <div className="flex items-center gap-3">
          {onOpenMobileFilters && (
            <button
              type="button"
              onClick={onOpenMobileFilters}
              className="inline-flex lg:hidden items-center gap-1.5 rounded-xl bg-[#F5F7F8] px-3 py-2 text-xs font-bold text-[#0B0F17]"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#0D5257]" />
              <span>{t('filtersTitle')}</span>
            </button>
          )}
          <span className="text-xs font-medium text-neutral-500">
            {t('showingCount')}{' '}
            <strong className="font-mono font-extrabold text-[#0B0F17]">
              {products.length.toLocaleString()}
            </strong>{' '}
            /{' '}
            <strong className="font-mono font-extrabold text-[#0D5257]">
              {totalProducts.toLocaleString()}
            </strong>{' '}
            {t('productsUnit')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {onSortChange && (
            <div className="flex items-center gap-2 rounded-xl bg-[#F5F7F8] px-3 py-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-[#0D5257]" />
              <select
                aria-label="Sort products"
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split(':');
                  onSortChange(field, dir as 'asc' | 'desc');
                }}
                className="bg-transparent text-xs font-bold text-[#0B0F17] outline-none cursor-pointer"
              >
                <option value="sku:asc">{t('sortSkuAsc')}</option>
                <option value="sku:desc">{t('sortSkuDesc')}</option>
                <option value="retail_price:asc">{t('sortPriceAsc')}</option>
                <option value="retail_price:desc">{t('sortPriceDesc')}</option>
                <option value="name:asc">{t('sortNameAsc')}</option>
              </select>
            </div>
          )}

          {/* Grid / List View Mode Toggle */}
          <div className="flex items-center rounded-xl bg-[#F5F7F8] p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-[#0D5257] text-white shadow-sm'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-[#0D5257] text-white shadow-sm'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && products.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr">
          {Array.from({ length: 9 }).map((_, idx) => (
            <div
              key={idx}
              className="flex h-[420px] flex-col justify-between rounded-2xl bg-white p-5 shadow-sm animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-28 rounded-md bg-neutral-100" />
                <div className="h-9 w-9 rounded-full bg-neutral-100" />
              </div>
              <div className="my-4 h-48 w-full rounded-xl bg-neutral-100" />
              <div className="space-y-2">
                <div className="h-4 w-4/5 rounded bg-neutral-100" />
                <div className="h-3 w-1/2 rounded bg-neutral-100" />
              </div>
              <div className="mt-4 flex items-center justify-between pt-3">
                <div className="h-7 w-24 rounded bg-neutral-100" />
                <div className="h-10 w-28 rounded-xl bg-neutral-100" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-8 py-20 text-center shadow-sm">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F7F8] text-[#0D5257]">
            <PackageSearch className="h-7 w-7" />
          </div>
          <p className="text-base font-extrabold text-[#0B0F17]">{t('emptyTitle')}</p>
          <p className="mt-1.5 max-w-sm text-xs text-neutral-500 leading-relaxed">
            {t('emptySubtitle')}
          </p>
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#DA291C] px-6 py-3 text-xs font-extrabold text-white shadow-md hover:bg-[#b82216] transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t('clearAllFilters')}</span>
          </button>
        </div>
      ) : (
        <>
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-fr'
                : 'flex flex-col gap-4'
            }
          >
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                viewMode={viewMode}
                onAddToCart={onAddToCart}
                onQuickView={onQuickView}
              />
            ))}
          </div>

          <div
            ref={sentinelRef}
            className="mt-12 flex flex-col items-center justify-center py-6 text-center"
          >
            <div className="mb-2 text-xs font-mono text-neutral-500">
              {t('loadedCount')}{' '}
              <strong className="text-[#0B0F17]">{products.length.toLocaleString()}</strong> /{' '}
              <strong className="text-[#0D5257]">{totalProducts.toLocaleString()}</strong>{' '}
              {t('productsUnit')}
            </div>

            <div className="mb-5 h-2 w-64 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-[#0D5257] transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    totalProducts > 0 ? (products.length / totalProducts) * 100 : 100
                  )}%`,
                }}
              />
            </div>

            {isLoadingMore ? (
              <div className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-[#0D5257] shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('loadingMore')}</span>
              </div>
            ) : hasMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                className="rounded-xl bg-[#0D5257] px-7 py-3 text-xs font-extrabold text-white shadow-md transition-all hover:bg-[#093B3F]"
              >
                {t('loadMoreBtn')} ({Math.max(0, totalProducts - products.length).toLocaleString()}{' '}
                {t('remainingLabel')})
              </button>
            ) : (
              <span className="text-xs font-semibold text-neutral-400">
                {t('allLoadedText')} ({totalProducts.toLocaleString()})
              </span>
            )}
          </div>
        </>
      )}

      {showScrollTop && (
        <button
          type="button"
          aria-label="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-8 z-30 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0D5257] text-white shadow-xl transition-all hover:-translate-y-1 hover:bg-[#093B3F]"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </section>
  );
};
