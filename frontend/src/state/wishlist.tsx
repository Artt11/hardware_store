import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { WishlistItem } from '../api/types';
import { useI18n } from '../i18n';
import { useAuth } from './auth';

/**
 * Signed-in users: the server wishlist. Guests: product ids in localStorage,
 * merged into the account (POST /wishlist/sync) right after sign-in.
 */
const GUEST_KEY = 'suro_guest_wishlist';

interface WishlistState {
  ids: Set<string>;
  items: WishlistItem[];
  /** Never rejects: a failed change is reported through `failed` and a status notice. */
  toggle: (productId: string) => Promise<void>;
  failed: boolean;
}

const WishlistContext = createContext<WishlistState | null>(null);

function readGuest(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(GUEST_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeGuest(ids: string[]): void {
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, ready, sessionKey } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [guestIds, setGuestIds] = useState<string[]>(readGuest);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      // Signed out (or session expired): never keep the previous account's list on screen.
      setItems([]);
      return;
    }
    let current = true;
    const pending = readGuest();
    const request = pending.length
      ? api<{ items: WishlistItem[] }>('/wishlist/sync', { method: 'POST', body: { product_ids: pending } })
      : api<{ items: WishlistItem[] }>('/wishlist');
    request
      .then((data) => {
        if (!current) return; // a newer session replaced this one meanwhile
        setItems(data.items);
        writeGuest([]);
        setGuestIds([]);
      })
      .catch((error: unknown) => console.warn('wishlist load failed', error));
    return () => {
      current = false;
    };
  }, [ready, user, sessionKey]);

  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => setFailed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [failed]);

  const ids = useMemo(
    () => new Set(user ? items.map((i) => i.product_id) : guestIds),
    [user, items, guestIds],
  );

  const toggle = useCallback(
    async (productId: string) => {
      if (!user) {
        const next = guestIds.includes(productId) ? guestIds.filter((id) => id !== productId) : [...guestIds, productId];
        setGuestIds(next);
        writeGuest(next);
        return;
      }
      setFailed(false);
      try {
        if (ids.has(productId)) {
          await api(`/wishlist/${productId}`, { method: 'DELETE' });
          setItems((current) => current.filter((i) => i.product_id !== productId));
        } else {
          const data = await api<{ items: WishlistItem[] }>('/wishlist', {
            method: 'POST',
            body: { product_id: productId },
          });
          setItems(data.items);
        }
      } catch (error) {
        // Callers fire-and-forget (`void toggle(id)`): an escaping rejection would be unhandled.
        console.warn('wishlist update failed', error);
        setFailed(true);
      }
    },
    [user, guestIds, ids],
  );

  const value = useMemo(() => ({ ids, items, toggle, failed }), [ids, items, toggle, failed]);
  return (
    <WishlistContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center px-4"
      >
        {failed && (
          <p className="rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-lg">{t('wishlist.error')}</p>
        )}
      </div>
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistState {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider');
  return ctx;
}
