'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Heart, ShoppingCart, Check, Barcode, Plus, Minus, Eye } from 'lucide-react';
import { Product } from '../../types/product';
import { useWishlist } from '../../hooks/useWishlist';
import { useLanguage } from '../../context/LanguageContext';

interface ProductCardProps {
  product: Product;
  viewMode?: 'grid' | 'list';
  onAddToCart?: (product: Product, quantity?: number) => void;
  onQuickView?: (product: Product) => void;
}

const HIGH_RES_FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=1000&q=85',
  'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1000&q=85',
];

export function getHighResFallbackImage(sku: string = ''): string {
  const sum = Array.from(sku).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return HIGH_RES_FALLBACK_IMAGES[sum % HIGH_RES_FALLBACK_IMAGES.length];
}

export function formatProductPrice(amount: number, currency: string = 'AMD'): string {
  if (currency === 'AMD' || currency === '֏') {
    return `${Number(amount || 0).toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })} ֏`;
  }
  return `$${Number(amount || 0).toFixed(2)}`;
}

const ProductCardComponent: React.FC<ProductCardProps> = ({
  product,
  viewMode = 'grid',
  onAddToCart,
  onQuickView,
}) => {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { t, translateCategory, translateUnit } = useLanguage();
  const isSaved = isInWishlist(product.id);
  const [quantity, setQuantity] = useState<number>(1);
  const [justAdded, setJustAdded] = useState<boolean>(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) {
        clearTimeout(addedTimerRef.current);
      }
    };
  }, []);

  const retailPrice =
    typeof product.retail_price === 'number' ? product.retail_price : product.price;
  const wholesalePrice =
    typeof product.wholesale_price === 'number' ? product.wholesale_price : 0;
  const unitOfMeasure = translateUnit(product.unit_of_measure || 'հատ');
  const translatedCategory = translateCategory(product.category || 'Uncategorized');
  const isActive = product.is_active !== undefined ? product.is_active : product.inStock;
  const fallbackImg = getHighResFallbackImage(product.sku);
  const resolvedImage =
    product.image_url || product.imageUrl || product.thumbnailUrl || fallbackImg;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddToCart && isActive) {
      onAddToCart(product, quantity);
      setJustAdded(true);
      if (addedTimerRef.current) {
        clearTimeout(addedTimerRef.current);
      }
      addedTimerRef.current = setTimeout(() => {
        setJustAdded(false);
        setQuantity(1);
      }, 1300);
    }
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product);
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuantity((q) => Math.max(1, q - 1));
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuantity((q) => Math.min(99, q + 1));
  };

  // =========================================================================
  // HORIZONTAL LIST VIEW
  // =========================================================================
  if (viewMode === 'list') {
    return (
      <motion.article
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => onQuickView?.(product)}
        className="group relative flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-5 rounded-2xl bg-white p-5 cursor-pointer select-none
                   shadow-[0_4px_20px_-4px_rgba(11,15,23,0.05)]
                   hover:-translate-y-1 hover:shadow-[0_20px_40px_-12px_rgba(11,15,23,0.12)]
                   transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="flex items-center gap-5 min-w-0 flex-1">
          <div className="relative h-28 w-28 sm:h-32 sm:w-32 flex-shrink-0 overflow-hidden rounded-xl bg-[#F5F7F8]">
            <img
              src={resolvedImage}
              alt={product.name}
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = fallbackImg;
              }}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span className="absolute top-2 left-2 rounded bg-white/95 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#0D5257] shadow-sm">
              #{product.sku}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="rounded-md bg-[#0D5257]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0D5257]">
                {translatedCategory}
              </span>
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700">
                {t('unitOfMeasureLabel')}՝ {unitOfMeasure}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isActive ? 'bg-emerald-500' : 'bg-neutral-400'
                  }`}
                />
                {isActive ? t('inStockWarehouse') : t('outOfStock')}
              </span>
            </div>

            <h3 className="text-base font-extrabold text-[#0B0F17] group-hover:text-[#0D5257] transition-colors line-clamp-2">
              {product.name}
            </h3>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-mono text-neutral-500">
              <span>
                {t('skuLabel')}: <strong className="text-[#0B0F17]">{product.sku}</strong>
              </span>
              {product.barcode && (
                <span className="inline-flex items-center gap-1">
                  <Barcode className="h-3.5 w-3.5 text-neutral-400" />
                  {product.barcode}
                </span>
              )}
              {product.vat_applicable && (
                <span className="text-emerald-700 font-sans font-semibold">
                  • {t('vatIncluded')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
          <div className="text-left sm:text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              {t('retailPriceLabel')}
            </span>
            <div className="flex items-baseline sm:justify-end gap-1.5 tabular-nums">
              <span className="text-2xl font-black text-[#0B0F17]">
                {formatProductPrice(retailPrice, product.currency)}
              </span>
              <span className="text-xs font-semibold text-neutral-400">/ {unitOfMeasure}</span>
            </div>
            {wholesalePrice > 0 && (
              <span className="block text-[11px] font-semibold text-[#0D5257] tabular-nums">
                {t('wholesalePriceLabel')}: {formatProductPrice(wholesalePrice, product.currency)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleWishlistToggle}
              aria-label={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                isSaved
                  ? 'bg-red-50 text-[#DA291C]'
                  : 'bg-[#F5F7F8] text-neutral-500 hover:bg-neutral-200 hover:text-[#0B0F17]'
              }`}
            >
              <Heart className={`h-4 w-4 ${isSaved ? 'fill-[#DA291C] text-[#DA291C]' : ''}`} />
            </button>

            <div
              onClick={(e) => e.stopPropagation()}
              className="flex h-10 items-center rounded-xl bg-[#F5F7F8] px-1"
            >
              <button
                type="button"
                onClick={handleDecrement}
                aria-label="Decrease quantity"
                className="flex h-8 w-7 items-center justify-center rounded-lg text-neutral-600 hover:bg-white hover:text-black transition-colors"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-7 text-center font-mono text-xs font-extrabold text-[#0B0F17] tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                aria-label="Increase quantity"
                className="flex h-8 w-7 items-center justify-center rounded-lg text-neutral-600 hover:bg-white hover:text-black transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            <button
              type="button"
              disabled={!isActive}
              onClick={handleAddToCart}
              className={`flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-xs font-extrabold tracking-wide transition-all ${
                !isActive
                  ? 'cursor-not-allowed bg-neutral-100 text-neutral-400'
                  : justAdded
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-[#DA291C] text-white shadow-sm hover:bg-[#b82216]'
              }`}
            >
              {justAdded ? (
                <>
                  <Check className="h-4 w-4 stroke-[2.5]" />
                  <span>{t('addedToCart')}</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" />
                  <span>{t('addToCart')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.article>
    );
  }

  // =========================================================================
  // GRID VIEW
  // =========================================================================
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        y: -8,
        transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
      }}
      onClick={() => onQuickView?.(product)}
      className="group relative flex h-full flex-col justify-between rounded-2xl bg-white p-5 cursor-pointer select-none
                 shadow-[0_4px_20px_-4px_rgba(11,15,23,0.05)]
                 hover:-translate-y-2 hover:shadow-[0_24px_48px_-12px_rgba(11,15,23,0.14)]
                 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="truncate max-w-[165px] rounded-md bg-[#0D5257]/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0D5257]">
            {translatedCategory}
          </span>
          <span className="rounded-md bg-[#F5F7F8] px-2 py-1 text-[10px] font-bold text-neutral-700">
            {unitOfMeasure}
          </span>
          {product.discount_percent > 0 && (
            <span className="rounded-md bg-[#DA291C] px-2 py-0.5 text-[10px] font-extrabold text-white">
              -{product.discount_percent}%
            </span>
          )}
        </div>

        <motion.button
          type="button"
          aria-label={isSaved ? 'Remove from favorites' : 'Save to favorites'}
          whileTap={{ scale: 0.85 }}
          whileHover={{ scale: 1.12 }}
          onClick={handleWishlistToggle}
          className={`relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
            isSaved
              ? 'bg-red-50 text-[#DA291C]'
              : 'bg-[#F5F7F8] text-neutral-400 hover:bg-neutral-200/70 hover:text-[#0B0F17]'
          }`}
        >
          <Heart
            className={`h-4 w-4 transition-colors ${
              isSaved ? 'fill-[#DA291C] text-[#DA291C]' : 'stroke-current'
            }`}
          />
        </motion.button>
      </div>

      <div className="relative my-4 flex h-48 w-full items-center justify-center overflow-hidden rounded-xl bg-[#F5F7F8]">
        <img
          src={resolvedImage}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = fallbackImg;
          }}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />

        <span className="absolute top-2.5 left-2.5 rounded-md bg-white/95 px-2 py-0.5 font-mono text-[10px] font-extrabold text-[#0B0F17] shadow-sm">
          {t('skuLabel')} {product.sku}
        </span>

        <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 backdrop-blur-sm">
          <Eye className="h-3 w-3" />
          <span>{t('quickView')}</span>
        </span>

        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[2px]">
            <span className="rounded-lg bg-neutral-900 px-3 py-1 text-[10px] font-bold tracking-wider text-white uppercase">
              {t('outOfStock')}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between">
        <div>
          <h3
            title={product.name}
            className="line-clamp-2 min-h-[2.6rem] text-sm font-extrabold leading-snug text-[#0B0F17] group-hover:text-[#0D5257] transition-colors"
          >
            {product.name}
          </h3>

          <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-neutral-400">
            <span className="inline-flex items-center gap-1 text-emerald-700 font-sans font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t('inStock')}
            </span>
            {product.barcode ? (
              <span className="inline-flex items-center gap-1 text-neutral-500">
                <Barcode className="h-3 w-3 text-neutral-400" />
                {product.barcode}
              </span>
            ) : (
              <span>{t('vatIncluded')}</span>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-100">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                {t('retailPriceLabel')}
              </span>
              <div className="flex items-baseline gap-1 tabular-nums">
                <span className="text-xl font-black tracking-tight text-[#0B0F17]">
                  {formatProductPrice(retailPrice, product.currency)}
                </span>
                <span className="text-xs font-semibold text-neutral-400">
                  / {unitOfMeasure}
                </span>
              </div>
            </div>

            {wholesalePrice > 0 && (
              <div className="text-right">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-[#0D5257]">
                  {t('wholesalePriceLabel')}
                </span>
                <span className="text-xs font-extrabold text-[#0D5257] tabular-nums">
                  {formatProductPrice(wholesalePrice, product.currency)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex h-10 items-center rounded-xl bg-[#F5F7F8] px-1"
            >
              <button
                type="button"
                onClick={handleDecrement}
                aria-label="Decrease quantity"
                className="flex h-8 w-7 items-center justify-center rounded-lg text-neutral-600 hover:bg-white hover:text-black transition-colors"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-6 text-center font-mono text-xs font-extrabold text-[#0B0F17] tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                aria-label="Increase quantity"
                className="flex h-8 w-7 items-center justify-center rounded-lg text-neutral-600 hover:bg-white hover:text-black transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            <motion.button
              type="button"
              disabled={!isActive}
              onClick={handleAddToCart}
              whileTap={isActive ? { scale: 0.97 } : undefined}
              className={`flex-1 flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-extrabold tracking-wide transition-all ${
                !isActive
                  ? 'cursor-not-allowed bg-neutral-100 text-neutral-400'
                  : justAdded
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-[#DA291C] text-white shadow-sm hover:bg-[#b82216]'
              }`}
            >
              {justAdded ? (
                <>
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>{t('addedToCart')}</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="h-3.5 w-3.5 stroke-[2.2]" />
                  <span>{t('addToCart')}</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.article>
  );
};

export const ProductCard = React.memo(ProductCardComponent);
