import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Check } from 'lucide-react';
import { Product } from '../../types/product';
import { useLanguage } from '../../context/LanguageContext';
import { formatProductPrice } from './ProductCard';

interface StickyCartBarProps {
  product: Product | null;
  visible: boolean;
  onAddToCart: (product: Product) => void;
}

export const StickyCartBar: React.FC<StickyCartBarProps> = ({
  product,
  visible,
  onAddToCart,
}) => {
  const { t, translateCategory } = useLanguage();
  const [justAdded, setJustAdded] = React.useState(false);

  if (!product) return null;

  const handleAdd = () => {
    onAddToCart(product);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-100 shadow-[0_-10px_30px_rgba(0,0,0,0.06)]"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3.5">
            {/* Left: Product Thumbnail & Title */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 flex-shrink-0 rounded-lg bg-neutral-100 p-1">
                <img
                  src={product.thumbnailUrl || product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  {translateCategory(product.category || product.brand)}
                </span>
                <h4 className="truncate text-xs sm:text-sm font-semibold text-neutral-900 max-w-xs sm:max-w-md">
                  {product.name}
                </h4>
              </div>
            </div>

            {/* Right: Price & Add to Cart CTA */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="text-right">
                <div className="text-sm sm:text-base font-extrabold text-neutral-900 font-mono tabular-nums">
                  {formatProductPrice(
                    typeof product.retail_price === 'number'
                      ? product.retail_price
                      : product.price,
                    product.currency
                  )}
                </div>
                <div className="text-[10px] text-emerald-600 font-medium">
                  {product.inStock ? t('catalog.ready_to_ship') : t('catalog.out_of_stock')}
                </div>
              </div>

              <motion.button
                type="button"
                disabled={!product.inStock}
                onClick={handleAdd}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className={`flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-bold tracking-wide transition-colors ${
                  justAdded
                    ? 'bg-emerald-600 text-white'
                    : 'bg-black text-white hover:bg-neutral-900'
                }`}
              >
                {justAdded ? (
                  <>
                    <Check className="h-4 w-4 stroke-[2.5]" />
                    <span>{t('addedToCart')}</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-4 w-4" />
                    <span>{t('addToCart')}</span>
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
