import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api } from "../services/api";
import { getTokenExpiryMs } from "../utils/jwt";

interface AdminUser {
  id: string;
  email: string;
}

interface AdminAuthState {
  token: string | null;
  user: AdminUser | null;
  role: "admin" | "viewer" | null;
  login: (token: string, user: AdminUser, role: "admin" | "viewer") => void;
  logout: () => void;
}

const AuthContext = createContext<AdminAuthState>({
  token: null,
  user: null,
  role: null,
  login: () => {},
  logout: () => {},
});

const STORAGE_KEY = "sharedrop_admin_auth";
/** Flag read by the login screen to show a "session expired" notice. */
export const SESSION_EXPIRED_KEY = "sharedrop_admin_session_expired";

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<"admin" | "viewer" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Don't trust an already-expired token from a previous session.
        const expMs = parsed.token ? getTokenExpiryMs(parsed.token) : null;
        if (expMs !== null && expMs <= Date.now()) {
          localStorage.removeItem(STORAGE_KEY);
        } else if (parsed.token && parsed.user && parsed.role) {
          setToken(parsed.token);
          setUser(parsed.user);
          setRole(parsed.role);
          api.setToken(parsed.token);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  const login = (t: string, u: AdminUser, r: "admin" | "viewer") => {
    setToken(t);
    setUser(u);
    setRole(r);
    api.setToken(t);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: t, user: u, role: r }));
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setRole(null);
    api.setToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Expiry-driven logout: flag the session as expired (so the login screen can
  // explain why), then clear auth. Manual logout does NOT set this flag.
  const handleExpiry = useCallback(() => {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    logout();
  }, [logout]);

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

  if (!ready) return null;

  return (
    <AuthContext.Provider value={{ token, user, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AuthContext);
}
