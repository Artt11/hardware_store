// @vitest-environment jsdom
/**
 * Regression tests for audit H4 (zombie signed-in state) and H6 (wishlist leaking
 * across sign-out, unhandled toggle failures). Real providers, mocked fetch.
 */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { I18nProvider } from '../i18n';
import { AuthProvider, useAuth } from './auth';
import { WishlistProvider, useWishlist } from './wishlist';

type Route = { status: number; body?: unknown };
type Routes = Record<string, Route | (() => Route)>;

const USER = { id: 'u1', email: 'anna@example.com', is_b2b: false, account_type: 'individual' };
const SAVED = { product_id: 'p1', name: 'Hammer' };

function serve(routes: Routes) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.replace('/api/v1', '').split('?')[0]}`;
    const entry = routes[key];
    if (!entry) throw new Error(`unexpected request ${key}`);
    const { status, body } = typeof entry === 'function' ? entry() : entry;
    return new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let latest: { auth: ReturnType<typeof useAuth>; wishlist: ReturnType<typeof useWishlist> } | null = null;

function Probe() {
  const auth = useAuth();
  const wishlist = useWishlist();
  latest = { auth, wishlist };
  return (
    <div>
      <span data-testid="who">{auth.user?.email ?? 'guest'}</span>
      <span data-testid="saved">{wishlist.items.length}</span>
    </div>
  );
}

function renderApp() {
  return render(
    <I18nProvider>
      <AuthProvider>
        <WishlistProvider>
          <Probe />
        </WishlistProvider>
      </AuthProvider>
    </I18nProvider>,
  );
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

beforeEach(() => {
  latest = null;
  // Node >= 25 ships its own (file-less, broken) localStorage global that shadows jsdom's.
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('session expiry (H4)', () => {
  it('signs the UI out when the server refuses to refresh', async () => {
    serve({
      'GET /auth/me': { status: 200, body: USER },
      'GET /wishlist': { status: 200, body: { items: [SAVED] } },
      'GET /cart': { status: 401 },
      'POST /auth/refresh': { status: 401, body: { detail: 'Session expired.' } },
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe(USER.email));
    await waitFor(() => expect(screen.getByTestId('saved').textContent).toBe('1'));
    const keyBefore = latest!.auth.sessionKey;

    await act(async () => {
      await api('/cart').catch(() => undefined);
    });

    expect(screen.getByTestId('who').textContent).toBe('guest');
    expect(screen.getByTestId('saved').textContent).toBe('0');
    expect(latest!.auth.sessionKey).toBe(keyBefore + 1);
  });
});

describe('wishlist (H6)', () => {
  it('clears the previous account list on sign-out', async () => {
    serve({
      'GET /auth/me': { status: 200, body: USER },
      'GET /wishlist': { status: 200, body: { items: [SAVED] } },
      'POST /auth/logout': { status: 204 },
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('saved').textContent).toBe('1'));

    await act(async () => {
      await latest!.auth.logout();
    });

    expect(screen.getByTestId('who').textContent).toBe('guest');
    expect(screen.getByTestId('saved').textContent).toBe('0');
  });

  it('reports a failed toggle instead of rejecting', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    serve({
      'GET /auth/me': { status: 200, body: USER },
      'GET /wishlist': { status: 200, body: { items: [] } },
      'POST /wishlist': { status: 500, body: { detail: 'boom' } },
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe(USER.email));

    await act(async () => {
      await expect(latest!.wishlist.toggle('p2')).resolves.toBeUndefined();
    });

    expect(latest!.wishlist.failed).toBe(true);
    expect(screen.getByRole('status').textContent).not.toBe('');
    expect(screen.getByTestId('saved').textContent).toBe('0');
  });
});
