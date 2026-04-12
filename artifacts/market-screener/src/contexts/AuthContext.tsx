import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const TOKEN_KEY = "gp_token";
const USER_KEY  = "gp_user";

interface AuthUser {
  id: number;
  username: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoggedIn: boolean;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  showAuthModal: boolean;
  setShowAuthModal: (v: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (!r.ok) { clearAuth(); return; }
      return r.json();
    }).then(d => {
      if (d?.user) persist(d.user, token);
    }).catch(() => {});
  }, []);

  function persist(u: AuthUser, t: string) {
    setUser(u);
    setToken(t);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }

  function clearAuth() {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function login(emailOrUsername: string, password: string) {
    const r = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailOrUsername, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "Login failed");
    persist(d.user, d.token);
  }

  async function register(username: string, email: string, password: string) {
    const r = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error ?? "Registration failed");
    persist(d.user, d.token);
  }

  async function logout() {
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearAuth();
  }

  return (
    <AuthContext.Provider value={{
      user, token, isLoggedIn: !!user,
      login, register, logout,
      showAuthModal, setShowAuthModal,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
