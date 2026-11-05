/**
 * Centralized API Configuration & B2C/B2B Pricing Helper (`frontend/src/config/api.ts`).
 * Fixes:
 * - BUG-13: Single source of truth for `API_BASE_URL` across Next.js (`NEXT_PUBLIC_API_URL`)
 *   and Vite (`VITE_API_URL`) environments.
 * - BUG-04: `getEffectiveUnitPrice(product, user)` applies `wholesale_price` when a B2B
 *   company user (`account_type === 'company'`) is signed in.
 */

import { Product } from '../types/product';
import { UserProfile } from '../types/user';

const resolveApiBaseUrl = (): string => {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  try {
    const viteUrl = (import.meta as any)?.env?.VITE_API_URL;
    if (viteUrl) {
      return String(viteUrl).replace(/\/+$/, '');
    }
  } catch {
    // Ignore when not running under Vite
  }
  return 'http://localhost:8000/api/v1';
};

export const API_BASE_URL: string = resolveApiBaseUrl();

export function getEffectiveUnitPrice(
  product: Product,
  user?: UserProfile | null
): number {
  const retail = Number(product.retail_price ?? product.price ?? 0);
  const wholesale = Number(product.wholesale_price ?? 0);
  if (user?.account_type === 'company' && wholesale > 0) {
    return wholesale;
  }
  return retail;
}

