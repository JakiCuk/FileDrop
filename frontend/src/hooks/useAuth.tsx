import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { api } from "../services/api";
import { getTokenExpiryMs } from "../utils/jwt";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "sharedrop_auth";
/** Flag read by the login screen to show a "session expired" notice. */
export const SESSION_EXPIRED_KEY = "sharedrop_session_expired";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Don't trust an already-expired token from a previous session.
        const expMs = getTokenExpiryMs(parsed.token);
        if (expMs !== null && expMs <= Date.now()) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        api.setToken(parsed.token);
        return parsed.token;
      }
    } catch {}
    return null;
  });

  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).user;
    } catch {}
    return null;
  });

  const login = useCallback((newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    api.setToken(newToken);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: newToken, user: newUser }),
    );
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    api.setToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Expiry-driven logout: mark the session as expired (so the login screen can
  // explain why), then clear auth. Manual logout does NOT set this flag.
  const handleExpiry = useCallback(() => {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    logout();
  }, [logout]);

  useEffect(() => {
    if (token) api.setToken(token);
  }, [token]);

  // Reactive: a 401 on an authenticated request means the token is expired.
  useEffect(() => {
    api.setUnauthorizedHandler(handleExpiry);
    return () => api.setUnauthorizedHandler(null);
  }, [handleExpiry]);

  // Proactive: log out exactly when the token expires, even if the user is idle.
  useEffect(() => {
    if (!token) return;
    const expMs = getTokenExpiryMs(token);
    if (expMs === null) return; // unparseable — rely on the reactive 401 path
    const delay = expMs - Date.now();
    if (delay <= 0) {
      handleExpiry();
      return;
    }
    const id = setTimeout(handleExpiry, delay);
    return () => clearTimeout(id);
  }, [token, handleExpiry]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
