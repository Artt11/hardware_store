import { useState } from 'react';
import { AuthDialog } from './components/AuthDialog';
import { CartDrawer } from './components/CartDrawer';
import { Header } from './components/Header';
import { BRAND } from './config/brand';
import { I18nProvider, useI18n } from './i18n';
import { AccountPage } from './pages/AccountPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ProductPage } from './pages/ProductPage';
import { WishlistPage } from './pages/WishlistPage';
import { useRoute } from './router';
import { AuthProvider } from './state/auth';
import { CartProvider } from './state/cart';
import { WishlistProvider } from './state/wishlist';

function Shell() {
  const { t, city } = useI18n();
  const route = useRoute();
  const [authOpen, setAuthOpen] = useState(false);
  const openAuth = () => setAuthOpen(true);

  const segments = route.path.split('/').filter(Boolean);
  let page;
  if (segments[0] === 'product' && segments[1]) page = <ProductPage slug={decodeURIComponent(segments[1])} />;
  else if (segments[0] === 'checkout') page = <CheckoutPage />;
  else if (segments[0] === 'wishlist') page = <WishlistPage onSignIn={openAuth} />;
  else if (segments[0] === 'account') page = <AccountPage orderNumber={segments[1] === 'orders' ? segments[2] : undefined} />;
  else page = <CatalogPage route={route} />;

  return (
    <div className="flex min-h-screen flex-col bg-canvas font-sans text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
        {t('a11y.skip')}
      </a>
      <Header query={route.query.get('q') ?? ''} onSignIn={openAuth} />
      <main id="main" className="flex-1">{page}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-ink-faint sm:px-6">
          <span>© {new Date().getFullYear()} {BRAND.name} · {t('footer.rights')}</span>
          <span>{city}</span>
        </div>
      </footer>
      <CartDrawer />
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <Shell />
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
