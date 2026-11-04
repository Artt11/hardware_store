import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile, RegisterFormData } from '../types/user';

interface AuthContextType {
  user: UserProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterFormData) => Promise<void>;
  logout: () => Promise<void>;
  isAuthModalOpen: boolean;
  openAuthModal: (mode?: 'login' | 'register', onComplete?: () => void) => void;
  closeAuthModal: () => void;
  authModalMode: 'login' | 'register';
  setAuthModalMode: (mode: 'login' | 'register') => void;
}

const API_BASE = 'http://localhost:8000/api/v1';
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes auto-timeout

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Access Token is kept strictly in memory - NEVER in localStorage
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Auth Modal State & Resume Action
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const postAuthActionRef = useRef<(() => void) | null>(null);
  
  // Inactivity tracking timer
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Silent Token Refresh (Runs on app boot to exchange HttpOnly cookie for in-memory token)
  const silentRefresh = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // Includes HttpOnly auratools_refresh_token cookie
      });

      if (response.ok) {
        const data = await response.json();
        setAccessToken(data.access_token);
        
        // Fetch User Profile with new in-memory token
        const profileRes = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${data.access_token}` },
          credentials: 'include',
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setUser(profileData);
        }
        return data.access_token;
      } else {
        setAccessToken(null);
        setUser(null);
        return null;
      }
    } catch {
      setAccessToken(null);
      setUser(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Run silent refresh on mount
  useEffect(() => {
    silentRefresh();
  }, [silentRefresh]);

  // 2. Inactivity Auto-Timeout (Locks session after 15 min of idle)
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!accessToken) return;

    inactivityTimerRef.current = setTimeout(() => {
      console.warn('Session timed out due to user inactivity.');
      setAccessToken(null);
      setUser(null);
      alert('Your session has timed out due to inactivity for security. Please sign in again.');
    }, INACTIVITY_TIMEOUT_MS);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetInactivityTimer();
    
    events.forEach((ev) => window.addEventListener(ev, handleActivity));
    resetInactivityTimer();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleActivity));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [accessToken, resetInactivityTimer]);

  // 3. Login
  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Receives HttpOnly refresh cookie
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Failed to authenticate.');
    }

    const data = await response.json();
    setAccessToken(data.access_token);

    // Fetch user profile
    const profileRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
      credentials: 'include',
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      setUser(profile);
    }

    setIsAuthModalOpen(false);

    // If an action was queued (e.g. Resume Checkout), execute it seamlessly
    if (postAuthActionRef.current) {
      const queued = postAuthActionRef.current;
      postAuthActionRef.current = null;
      queued();
    }
  };

  // 4. Register (B2C & B2B)
  const register = async (data: RegisterFormData) => {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Registration failed.');
    }

    const tokenData = await response.json();
    setAccessToken(tokenData.access_token);

    // Fetch profile
    const profileRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      credentials: 'include',
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      setUser(profile);
    }

    setIsAuthModalOpen(false);

    if (postAuthActionRef.current) {
      const queued = postAuthActionRef.current;
      postAuthActionRef.current = null;
      queued();
    }
  };

  // 5. Logout
  const logout = async () => {
    try {
      if (accessToken) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        });
      }
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  const openAuthModal = (mode: 'login' | 'register' = 'login', onComplete?: () => void) => {
    setAuthModalMode(mode);
    if (onComplete) postAuthActionRef.current = onComplete;
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    postAuthActionRef.current = null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: Boolean(accessToken && user),
        isLoading,
        login,
        register,
        logout,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        authModalMode,
        setAuthModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
