import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { WishlistItem } from '../api/types';
import { useAuth } from './auth';

/**
 * Signed-in users: the server wishlist. Guests: product ids in localStorage,
 * merged into the account (POST /wishlist/sync) right after sign-in.
 */
const GUEST_KEY = 'suro_guest_wishlist';

interface WishlistState {
  ids: Set<string>;
  items: WishlistItem[];
  toggle: (productId: string) => Promise<void>;
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
  const { user, ready, sessionKey } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [guestIds, setGuestIds] = useState<string[]>(readGuest);

  useEffect(() => {
    if (!ready || !user) return;
    const pending = readGuest();
    const request = pending.length
      ? api<{ items: WishlistItem[] }>('/wishlist/sync', { method: 'POST', body: { product_ids: pending } })
      : api<{ items: WishlistItem[] }>('/wishlist');
    request
      .then((data) => {
        setItems(data.items);
        writeGuest([]);
        setGuestIds([]);
      })
      .catch((error: unknown) => console.warn('wishlist load failed', error));
  }, [ready, user, sessionKey]);

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
      if (ids.has(productId)) {
        await api(`/wishlist/${productId}`, { method: 'DELETE' });
        setItems((current) => current.filter((i) => i.product_id !== productId));
      } else {
        const data = await api<{ items: WishlistItem[] }>('/wishlist', { method: 'POST', body: { product_id: productId } });
        setItems(data.items);
      }
    },
    [user, guestIds, ids],
  );

  const value = useMemo(() => ({ ids, items, toggle }), [ids, items, toggle]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistState {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used inside WishlistProvider');
  return ctx;
}
