import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import type { CatalogFilters, ProductPage, SortOption } from '../api/types';
import { ProductCard } from '../components/ProductCard';
import { Button, Notice, Spinner, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { navigate, type Route } from '../router';
import { useAuth } from '../state/auth';

const SORTS: SortOption[] = ['relevance', 'name', 'price_asc', 'price_desc', 'newest'];
const PAGE_SIZE = 24;

function filtersFrom(query: URLSearchParams): CatalogFilters {
  return {
    q: query.get('q') ?? undefined,
    category: query.getAll('category'),
    unit: query.getAll('unit'),
    min_price: query.get('min') ?? undefined,
    max_price: query.get('max') ?? undefined,
    in_stock: query.get('stock') === '1',
    sort: (query.get('sort') as SortOption | null) ?? (query.get('q') ? 'relevance' : 'name'),
    page: Number(query.get('page') ?? '1') || 1,
  };
}

function toQuery(f: CatalogFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.q) q.set('q', f.q);
  f.category?.forEach((c) => q.append('category', c));
  f.unit?.forEach((u) => q.append('unit', u));
  if (f.min_price) q.set('min', f.min_price);
  if (f.max_price) q.set('max', f.max_price);
  if (f.in_stock) q.set('stock', '1');
  if (f.sort && f.sort !== (f.q ? 'relevance' : 'name')) q.set('sort', f.sort);
  if (f.page && f.page > 1) q.set('page', String(f.page));
  return q;
}

export function CatalogPage({ route }: { route: Route }) {
  const { t } = useI18n();
  const { sessionKey } = useAuth();
  const reduceMotion = useReducedMotion();
  const filters = filtersFrom(route.query);
  const key = route.query.toString();
  const [data, setData] = useState<ProductPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    api<ProductPage>('/products', {
      query: { ...filters, in_stock: filters.in_stock || undefined, page_size: PAGE_SIZE },
      signal: controller.signal,
    })
      .then(setData)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed(error instanceof Error);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` encodes every filter
  }, [key, attempt, sessionKey]);

  const update = (patch: Partial<CatalogFilters>) => navigate('/', toQuery({ ...filters, page: 1, ...patch }));
  const toggleIn = (list: string[] = [], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const hasFilters = Boolean(filters.category?.length || filters.unit?.length || filters.min_price || filters.max_price || filters.in_stock);
  const isHome = !filters.q && !hasFilters && (filters.page ?? 1) === 1;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {isHome && (
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="py-10 sm:py-14"
        >
          <h1 className="max-w-3xl text-3xl font-bold leading-tight text-ink sm:text-5xl">{t('hero.title')}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-soft sm:text-lg">{t('hero.subtitle')}</p>
        </motion.section>
      )}

      <div className={cx('flex items-center justify-between gap-3', isHome ? 'pb-4' : 'py-6')}>
        <h2 className="text-lg font-semibold text-ink">
          {filters.q ? `«${filters.q}»` : t('catalog.title')}
          {data && <span className="ml-2 text-sm font-normal text-ink-faint">{t('catalog.results', { count: data.pagination.total_items })}</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowFilters((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm lg:hidden" aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden /> {t('catalog.filters')}
          </button>
          <label className="sr-only" htmlFor="sort">{t('catalog.sort')}</label>
          <select
            id="sort"
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as SortOption })}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            {SORTS.filter((s) => s !== 'relevance' || filters.q).map((s) => (
              <option key={s} value={s}>{t(`sort.${s}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 pb-16 lg:grid-cols-[240px_1fr]">
        <aside className={cx('space-y-6', !showFilters && 'hidden lg:block')} aria-label={t('catalog.filters')}>
          {data && (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">{t('catalog.categories')}</legend>
                <ul className="space-y-1">
                  {data.facets.categories.map((c) => (
                    <li key={c.slug}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white">
                        <span className="flex items-center gap-2">
                          <input type="checkbox" className="accent-ink" checked={filters.category?.includes(c.slug) ?? false} onChange={() => update({ category: toggleIn(filters.category, c.slug) })} />
                          {c.name}
                        </span>
                        <span className="tabular-nums text-ink-faint">{c.count}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">{t('catalog.price')}</legend>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    update({ min_price: String(form.get('min') || '') || undefined, max_price: String(form.get('max') || '') || undefined });
                  }}
                >
                  <input name="min" inputMode="numeric" pattern="[0-9]*" defaultValue={filters.min_price} placeholder={t('catalog.price_from')} aria-label={t('catalog.price_from')} className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm" />
                  <input name="max" inputMode="numeric" pattern="[0-9]*" defaultValue={filters.max_price} placeholder={t('catalog.price_to')} aria-label={t('catalog.price_to')} className="w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm" />
                  <button type="submit" className="rounded-md bg-ink px-2.5 py-1.5 text-sm text-white">→</button>
                </form>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">{t('catalog.units')}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {data.facets.units.slice(0, 12).map((u) => {
                    const on = filters.unit?.includes(u.value) ?? false;
                    return (
                      <button key={u.value} type="button" aria-pressed={on} onClick={() => update({ unit: toggleIn(filters.unit, u.value) })}
                        className={cx('rounded-full border px-2.5 py-1 text-xs', on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink')}>
                        {u.value} <span className={on ? 'text-white/70' : 'text-ink-faint'}>{u.count}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="accent-ink" checked={filters.in_stock ?? false} onChange={(e) => update({ in_stock: e.target.checked })} />
                {t('catalog.in_stock_only')}
              </label>

              {hasFilters && (
                <button type="button" onClick={() => navigate('/', filters.q ? { q: filters.q } : undefined)} className="text-sm font-medium text-brand-deep underline-offset-4 hover:underline">
                  {t('catalog.clear')}
                </button>
              )}
            </>
          )}
        </aside>

        <section aria-live="polite" aria-busy={!data && !failed}>
          {failed ? (
            <div className="space-y-3">
              <Notice>{t('catalog.error')}</Notice>
              <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>{t('catalog.retry')}</Button>
            </div>
          ) : !data ? (
            <Spinner label={t('common.loading')} />
          ) : data.items.length === 0 ? (
            <div className="rounded-card border border-line bg-white px-6 py-16 text-center">
              <p className="font-semibold text-ink">{t('catalog.empty')}</p>
              <p className="mt-1 text-sm text-ink-soft">{t('catalog.empty_hint')}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                {data.items.map((product, index) => (
                  <ProductCard key={product.id} product={product} eager={index < 4} />
                ))}
              </div>
              {data.pagination.total_pages > 1 && (
                <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
                  <Button variant="ghost" disabled={data.pagination.page <= 1} onClick={() => navigate('/', toQuery({ ...filters, page: data.pagination.page - 1 }))}>
                    ← {t('catalog.prev')}
                  </Button>
                  <span className="text-sm tabular-nums text-ink-soft">
                    {t('catalog.page', { page: data.pagination.page, pages: data.pagination.total_pages })}
                  </span>
                  <Button variant="ghost" disabled={data.pagination.page >= data.pagination.total_pages} onClick={() => navigate('/', toQuery({ ...filters, page: data.pagination.page + 1 }))}>
                    {t('catalog.next')} →
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
