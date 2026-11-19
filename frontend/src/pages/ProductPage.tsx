import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { ApiError, api, errorMessage } from '../api/client';
import type { ProductDetail } from '../api/types';
import { Button, Notice, Price, ProductImage, QuantityStepper, Spinner, StockBadge, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { href } from '../router';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { useWishlist } from '../state/wishlist';

export function ProductPage({ slug }: { slug: string }) {
  const { t, money, unit, category, name } = useI18n();
  const { sessionKey } = useAuth();
  const { quantityOf, setQuantity, open } = useCart();
  const { ids, toggle } = useWishlist();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState('loading');
    api<ProductDetail>(`/products/${encodeURIComponent(slug)}`)
      .then((p) => { setProduct(p); setState('ready'); setQty(1); })
      .catch((e: unknown) => setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error'));
  }, [slug, sessionKey]);

  if (state === 'loading') return <Spinner label={t('common.loading')} />;
  if (state !== 'ready' || !product) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-16 sm:px-6">
        <Notice>{state === 'missing' ? t('product.not_found') : t('common.network')}</Notice>
        <a href={href('/')} className="text-sm font-medium text-brand-deep hover:underline">← {t('product.back')}</a>
      </div>
    );
  }

  const inCart = quantityOf(product.id);
  const maxAdd = Math.max(0, product.available_quantity - inCart);
  const saved = ids.has(product.id);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await setQuantity(product.id, inCart + qty);
      open();
    } catch (e) {
      setError(errorMessage(e, t('common.network')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <a href={href(`/?category=${product.category.slug}`)} className="text-sm text-ink-soft hover:text-ink">
        ← {category(product.category.slug, product.category.name)}
      </a>
      <div className="mt-4 grid gap-8 pb-16 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-card border border-line bg-white p-6">
          <ProductImage src={product.image_url} alt={name(product)} category={product.category.slug} eager />
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold leading-snug text-ink sm:text-3xl">{name(product)}</h1>
            <p className="mt-2 text-sm text-ink-faint">{t('product.sku')} {product.sku}</p>
          </div>
          <div className="flex items-end gap-3">
            <Price value={product.price} className="text-3xl" />
            <span className="pb-1 text-sm text-ink-faint">/ {unit(product.unit_of_measure)}</span>
          </div>
          {product.pricing_tier === 'wholesale' && (
            <p className="-mt-3 text-sm text-brand-deep">
              {t('product.wholesale')} · {t('product.retail_was', { price: money(product.retail_price) })}
            </p>
          )}
          <StockBadge inStock={product.in_stock} available={product.available_quantity} />

          {product.in_stock && (
            <div className="flex flex-wrap items-center gap-3">
              <QuantityStepper label={t('product.quantity')} value={Math.min(qty, Math.max(maxAdd, 1))} max={Math.max(maxAdd, 1)} onChange={setQty} />
              <Button onClick={add} busy={busy} disabled={maxAdd === 0}>
                {inCart > 0 ? `${t('product.added')} (${inCart})` : t('product.add')}
              </Button>
              <button type="button" onClick={() => void toggle(product.id)} aria-pressed={saved}
                aria-label={saved ? t('wishlist.remove') : t('wishlist.add')}
                className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white hover:border-ink">
                <Heart className={cx('h-4 w-4', saved && 'fill-ink')} aria-hidden />
              </button>
            </div>
          )}
          {error && <Notice>{error}</Notice>}

          {product.description && <p className="text-[15px] leading-7 text-ink-soft">{product.description}</p>}

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
            <dt className="text-ink-faint">{t('product.category')}</dt><dd className="text-ink">{category(product.category.slug, product.category.name)}</dd>
            <dt className="text-ink-faint">{t('product.unit')}</dt><dd className="text-ink">{unit(product.unit_of_measure)}</dd>
            {product.barcode && (<><dt className="text-ink-faint">{t('product.barcode')}</dt><dd className="tabular-nums text-ink">{product.barcode}</dd></>)}
          </dl>
        </div>
      </div>
    </div>
  );
}
