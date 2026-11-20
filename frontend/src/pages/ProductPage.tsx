import { useEffect, useState } from 'react';
import { Building2, Heart, Store, Truck } from 'lucide-react';
import { ApiError, api, errorMessage } from '../api/client';
import type { ProductDetail, ProductPage as ProductList, ProductSummary } from '../api/types';
import { ProductCard } from '../components/ProductCard';
import { Button, Notice, Price, ProductImage, QuantityStepper, StockBadge, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { href } from '../router';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { useWishlist } from '../state/wishlist';

export function ProductPage({ slug }: { slug: string }) {
  const { t, money, unit, category, name, lang } = useI18n();
  const { sessionKey } = useAuth();
  const { quantityOf, setQuantity, open } = useCart();
  const { ids, toggle } = useWishlist();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<ProductSummary[]>([]);

  useEffect(() => {
    // Abort on slug change: a slow response for the previous product must never
    // overwrite the one the customer navigated to.
    const controller = new AbortController();
    setState('loading');
    api<ProductDetail>(`/products/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then((p) => { setProduct(p); setState('ready'); setQty(1); })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error');
      });
    return () => controller.abort();
  }, [slug, sessionKey]);

  const categorySlug = product?.category.slug;
  useEffect(() => {
    if (!categorySlug) return;
    const controller = new AbortController();
    api<ProductList>('/products', {
      query: { category: [categorySlug], sort: 'featured', page_size: 5, lang },
      signal: controller.signal,
    })
      .then((page) => setRelated(page.items.filter((p) => p.slug !== slug).slice(0, 4)))
      .catch(() => setRelated([]));
    return () => controller.abort();
  }, [categorySlug, slug, lang]);

  if (state === 'loading') {
    return (
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2" aria-busy="true" aria-label={t('common.loading')}>
        <div className="aspect-square animate-pulse rounded-card bg-white" />
        <div className="space-y-4 pt-2">
          <div className="h-8 w-4/5 animate-pulse rounded bg-white" />
          <div className="h-4 w-1/4 animate-pulse rounded bg-white" />
          <div className="h-10 w-1/3 animate-pulse rounded bg-white" />
        </div>
      </div>
    );
  }
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
      <div className="mt-4 grid gap-8 pb-12 md:grid-cols-2">
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

          <section className="rounded-card border border-line bg-white p-4" aria-labelledby="delivery-title">
            <h2 id="delivery-title" className="text-sm font-semibold text-ink">{t('product.delivery_title')}</h2>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-soft">
              <li className="flex gap-3"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />{t('product.delivery_express')}</li>
              <li className="flex gap-3"><Store className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />{t('product.delivery_pickup')}</li>
              <li className="flex gap-3"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />{t('product.delivery_b2b')}</li>
            </ul>
          </section>

          {product.description && <p className="text-[15px] leading-7 text-ink-soft">{product.description}</p>}

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
            <dt className="text-ink-faint">{t('product.category')}</dt><dd className="text-ink">{category(product.category.slug, product.category.name)}</dd>
            <dt className="text-ink-faint">{t('product.unit')}</dt><dd className="text-ink">{unit(product.unit_of_measure)}</dd>
            {product.barcode && (<><dt className="text-ink-faint">{t('product.barcode')}</dt><dd className="tabular-nums text-ink">{product.barcode}</dd></>)}
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section className="border-t border-line pb-20 pt-10" aria-labelledby="related-title">
          <h2 id="related-title" className="mb-5 text-lg font-semibold text-ink">{t('product.related')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
