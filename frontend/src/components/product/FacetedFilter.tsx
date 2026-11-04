import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, RotateCcw } from 'lucide-react';
import { FilterState, FacetOption } from '../../types/product';

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
  const handleBrandToggle = (brand: string) => {
    const next = filters.selectedBrands.includes(brand)
      ? filters.selectedBrands.filter((b) => b !== brand)
      : [...filters.selectedBrands, brand];
    onChange({ ...filters, selectedBrands: next });
  };

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
    filters.selectedBrands.length +
    filters.selectedCategories.length +
    filters.selectedVoltages.length +
    (filters.inStockOnly ? 1 : 0);

  const filterContent = (
    <div className="flex flex-col gap-8">
      {/* Header with active counts & reset */}
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
            Filters
          </span>
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-xs font-semibold text-neutral-400 hover:text-black transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* In-stock toggle */}
      <div className="flex items-center justify-between">
        <label htmlFor="instock-filter" className="text-xs font-medium text-neutral-800 cursor-pointer">
          In Stock Only
        </label>
        <button
          id="instock-filter"
          type="button"
          onClick={handleStockToggle}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
            filters.inStockOnly ? 'bg-black' : 'bg-neutral-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              filters.inStockOnly ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Brand Facets */}
      <div>
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
          Brand
        </h4>
        <div className="flex flex-col gap-2">
          {brandFacets.map((b) => {
            const checked = filters.selectedBrands.includes(b.value);
            return (
              <label
                key={b.value}
                onClick={() => handleBrandToggle(b.value)}
                className="group flex items-center justify-between py-1 text-xs cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-md border transition-colors ${
                      checked
                        ? 'bg-black border-black text-white'
                        : 'border-neutral-300 bg-white group-hover:border-neutral-400'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span
                    className={`font-medium transition-colors ${
                      checked ? 'text-black font-semibold' : 'text-neutral-600 group-hover:text-black'
                    }`}
                  >
                    {b.value}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-neutral-400">({b.count})</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Category Facets */}
      <div>
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
          Category
        </h4>
        <div className="flex flex-col gap-2">
          {categoryFacets.map((c) => {
            const checked = filters.selectedCategories.includes(c.value);
            return (
              <label
                key={c.value}
                onClick={() => handleCategoryToggle(c.value)}
                className="group flex items-center justify-between py-1 text-xs cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-md border transition-colors ${
                      checked
                        ? 'bg-black border-black text-white'
                        : 'border-neutral-300 bg-white group-hover:border-neutral-400'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span
                    className={`font-medium transition-colors ${
                      checked ? 'text-black font-semibold' : 'text-neutral-600 group-hover:text-black'
                    }`}
                  >
                    {c.value}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-neutral-400">({c.count})</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Voltage / Unit of Measure Specs Facets */}
      <div>
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">
          Չափման միավոր / Unit
        </h4>
        <div className="flex flex-col gap-2">
          {voltageFacets.map((v) => {
            const checked = filters.selectedVoltages.includes(v.value);
            return (
              <label
                key={v.value}
                onClick={() => handleVoltageToggle(v.value)}
                className="group flex items-center justify-between py-1 text-xs cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-md border transition-colors ${
                      checked
                        ? 'bg-black border-black text-white'
                        : 'border-neutral-300 bg-white group-hover:border-neutral-400'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span
                    className={`font-medium transition-colors ${
                      checked ? 'text-black font-semibold' : 'text-neutral-600 group-hover:text-black'
                    }`}
                  >
                    {v.value}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-neutral-400">({v.count})</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Price Range Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Մանրածախ գին (֏)
          </h4>
          <span className="text-xs font-mono font-bold text-neutral-900">
            {filters.priceRange[0].toLocaleString()} - {filters.priceRange[1].toLocaleString()} ֏
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="300000"
          step="1000"
          value={filters.priceRange[1]}
          onChange={(e) =>
            onChange({
              ...filters,
              priceRange: [filters.priceRange[0], Number(e.target.value)],
            })
          }
          className="w-full accent-black cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-neutral-400 font-mono mt-1">
          <span>0 ֏</span>
          <span>150,000 ֏</span>
          <span>300,000+ ֏</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Persistent, non-reloading dynamic facet filters) */}
      <aside className="hidden lg:block w-64 flex-shrink-0 pr-6">
        <div className="sticky top-28 rounded-2xl bg-white p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)]">
          {filterContent}
        </div>
      </aside>

      {/* Mobile Slide-over Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />

            {/* Slide-over panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 right-0 flex w-full max-w-xs flex-col bg-white p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                <span className="text-sm font-bold text-neutral-900 uppercase">Filters</span>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="rounded-full p-1.5 text-neutral-400 hover:text-black"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-6">{filterContent}</div>

              <div className="pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={onCloseMobile}
                  className="w-full rounded-xl bg-black py-3 text-center text-xs font-bold text-white shadow-md"
                >
                  Show {totalFilteredCount} Products
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
