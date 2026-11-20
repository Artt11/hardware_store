import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Cart } from '../api/types';
import { useAuth } from './auth';

interface CartState {
  cart: Cart | null;
  quantityOf: (productId: string) => number;
  /** Sets the quantity; throws ApiError (409 with "Only N available", 404). */
  setQuantity: (productId: string, quantity: number) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  reload: () => Promise<void>;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { ready, sessionKey } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [isOpen, setOpen] = useState(false);

  const reload = useCallback(async () => {
    setCart(await api<Cart>('/cart'));
  }, []);

  useEffect(() => {
    if (ready) reload().catch((error: unknown) => console.warn('cart load failed', error));
  }, [ready, sessionKey, reload]);

  const setQuantity = useCallback(async (productId: string, quantity: number) => {
    setCart(await api<Cart>(`/cart/items/${productId}`, { method: 'PUT', body: { quantity } }));
  }, []);

  const remove = useCallback(async (productId: string) => {
    setCart(await api<Cart>(`/cart/items/${productId}`, { method: 'DELETE' }));
  }, []);

  const quantityOf = useCallback(
    (productId: string) => cart?.items.find((i) => i.product_id === productId)?.quantity ?? 0,
    [cart],
  );

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ cart, quantityOf, setQuantity, remove, reload, isOpen, open, close }),
    [cart, quantityOf, setQuantity, remove, reload, isOpen, open, close],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
