import React from 'react';
import { motion } from 'framer-motion';
import { Heart, ShoppingBag, Check, Barcode, Layers } from 'lucide-react';
import { Product } from '../../types/product';
import { useWishlist } from '../../hooks/useWishlist';

interface ProductCardProps {
  product: Product;
  onAddToCart?: (product: Product) => void;
  onQuickView?: (product: Product) => void;
}

const DEFAULT_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80';

export function formatProductPrice(amount: number, currency: string = 'AMD'): string {
  if (currency === 'AMD' || currency === '֏') {
    return `${Number(amount || 0).toLocaleString('en-US', {
      maximumFractionDigits: 0,
    })} ֏`;
  }
  return `$${Number(amount || 0).toFixed(2)}`;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  onQuickView,
}) => {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const isSaved = isInWishlist(product.id);
  const [justAdded, setJustAdded] = React.useState(false);

  // Display retail_price by default per specification
  const retailPrice =
    typeof product.retail_price === 'number' ? product.retail_price : product.price;
  const wholesalePrice =
    typeof product.wholesale_price === 'number' ? product.wholesale_price : 0;
  const unitOfMeasure = product.unit_of_measure || 'հատ';
  const isActive = product.is_active !== undefined ? product.is_active : product.inStock;
  const resolvedImage =
    product.image_url || product.imageUrl || product.thumbnailUrl || DEFAULT_FALLBACK_IMAGE;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddToCart && isActive) {
      onAddToCart(product);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1400);
    }
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        y: -8,
        transition: {
          duration: 0.35,
          ease: [0.16, 1, 0.3, 1], // Antigravity weightless cubic-bezier curve
        },
      }}
      onClick={() => onQuickView?.(product)}
      style={{ willChange: 'transform, box-shadow' }}
      className="group relative flex flex-col justify-between rounded-2xl bg-white p-5 cursor-pointer
                 border border-neutral-100/80
                 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)]
                 hover:-translate-y-2
                 hover:shadow-[0_24px_48px_-12px_rgba(11,15,23,0.12)]
                 transition-all duration-300 ease-out select-none"
    >
      {/* Top Header: Category / Unit Badge & Floating Wishlist Heart */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
            <Layers className="h-2.5 w-2.5 text-neutral-400" />
            {product.category || 'Uncategorized'}
          </span>
          <span className="inline-flex items-center rounded-md bg-neutral-900/5 px-2 py-0.5 text-[10px] font-semibold text-neutral-700">
            {unitOfMeasure}
          </span>
          {product.discount_percent > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              -{product.discount_percent}%
            </span>
          )}
        </div>

        {/* Antigravity Micro-Animated Heart Button */}
        <motion.button
          type="button"
          aria-label={isSaved ? 'Remove from favorites' : 'Save to favorites'}
          whileTap={{ scale: 0.8 }}
          whileHover={{ scale: 1.15 }}
          onClick={handleWishlistToggle}
          className="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-50/80
                     text-neutral-400 backdrop-blur-sm transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <motion.div
            animate={isSaved ? { scale: [1, 1.35, 1] } : { scale: 1 }}
            transition={{ duration: 0.3, type: 'spring', stiffness: 400 }}
          >
            <Heart
              className={`h-4 w-4 transition-colors ${
                isSaved ? 'fill-red-500 text-red-500' : 'stroke-current'
              }`}
            />
          </motion.div>
        </motion.button>
      </div>

      {/* Product Image Stage: High Whitespace & Subtle Float Zoom */}
      <div className="relative my-5 flex h-44 w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-50/60">
        <motion.img
          src={resolvedImage}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = DEFAULT_FALLBACK_IMAGE;
          }}
          className="h-full w-full object-contain p-4 transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* VAT Badge */}
        {product.vat_applicable && (
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-neutral-500 shadow-sm backdrop-blur-sm">
            ԱԱՀ ներառված
          </span>
        )}

        {/* Active / Stock Status Overlay */}
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/75 backdrop-blur-[2px]">
            <span className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              Փակված / Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Product Information */}
      <div className="flex flex-col flex-grow">
        {/* Product Title ("Անվանում") */}
        <h3
          title={product.name}
          className="line-clamp-2 text-sm font-semibold tracking-tight text-neutral-900 group-hover:text-black min-h-[2.5rem]"
        >
          {product.name}
        </h3>

        {/* SKU ("Կոդ") & Barcode ("Գծիկավոր կոդ") Minimal Muted Labels */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-neutral-400">
          <span>Կոդ: <strong className="text-neutral-600">{product.sku}</strong></span>
          {product.barcode && (
            <span className="inline-flex items-center gap-1">
              <Barcode className="h-3 w-3" />
              {product.barcode}
            </span>
          )}
        </div>

        {/* Retail Price (Default) & High-Contrast CTA */}
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-neutral-100/80">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-extrabold tracking-tight text-neutral-900">
                {formatProductPrice(retailPrice, product.currency)}
              </span>
              <span className="text-[11px] text-neutral-400 font-medium">
                / {unitOfMeasure}
              </span>
            </div>
            {wholesalePrice > 0 && (
              <span className="text-[10px] font-medium text-neutral-500">
                Մեծածախ՝ {formatProductPrice(wholesalePrice, product.currency)}
              </span>
            )}
          </div>

          {/* High-Contrast "Add to Cart" Antigravity CTA Button */}
          <motion.button
            type="button"
            disabled={!isActive}
            onClick={handleAddToCart}
            whileHover={isActive ? { scale: 1.04 } : undefined}
            whileTap={isActive ? { scale: 0.96 } : undefined}
            className={`relative z-10 flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold tracking-wide transition-all ${
              !isActive
                ? 'cursor-not-allowed bg-neutral-100 text-neutral-400'
                : justAdded
                ? 'bg-emerald-600 text-white'
                : 'bg-[#0B0F17] text-white shadow-sm hover:bg-black hover:shadow-md'
            }`}
          >
            {justAdded ? (
              <>
                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Added</span>
              </>
            ) : (
              <>
                <ShoppingBag className="h-3.5 w-3.5 stroke-[2]" />
                <span>Add</span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
};
