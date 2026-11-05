'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { FilterState, FacetOption } from '../../types/product';
import { useLanguage } from '../../context/LanguageContext';

interface FacetedFilterProps {
  filters: FilterState;
  onChange: (newFilters: FilterState) => void;
  brandFacets: FacetOption[];
  categoryFacets: FacetOption[];
  voltageFacets: FacetOption[];
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  totalFilteredCount: number;
}

export const FacetedFilter: React.FC<FacetedFilterProps> = ({
  filters,
  onChange,
  brandFacets,
  categoryFacets,
  voltageFacets,
  isMobileOpen,
  onCloseMobile,
  totalFilteredCount,
}) => {
  const { t, translateCategory, translateUnit } = useLanguage();

  const handleCategoryToggle = (category: string) => {
    const next = filters.selectedCategories.includes(category)
      ? filters.selectedCategories.filter((c) => c !== category)
      : [...filters.selectedCategories, category];
    onChange({ ...filters, selectedCategories: next });
  };

  const handleVoltageToggle = (volt: string) => {
    const next = filters.selectedVoltages.includes(volt)
      ? filters.selectedVoltages.filter((v) => v !== volt)
      : [...filters.selectedVoltages, volt];
    onChange({ ...filters, selectedVoltages: next });
  };

  const handleBrandToggle = (brand: string) => {
    const next = filters.selectedBrands.includes(brand)
      ? filters.selectedBrands.filter((b) => b !== brand)
      : [...filters.selectedBrands, brand];
    onChange({ ...filters, selectedBrands: next });
  };

  const handleStockToggle = () => {
    onChange({ ...filters, inStockOnly: !filters.inStockOnly });
  };

  const handleReset = () => {
    onChange({
      searchQuery: '',
      selectedBrands: [],
      selectedCategories: [],
      priceRange: [0, 300000],
      inStockOnly: false,
      selectedVoltages: [],
    });
  };

  const activeFilterCount =
    (filters.searchQuery ? 1 : 0) +
    filters.selectedBrands.length +
    filters.selectedCategories.length +
    filters.selectedVoltages.length +
    (filters.inStockOnly ? 1 : 0) +
    (filters.priceRange[0] > 0 || filters.priceRange[1] < 300000 ? 1 : 0);

  const filterContent = (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#0D5257]" />
          <span className="text-xs font-extrabold text-[#0B0F17] uppercase tracking-wider">
            {t('filtersTitle')}
          </span>
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#DA291C] px-1.5 text-[10px] font-black text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 rounded-lg bg-[#F5F7F8] px-2.5 py-1 text-[11px] font-bold text-neutral-600 hover:bg-neutral-200 hover:text-black transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t('resetBtn')}</span>
          </button>
        )}
      </div>

      {/* Quick Filter Input */}
      <div>
        <label className="block text-[11px] font-extrabold uppercase tracking-wider text-neutral-400 mb-2">
          {t('quickFilterLabel')}
        </label>
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            value={filters.searchQuery || ''}
            onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
            placeholder={t('quickFilterPlaceholder')}
            className="w-full rounded-xl bg-[#F5F7F8] pl-9 pr-8 py-2.5 text-xs font-medium text-[#0B0F17] placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-[#0D5257]"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, searchQuery: '' })}
              className="absolute right-2.5 text-neutral-400 hover:text-black"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* In-Stock Toggle */}
      <div className="flex items-center justify-between rounded-xl bg-[#F5F7F8] px-3.5 py-3">
        <label
          htmlFor="instock-filter"
          className="text-xs font-bold text-[#0B0F17] cursor-pointer"
        >
          {t('inStockOnly')}
        </label>
        <button
          id="instock-filter"
          type="button"
          onClick={handleStockToggle}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ${
            filters.inStockOnly ? 'bg-[#0D5257]' : 'bg-neutral-300'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ${
              filters.inStockOnly ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Department / Category Facets */}
      <div>
        <h4 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
          {t('departmentsHeading')}
        </h4>
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
          {categoryFacets.map((c) => {
            const checked = filters.selectedCategories.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => handleCategoryToggle(c.value)}
                className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                  checked
                    ? 'bg-[#0D5257] text-white font-bold'
                    : 'hover:bg-[#F5F7F8] text-neutral-700 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-colors ${
                      checked
                        ? 'bg-white text-[#0D5257]'
                        : 'bg-[#F5F7F8] border border-neutral-300 group-hover:border-[#0D5257]'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span className="truncate">{translateCategory(c.value)}</span>
                </div>
                <span
                  className={`text-[11px] font-mono ${
                    checked ? 'text-white/80' : 'text-neutral-400'
                  }`}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Price Range Slider + Inputs */}
      <div className="rounded-xl bg-[#F5F7F8] p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500">
            {t('priceRangeHeading')}
          </h4>
          <span className="text-xs font-mono font-extrabold text-[#0D5257]">
            {filters.priceRange[0].toLocaleString()} - {filters.priceRange[1].toLocaleString()} ֏
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="300000"
          step="1000"
          value={filters.priceRange[1]}
          onChange={(e) => {
            const nextMax = Math.max(0, Math.min(300000, Number(e.target.value) || 0));
            const clampedMin = Math.min(filters.priceRange[0], nextMax);
            onChange({
              ...filters,
              priceRange: [clampedMin, nextMax],
            });
          }}
          className="w-full accent-[#0D5257] cursor-pointer"
        />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <span className="block text-[10px] font-semibold text-neutral-400 mb-1">
              {t('minPriceLabel')}
            </span>
            <input
              type="number"
              min={0}
              max={filters.priceRange[1]}
              value={filters.priceRange[0]}
              onChange={(e) => {
                const rawMin = Math.max(0, Number(e.target.value) || 0);
                const nextMin = Math.min(rawMin, filters.priceRange[1]);
                onChange({
                  ...filters,
                  priceRange: [nextMin, filters.priceRange[1]],
                });
              }}
              className="w-full rounded-lg bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-[#0B0F17] outline-none focus:ring-1 focus:ring-[#0D5257]"
            />
          </div>
          <div>
            <span className="block text-[10px] font-semibold text-neutral-400 mb-1">
              {t('maxPriceLabel')}
            </span>
            <input
              type="number"
              min={filters.priceRange[0]}
              max={300000}
              value={filters.priceRange[1]}
              onChange={(e) => {
                const rawMax = Math.min(300000, Math.max(0, Number(e.target.value) || 300000));
                const nextMax = Math.max(filters.priceRange[0], rawMax);
                onChange({
                  ...filters,
                  priceRange: [filters.priceRange[0], nextMax],
                });
              }}
              className="w-full rounded-lg bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-[#0B0F17] outline-none focus:ring-1 focus:ring-[#0D5257]"
            />
          </div>
        </div>
      </div>

      {/* Unit of Measure Facets */}
      <div>
        <h4 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
          {t('unitHeading')}
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {voltageFacets.map((v) => {
            const checked = filters.selectedVoltages.includes(v.value);
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => handleVoltageToggle(v.value)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  checked
                    ? 'bg-[#0D5257] text-white shadow-sm'
                    : 'bg-[#F5F7F8] text-neutral-700 hover:bg-neutral-200/80'
                }`}
              >
                <span>{translateUnit(v.value)}</span>
                <span
                  className={`text-[10px] font-mono ${
                    checked ? 'text-white/80' : 'text-neutral-400'
                  }`}
                >
                  ({v.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Brand Filter */}
      {brandFacets.length > 0 && (
        <div>
          <h4 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">
            {t('brandHeading')}
          </h4>
          <div className="flex flex-col gap-1">
            {brandFacets.map((b) => {
              const checked = filters.selectedBrands.includes(b.value);
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => handleBrandToggle(b.value)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                    checked ? 'bg-[#0D5257] text-white' : 'bg-[#F5F7F8] text-neutral-800'
                  }`}
                >
                  <span>{b.value}</span>
                  <span className="font-mono text-[11px] opacity-75">({b.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-72 flex-shrink-0">
        <div className="sticky top-32 rounded-2xl bg-white p-5 shadow-[0_4px_20px_-4px_rgba(11,15,23,0.05)]">
          {filterContent}
        </div>
      </aside>

      <AnimatePresence>
        {isMobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 right-0 flex w-full max-w-xs flex-col bg-white p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                <span className="text-sm font-extrabold text-[#0B0F17] uppercase tracking-wider">
                  {t('filtersTitle')}
                </span>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="rounded-full bg-[#F5F7F8] p-2 text-neutral-500 hover:text-black"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4">{filterContent}</div>

              <div className="pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="w-full rounded-xl bg-[#DA291C] py-3.5 text-center text-xs font-extrabold text-white shadow-md"
                >
                  {t('showProductsBtn')} ({totalFilteredCount.toLocaleString()})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
