import { useEffect, useState } from 'react';

/** Minimal hash router: #/path?query. Shareable URLs without a routing dependency. */
export interface Route {
  path: string;
  query: URLSearchParams;
}

function current(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    const onChange = () => setRoute(current());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string, query?: URLSearchParams | Record<string, string>): void {
  const qs = query ? new URLSearchParams(query).toString() : '';
  window.location.hash = `${path}${qs ? `?${qs}` : ''}`;
  window.scrollTo({ top: 0 });
}

export const href = (path: string): string => `#${path}`;
