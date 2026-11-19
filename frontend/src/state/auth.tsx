import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, cartToken } from '../api/client';
import type { RegisterPayload, UserProfile } from '../api/types';

interface Auth {
  user: UserProfile | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  register: (payload: RegisterPayload) => Promise<UserProfile>;
  logout: () => Promise<void>;
  /** Bumps after every sign-in/out so cart and wishlist reload. */
  sessionKey: number;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    // Cookies are HttpOnly: the only way to know who is signed in is to ask.
    api<UserProfile>('/auth/me')
      .then(setUser)
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 401)) console.warn('auth check failed', error);
      })
      .finally(() => setReady(true));
  }, []);

  const signedIn = useCallback((profile: UserProfile) => {
    cartToken.clear(); // the server merged the guest cart into the account
    setUser(profile);
    setSessionKey((k) => k + 1);
    return profile;
  }, []);

  const login = useCallback(
    async (email: string, password: string) =>
      signedIn(await api<UserProfile>('/auth/login', { method: 'POST', body: { email, password } })),
    [signedIn],
  );

  const register = useCallback(
    async (payload: RegisterPayload) =>
      signedIn(await api<UserProfile>('/auth/register', { method: 'POST', body: payload })),
    [signedIn],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setSessionKey((k) => k + 1);
    }
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, sessionKey }),
    [user, ready, login, register, logout, sessionKey],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
