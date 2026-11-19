import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, cartToken, errorMessage } from './client';

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

function reply({ status, body, headers = {} }: Reply): Response {
  const init = { status, headers: { 'Content-Type': 'application/json', ...headers } };
  return new Response(status === 204 ? null : JSON.stringify(body ?? {}), init);
}

let calls: { url: string; init: RequestInit }[] = [];

function serve(...replies: Reply[]) {
  const queue = [...replies];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    return reply(next);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  calls = [];
  cartToken.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('sends cookies and the CSRF header to the same-origin API', async () => {
    serve({ status: 200, body: { ok: true } });

    await api('/products');

    expect(calls[0].url).toBe('/api/v1/products');
    expect(calls[0].init.credentials).toBe('include');
    expect(new Headers(calls[0].init.headers).get('X-Requested-With')).toBe('suro');
  });

  it('stores a new guest cart token and sends it on later requests', async () => {
    serve(
      { status: 200, body: {}, headers: { 'X-Session-Token': 'guest-123' } },
      { status: 200, body: {} },
    );

    await api('/cart/items/1', { method: 'PUT', body: { quantity: 1 } });
    await api('/cart');

    expect(cartToken.get()).toBe('guest-123');
    expect(new Headers(calls[1].init.headers).get('X-Session-Token')).toBe('guest-123');
  });

  it('refreshes the session once on 401 and retries the request', async () => {
    serve({ status: 401, body: { detail: 'expired' } }, { status: 200, body: {} }, { status: 200, body: { id: 1 } });

    const result = await api<{ id: number }>('/orders');

    expect(result).toEqual({ id: 1 });
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/orders', '/api/v1/auth/refresh', '/api/v1/orders']);
  });

  it('shares one refresh between concurrent 401s', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/refresh')) return reply({ status: 200 });
      const retried = calls.filter((c) => c.url === url).length > 1;
      return reply(retried ? { status: 200, body: { url } } : { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([api('/orders'), api('/wishlist')]);

    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('gives up when the refresh fails instead of looping', async () => {
    serve({ status: 401 }, { status: 401, body: { detail: 'Session expired.' } });

    await expect(api('/orders')).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(2);
  });

  it('never tries to refresh for auth endpoints', async () => {
    serve({ status: 401, body: { detail: 'Invalid email or password.' } });

    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it('returns undefined for 204 responses', async () => {
    serve({ status: 204 });
    await expect(api('/cart', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('exposes structured error details', async () => {
    serve({ status: 409, body: { detail: { message: 'Out of stock', shortages: [{ sku: '00001' }] } } });

    const error = await api('/checkout', { method: 'POST', body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect(errorMessage(error, 'fallback')).toBe('Out of stock');
  });
});

describe('errorMessage', () => {
  it('reads string details, validation lists and falls back otherwise', () => {
    expect(errorMessage(new ApiError(400, 'Your cart is empty.'), 'x')).toBe('Your cart is empty.');
    expect(errorMessage(new ApiError(422, [{ loc: ['body', 'email'], msg: 'bad email' }]), 'x')).toBe('bad email');
    expect(errorMessage(new Error('network'), 'fallback')).toBe('fallback');
  });
});
