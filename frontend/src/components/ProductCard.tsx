import { useState } from 'react';
import { Check, Heart, ShoppingCart } from 'lucide-react';
import { errorMessage } from '../api/client';
import type { ProductSummary } from '../api/types';
import { useI18n } from '../i18n';
import { href } from '../router';
import { useCart } from '../state/cart';
import { useWishlist } from '../state/wishlist';
import { Price, ProductImage, StockBadge, cx } from './ui';

export function ProductCard({ product, eager }: { product: ProductSummary; eager?: boolean }) {
  const { t, unit } = useI18n();
  const { quantityOf, setQuantity, open } = useCart();
  const { ids, toggle } = useWishlist();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inCart = quantityOf(product.id);
  const saved = ids.has(product.id);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await setQuantity(product.id, inCart + 1);
      if (inCart === 0) open();
    } catch (e) {
      setError(errorMessage(e, t('common.network')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-white transition-transform duration-200 ease-out hover:-translate-y-0.5">
      <a href={href(`/product/${product.slug}`)} className="block aspect-square overflow-hidden bg-white p-3">
        <ProductImage
          src={product.image_url}
          alt={product.name}
          category={product.category.slug}
          eager={eager}
          className="transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
      </a>
      <button
        type="button"
        onClick={() => void toggle(product.id)}
        aria-pressed={saved}
        aria-label={saved ? t('wishlist.remove') : t('wishlist.add')}
        className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink shadow-sm hover:bg-white"
      >
        <Heart className={cx('h-4 w-4', saved && 'fill-ink')} aria-hidden />
      </button>

      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3">
        <a href={href(`/product/${product.slug}`)} className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-ink hover:underline">
          {product.name}
        </a>
        <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
          <span>{unit(product.unit_of_measure)}</span>
          <StockBadge inStock={product.in_stock} available={product.available_quantity} />
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div>
            <Price value={product.price} className="text-base" />
            {product.pricing_tier === 'wholesale' && (
              <p className="text-[11px] font-medium text-brand-deep">{t('product.wholesale')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={add}
            disabled={!product.in_stock || busy || inCart >= product.available_quantity}
            aria-label={`${t('product.add')}: ${product.name}`}
            className={cx(
              'grid h-10 w-10 place-items-center rounded-lg transition-transform hover:-translate-y-px active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
              inCart ? 'bg-brand text-ink' : 'bg-ink text-white',
            )}
          >
            {inCart ? <Check className="h-4 w-4" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      </div>
    </article>
  );
}
