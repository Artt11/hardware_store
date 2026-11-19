/**
 * The single way the storefront talks to the backend.
 *
 * - Same-origin `/api/v1` (Vite proxies it in development), so the HttpOnly,
 *   SameSite session cookies are sent. No token is ever readable from JS.
 * - Every request carries `X-Requested-With`, which the API requires for
 *   cookie-authenticated writes (CSRF guard).
 * - A 401 triggers one shared `/auth/refresh` and a single retry.
 * - Guest carts: the API issues `X-Session-Token` on the first cart write; we keep
 *   it in localStorage (it identifies a cart, not an account) and send it back.
 */

export const API_BASE = '/api/v1';
const CART_TOKEN_KEY = 'suro_cart_token';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(typeof detail === 'string' ? detail : `Request failed (${status})`);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  signal?: AbortSignal;
}

const memoryStore = new Map<string, string>();

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // Private mode or blocked storage: fall back to memory for this tab.
  }
  return {
    getItem: (k) => memoryStore.get(k) ?? null,
    setItem: (k, v) => void memoryStore.set(k, v),
    removeItem: (k) => void memoryStore.delete(k),
  };
}

export const cartToken = {
  get: (): string | null => storage().getItem(CART_TOKEN_KEY),
  set: (value: string) => storage().setItem(CART_TOKEN_KEY, value),
  clear: () => storage().removeItem(CART_TOKEN_KEY),
};

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.append(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json', 'X-Requested-With': 'suro' });
  const token = cartToken.get();
  if (token) headers.set('X-Session-Token', token);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    signal: options.signal,
  });
  const issued = response.headers.get('X-Session-Token');
  if (issued) cartToken.set(issued);
  return response;
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; concurrent 401s wait for the same attempt. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= send('/auth/refresh', { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? (data as { detail: unknown }).detail : data;
    throw new ApiError(response.status, detail);
  }
  return data as T;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) response = await send(path, options);
  }
  return parse<T>(response);
}

/** Human-readable message from any error thrown by `api`. */
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const { detail } = error;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === 'string') return detail[0].msg;
  if (detail && typeof detail === 'object' && typeof (detail as { message?: unknown }).message === 'string') {
    return (detail as { message: string }).message;
  }
  return fallback;
}
