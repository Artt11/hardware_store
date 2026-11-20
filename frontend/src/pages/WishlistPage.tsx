import { Heart } from 'lucide-react';
import { Button, Price, ProductImage, StockBadge } from '../components/ui';
import { useI18n } from '../i18n';
import { href } from '../router';
import { useAuth } from '../state/auth';
import { useWishlist } from '../state/wishlist';

export function WishlistPage({ onSignIn }: { onSignIn: () => void }) {
  const { t, name } = useI18n();
  const { user } = useAuth();
  const { ids, items, toggle } = useWishlist();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-16 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('wishlist.title')}</h1>
      {!user ? (
        <div className="rounded-card border border-line bg-white p-8 text-center">
          <Heart className="mx-auto h-8 w-8 text-ink-faint" aria-hidden />
          <p className="mt-3 text-ink-soft">{ids.size > 0 ? `${ids.size}` : t('wishlist.empty')}</p>
          <Button className="mt-4" onClick={onSignIn}>{t('nav.signin')}</Button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-card border border-line bg-white p-8 text-center text-ink-soft">{t('wishlist.empty')}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
          {items.map((item) => (
            <li key={item.product_id} className="flex items-center gap-4 px-5 py-4">
              <a href={href(`/product/${item.slug}`)} className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line">
                <ProductImage src={item.image_url} alt="" category="" />
              </a>
              <div className="min-w-0 flex-1">
                <a href={href(`/product/${item.slug}`)} className="line-clamp-2 text-sm font-medium text-ink hover:underline">{name(item)}</a>
                <StockBadge inStock={item.in_stock} available={item.available_quantity} />
              </div>
              <Price value={item.price} className="text-sm" />
              <button type="button" onClick={() => void toggle(item.product_id)} aria-label={t('wishlist.remove')}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/5">
                <Heart className="h-4 w-4 fill-ink" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
