import { useState } from 'react';
import { Check, Heart, Plus } from 'lucide-react';
import { errorMessage } from '../api/client';
import type { ProductSummary } from '../api/types';
import { useI18n } from '../i18n';
import { href } from '../router';
import { useCart } from '../state/cart';
import { useWishlist } from '../state/wishlist';
import { Price, ProductImage, cx } from './ui';

/**
 * Card hierarchy: photo, name, price per unit. Stock appears only when it changes
 * the decision (few left / sold out), never as a repeated "in stock" label.
 */
export function ProductCard({ product, eager }: { product: ProductSummary; eager?: boolean }) {
  const { t, unit, name } = useI18n();
  const title = name(product);
  const { quantityOf, setQuantity, open } = useCart();
  const { ids, toggle } = useWishlist();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inCart = quantityOf(product.id);
  const saved = ids.has(product.id);
  const soldOut = !product.in_stock;
  const fewLeft = product.in_stock && product.available_quantity <= 5;

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
    <article className="group relative flex flex-col rounded-card border border-line bg-white transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-ink-faint/60">
      <a
        href={href(`/product/${product.slug}`)}
        className="block aspect-square overflow-hidden rounded-t-card p-4"
        tabIndex={-1}
        aria-hidden
      >
        <ProductImage
          src={product.image_url}
          alt=""
          category={product.category.slug}
          eager={eager}
          className={cx(
            'rounded-md transition-transform duration-300 ease-out group-hover:scale-[1.03]',
            soldOut && 'opacity-50',
          )}
        />
      </a>
      <button
        type="button"
        onClick={() => void toggle(product.id)}
        aria-pressed={saved}
        aria-label={saved ? t('wishlist.remove') : t('wishlist.add')}
        className="absolute right-1.5 top-1.5 grid h-11 w-11 place-items-center rounded-full text-ink transition-[background-color,transform] hover:bg-canvas active:scale-90"
      >
        <Heart className={cx('h-[18px] w-[18px]', saved && 'fill-ink')} aria-hidden />
      </button>

      <div className="flex flex-1 flex-col px-3 pb-3">
        <a
          href={href(`/product/${product.slug}`)}
          className="line-clamp-2 min-h-10 text-sm font-medium leading-5 text-ink underline-offset-2 hover:underline"
        >
          {title}
        </a>

        <p className="mt-1 h-4 text-xs font-medium" aria-live="polite">
          {soldOut && <span className="text-ink-faint">{t('product.out_of_stock')}</span>}
          {fewLeft && <span className="text-brand-deep">{t('product.low_stock', { count: product.available_quantity })}</span>}
        </p>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="whitespace-nowrap">
              <Price value={product.price} className="text-[15px]" />
              <span className="ml-1 text-xs text-ink-faint">/ {unit(product.unit_of_measure)}</span>
            </p>
            {product.pricing_tier === 'wholesale' && (
              <p className="text-[11px] font-medium text-brand-deep">{t('product.wholesale')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={add}
            disabled={soldOut || busy || inCart >= product.available_quantity}
            aria-label={`${inCart ? t('product.added') : t('product.add')}: ${title}`}
            className={cx(
              'grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-[transform,background-color] duration-150 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-30',
              inCart ? 'bg-brand text-ink' : 'bg-ink text-white hover:bg-black',
            )}
          >
            {inCart ? <Check className="h-[18px] w-[18px]" aria-hidden /> : <Plus className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
      </div>
    </article>
  );
}
