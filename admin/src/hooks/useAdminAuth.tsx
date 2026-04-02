import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "../services/api";

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
        if (parsed.token && parsed.user && parsed.role) {
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

  const logout = () => {
    setToken(null);
    setUser(null);
    setRole(null);
    api.setToken(null);
    localStorage.removeItem(STORAGE_KEY);
  };

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
