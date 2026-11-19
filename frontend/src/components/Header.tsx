import { Heart, ShoppingCart, User } from 'lucide-react';
import { BRAND } from '../config/brand';
import { LANGS, useI18n } from '../i18n';
import { href } from '../router';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { useWishlist } from '../state/wishlist';
import { SearchBox } from './SearchBox';
import { cx } from './ui';

export function Header({ query, onSignIn }: { query: string; onSignIn: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { user } = useAuth();
  const { cart, open } = useCart();
  const { ids } = useWishlist();
  const count = cart?.item_count ?? 0;

  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-brand">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <a href={href('/')} className="flex items-center gap-2.5" aria-label={BRAND.latinName}>
          <img src={BRAND.logo} alt="" className="h-9 w-9 rounded-md object-cover" width={36} height={36} />
          <span className="leading-tight">
            <span className="block text-base font-bold text-ink">{BRAND.name}</span>
            <span className="block text-xs text-ink/70">{t('brand.tagline')}</span>
          </span>
        </a>

        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
          <SearchBox initial={query} />
        </div>

        <nav className="ml-auto flex items-center gap-1" aria-label={t('a11y.main_nav')}>
          <div className="mr-1 flex rounded-md bg-black/5 p-0.5 text-xs font-semibold" role="group" aria-label={t('a11y.language')}>
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={cx('rounded px-2 py-1 uppercase', lang === code ? 'bg-white text-ink' : 'text-ink/70 hover:text-ink')}
              >
                {code}
              </button>
            ))}
          </div>
          <a href={href('/wishlist')} className="relative grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-black/5" aria-label={t('nav.wishlist')}>
            <Heart className="h-5 w-5" aria-hidden />
            {ids.size > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ink" aria-hidden />}
          </a>
          {user ? (
            <a href={href('/account')} className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-black/5" aria-label={t('nav.account')}>
              <User className="h-5 w-5" aria-hidden />
            </a>
          ) : (
            <button type="button" onClick={onSignIn} className="rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-black/5">
              {t('nav.signin')}
            </button>
          )}
          <button
            type="button"
            onClick={open}
            className="relative inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-px active:scale-[0.98]"
            aria-label={`${t('nav.cart')}, ${count}`}
          >
            <ShoppingCart className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">{count}</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
