import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api/client';
import type { AutocompleteHit } from '../api/types';
import { useI18n } from '../i18n';
import { navigate } from '../router';
import { Price, ProductImage, cx } from './ui';

/** Instant search: debounced, cancels stale requests, keyboard navigable (combobox pattern). */
export function SearchBox({ initial = '' }: { initial?: string }) {
  const { t, lang } = useI18n();
  const listId = useId();
  const [query, setQuery] = useState(initial);
  const [hits, setHits] = useState<AutocompleteHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(initial), [initial]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<{ products: AutocompleteHit[] }>('/search/autocomplete', { query: { q: term, limit: 6, lang }, signal: controller.signal })
        .then((data) => {
          setHits(data.products);
          setActive(-1);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, lang]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submit = () => {
    setOpen(false);
    navigate('/', query.trim() ? { q: query.trim() } : undefined);
  };

  const openProduct = (hit: AutocompleteHit) => {
    setOpen(false);
    navigate(`/product/${hit.slug}`);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && hits[active]) openProduct(hits[active]);
          else submit();
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={query}
          maxLength={100}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, -1));
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
        />
      </form>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-card border border-line bg-white shadow-lg">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-soft">{t('search.no_results')}</p>
          ) : (
            <ul id={listId} role="listbox">
              {hits.map((hit, index) => (
                <li
                  key={hit.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => openProduct(hit)}
                  onMouseEnter={() => setActive(index)}
                  className={cx('flex cursor-pointer items-center gap-3 px-3 py-2', index === active && 'bg-canvas')}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-canvas">
                    <ProductImage src={hit.image_url} alt="" category="" />
                  </div>
                  {/* highlight is HTML-escaped by the API; only <mark> is markup */}
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" dangerouslySetInnerHTML={{ __html: hit.highlight }} />
                  <Price value={hit.price} className="text-sm" />
                </li>
              ))}
              <li>
                <button type="button" onClick={submit} className="w-full border-t border-line px-4 py-2.5 text-left text-sm font-medium text-brand-deep hover:bg-canvas">
                  {t('search.all_results')} →
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
