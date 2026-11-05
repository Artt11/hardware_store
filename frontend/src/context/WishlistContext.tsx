import React, { createContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Product } from '../types/product';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../config/api';

interface WishlistContextType {
  wishlist: Product[];
  wishlistIds: Set<string>;
  isInWishlist: (productId: string) => boolean;
  toggleWishlist: (product: Product) => Promise<void>;
  removeFromWishlist: (productId: string) => Promise<void>;
  count: number;
  isLoading: boolean;
}

const GUEST_STORAGE_KEY = 'aura_store_guest_wishlist_v1';

export const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, accessToken, openAuthModal } = useAuth();
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const wishlistIds = useMemo(() => new Set(wishlist.map((item) => item.id)), [wishlist]);

  // 1. Initial Load: Read guest items from LocalStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GUEST_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setWishlist(parsed);
        }
      }
    } catch (err) {
      console.warn('Failed to parse guest wishlist:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Fetch authenticated user's wishlist directly from PostgreSQL upon login
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const fetchServerWishlist = async () => {
      try {
        setIsLoading(true);
        // Sync local items to server first
        const guestProductIds = wishlist.map((p) => p.id);
        if (guestProductIds.length > 0) {
          await fetch(`${API_BASE_URL}/wishlist/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ product_ids: guestProductIds }),
          });
        }

        // Fetch persisted items from PostgreSQL under authenticated user's ID
        const response = await fetch(`${API_BASE_URL}/wishlist`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.items) {
            // ISSUE-06 Fix: Preserve AMD currency, retail_price, and unit_of_measure
            const mapped: Product[] = data.items.map((item: any) => {
              const unitPrice = Number(item.price || 0);
              return {
                id: String(item.product_id),
                name: String(item.name || ''),
                slug: String(item.slug || `product-${item.sku}`),
                sku: String(item.sku || ''),
                unit_of_measure: item.unit_of_measure || 'հատ',
                category: item.category || 'Uncategorized',
                retail_price: unitPrice,
                wholesale_price: Number(item.wholesale_price || 0),
                barcode: item.barcode || null,
                vat_applicable: true,
                discount_percent: 0,
                description: null,
                image_url: item.thumbnail_url || '',
                is_active: Boolean(item.in_stock ?? true),
                brand: item.brand || 'Սուրո',
                price: unitPrice,
                currency: item.currency || 'AMD',
                inStock: Boolean(item.in_stock ?? true),
                stockQuantity: 25,
                ratingAverage: 4.8,
                ratingCount: 12,
                imageUrl: item.thumbnail_url || '',
                thumbnailUrl: item.thumbnail_url || '',
                specifications: {},
              };
            });
            setWishlist(mapped);
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(mapped));
          }
        }
      } catch (err) {
        console.error('Failed to sync wishlist with PostgreSQL:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServerWishlist();
  }, [isAuthenticated, accessToken]);

  const isInWishlist = useCallback(
    (productId: string): boolean => {
      return wishlistIds.has(productId);
    },
    [wishlistIds]
  );

  // Toggle Wishlist with Database Persistence
  const toggleWishlist = useCallback(
    async (product: Product) => {
      const isAlreadyIn = wishlistIds.has(product.id);
      const previousWishlist = [...wishlist];

      // Optimistic UI update
      const updatedWishlist = isAlreadyIn
        ? wishlist.filter((item) => item.id !== product.id)
        : [product, ...wishlist];

      setWishlist(updatedWishlist);
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(updatedWishlist));

      // Direct PostgreSQL sync if authenticated
      if (isAuthenticated && accessToken) {
        try {
          if (isAlreadyIn) {
            await fetch(`${API_BASE_URL}/wishlist/${product.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          } else {
            await fetch(`${API_BASE_URL}/wishlist`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ product_id: product.id }),
            });
          }
        } catch (error) {
          console.error('Failed to update PostgreSQL wishlist, reverting:', error);
          setWishlist(previousWishlist);
          localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(previousWishlist));
        }
      } else {
        openAuthModal('login');
      }
    },
    [wishlist, wishlistIds, isAuthenticated, accessToken, openAuthModal]
  );

  const removeFromWishlist = useCallback(
    async (productId: string) => {
      const target = wishlist.find((item) => item.id === productId);
      if (target) {
        await toggleWishlist(target);
      }
    },
    [wishlist, toggleWishlist]
  );

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        wishlistIds,
        isInWishlist,
        toggleWishlist,
        removeFromWishlist,
        count: wishlist.length,
        isLoading,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};
