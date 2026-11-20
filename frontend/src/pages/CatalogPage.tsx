import { useEffect, useState } from 'react';
import { Check, SearchX, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import type { CatalogFilters, ProductPage, SortOption } from '../api/types';
import { ProductCard } from '../components/ProductCard';
import { Button, Notice, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { navigate, type Route } from '../router';
import { useAuth } from '../state/auth';

const SORTS: SortOption[] = ['featured', 'relevance', 'name', 'price_asc', 'price_desc', 'newest'];
const PAGE_SIZE = 24;
const defaultSort = (q?: string): SortOption => (q ? 'relevance' : 'featured');

function filtersFrom(query: URLSearchParams): CatalogFilters {
  const q = query.get('q') ?? undefined;
  return {
    q,
    category: query.getAll('category'),
    in_stock: query.get('stock') === '1',
    sort: (query.get('sort') as SortOption | null) ?? defaultSort(q),
    page: Number(query.get('page') ?? '1') || 1,
  };
}

function toQuery(f: CatalogFilters): URLSearchParams {
  const q = new URLSearchParams();
  if (f.q) q.set('q', f.q);
  f.category?.forEach((c) => q.append('category', c));
  if (f.in_stock) q.set('stock', '1');
  if (f.sort && f.sort !== defaultSort(f.q)) q.set('sort', f.sort);
  if (f.page && f.page > 1) q.set('page', String(f.page));
  return q;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-card border border-line bg-white">
          <div className="aspect-square animate-pulse bg-canvas" />
          <div className="space-y-2 p-3">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-canvas" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-canvas" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-canvas" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CatalogPage({ route }: { route: Route }) {
  const { t, category, lang } = useI18n();
  const { sessionKey } = useAuth();
  const filters = filtersFrom(route.query);
  const key = route.query.toString();
  const [data, setData] = useState<ProductPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setLoading(true);
    api<ProductPage>('/products', {
      query: { ...filters, in_stock: filters.in_stock || undefined, page_size: PAGE_SIZE, lang },
      signal: controller.signal,
    })
      .then((page) => {
        setData(page);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailed(error instanceof Error);
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` encodes every filter
  }, [key, attempt, sessionKey, lang]);

  const update = (patch: Partial<CatalogFilters>) => navigate('/', toQuery({ ...filters, page: 1, ...patch }));
  const toggleIn = (list: string[] = [], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const hasFilters = Boolean(filters.category?.length || filters.in_stock);
  const isHome = !filters.q && !hasFilters && (filters.page ?? 1) === 1;
  const categories = data?.facets.categories.filter((c) => c.count > 0) ?? [];
  const sorts = SORTS.filter((s) => (s === 'relevance' ? Boolean(filters.q) : true));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {isHome && (
        <section className="pb-2 pt-8 sm:pt-12">
          <h1 className="max-w-[22ch] text-[28px] font-bold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[40px]">
            {t('hero.title')}
          </h1>
          <p className="mt-3 max-w-[60ch] text-base leading-7 text-ink-soft">{t('hero.subtitle')}</p>
        </section>
      )}

      {/* Toolbar wraps on phones: the long Armenian sort labels used to force a 489px layout. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-4 pt-6">
        <h2 className="text-lg font-semibold text-ink">
          {filters.q ? `«${filters.q}»` : t('catalog.title')}
          {data && (
            <span className="ml-2 text-sm font-normal tabular-nums text-ink-faint">
              {t('catalog.results', { count: data.pagination.total_items })}
            </span>
          )}
        </h2>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink transition-colors hover:border-ink-faint lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {t('catalog.filters')}
            {hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />}
          </button>
          <label className="sr-only" htmlFor="sort">{t('catalog.sort')}</label>
          <select
            id="sort"
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as SortOption })}
            className="h-11 min-w-0 flex-1 cursor-pointer rounded-lg border border-line bg-white px-3 text-sm text-ink transition-colors hover:border-ink-faint sm:flex-none"
          >
            {sorts.map((s) => (
              <option key={s} value={s}>{t(`sort.${s}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 pb-20 lg:grid-cols-[232px_1fr] lg:gap-10">
        <aside className={cx('space-y-6', !showFilters && 'hidden lg:block')} aria-label={t('catalog.filters')}>
          {categories.length > 0 && (
            <nav aria-label={t('catalog.categories')}>
              <h3 className="mb-1.5 px-3 text-sm font-semibold text-ink">
                {t('catalog.categories')}
              </h3>
              <ul className="space-y-0.5">
                <li>
                  <button
                    type="button"
                    aria-pressed={!filters.category?.length}
                    onClick={() => update({ category: [] })}
                    className={cx(
                      'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      !filters.category?.length ? 'bg-white font-semibold text-ink' : 'text-ink-soft hover:bg-white/70 hover:text-ink',
                    )}
                  >
                    {t('catalog.all_categories')}
                  </button>
                </li>
                {categories.map((c) => {
                  const on = filters.category?.includes(c.slug) ?? false;
                  return (
                    <li key={c.slug}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => update({ category: toggleIn(filters.category, c.slug) })}
                        className={cx(
                          'group flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          on ? 'bg-white font-semibold text-ink' : 'text-ink-soft hover:bg-white/70 hover:text-ink',
                        )}
                      >
                        <span className="min-w-0 flex-1 leading-5">{category(c.slug, c.name)}</span>
                        {on ? (
                          <Check className="h-4 w-4 shrink-0 text-ink" aria-hidden />
                        ) : (
                          <span className="shrink-0 text-xs tabular-nums text-ink-faint">{c.count}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-ink hover:bg-white/70">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={filters.in_stock ?? false}
              onChange={(e) => update({ in_stock: e.target.checked })}
            />
            {t('catalog.in_stock_only')}
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={() => navigate('/', filters.q ? { q: filters.q } : undefined)}
              className="px-3 text-sm font-medium text-brand-deep underline-offset-4 hover:underline"
            >
              {t('catalog.clear')}
            </button>
          )}
        </aside>

        <section aria-live="polite" aria-busy={loading}>
          {failed ? (
            <div className="space-y-3">
              <Notice>{t('catalog.error')}</Notice>
              <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>{t('catalog.retry')}</Button>
            </div>
          ) : !data ? (
            <GridSkeleton />
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center rounded-card border border-line bg-white px-6 py-16 text-center">
              <SearchX className="h-8 w-8 text-ink-faint" strokeWidth={1.5} aria-hidden />
              <p className="mt-4 font-semibold text-ink">{filters.q ? t('search.no_results') : t('catalog.empty')}</p>
              <p className="mt-1 max-w-[42ch] text-sm leading-6 text-ink-soft">
                {filters.q ? t('catalog.empty_suggest') : t('catalog.empty_hint')}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {hasFilters && (
                  <Button variant="secondary" onClick={() => navigate('/', filters.q ? { q: filters.q } : undefined)}>
                    {t('catalog.clear')}
                  </Button>
                )}
                <Button variant={hasFilters ? 'ghost' : 'secondary'} onClick={() => navigate('/')}>
                  {t('catalog.all_categories')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Keep the previous page visible while the next one loads: no flash of skeletons. */}
              <div
                className={cx(
                  'grid grid-cols-2 gap-3 transition-opacity duration-200 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4',
                  loading && 'opacity-60',
                )}
              >
                {data.items.map((product, index) => (
                  <ProductCard key={product.id} product={product} eager={index < 4} />
                ))}
              </div>
              {data.pagination.total_pages > 1 && (
                <nav className="mt-10 flex items-center justify-center gap-2" aria-label={t('a11y.pagination')}>
                  <Button
                    variant="ghost"
                    className="h-11"
                    disabled={data.pagination.page <= 1}
                    onClick={() => navigate('/', toQuery({ ...filters, page: data.pagination.page - 1 }))}
                  >
                    ← {t('catalog.prev')}
                  </Button>
                  <span className="min-w-28 text-center text-sm tabular-nums text-ink-soft">
                    {t('catalog.page', { page: data.pagination.page, pages: data.pagination.total_pages })}
                  </span>
                  <Button
                    variant="ghost"
                    className="h-11"
                    disabled={data.pagination.page >= data.pagination.total_pages}
                    onClick={() => navigate('/', toQuery({ ...filters, page: data.pagination.page + 1 }))}
                  >
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
