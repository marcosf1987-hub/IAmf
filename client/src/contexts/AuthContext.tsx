import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { CompanySummary, OrgUsage, User } from "../lib/api";
import { fetchMe, login as apiLogin, signup as apiSignup } from "../lib/api";

const TOKEN_KEY = "rrhhia_token";

type AuthState = {
  user: User | null;
  company: CompanySummary | null;
  usage: OrgUsage | null;
  token: string | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    company: null,
    usage: null,
    token: null,
    loading: true,
  });

  const loadUser = useCallback(async (token: string) => {
    try {
      const { user, company, usage } = await fetchMe(token);
      setState({ user, company: company ?? null, usage: usage ?? null, token, loading: false });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setState({ user: null, company: null, usage: null, token: null, loading: false });
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) await loadUser(stored);
  }, [loadUser]);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      loadUser(stored);
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [loadUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user, company, usage } = await apiLogin(email, password);
    localStorage.setItem(TOKEN_KEY, token);
    setState({
      user,
      company: company ?? null,
      usage: usage ?? null,
      token,
      loading: false,
    });
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName?: string) => {
    const { token, user, company, usage } = await apiSignup(email, password, fullName);
    localStorage.setItem(TOKEN_KEY, token);
    setState({
      user,
      company: company ?? null,
      usage: usage ?? null,
      token,
      loading: false,
    });
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    const { user, company, usage } = await fetchMe(token);
    localStorage.setItem(TOKEN_KEY, token);
    setState({
      user,
      company: company ?? null,
      usage: usage ?? null,
      token,
      loading: false,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, company: null, usage: null, token: null, loading: false });
  }, []);

  const setUser = useCallback((user: User) => {
    setState((s) => (s.token ? { ...s, user } : s));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    signup,
    loginWithToken,
    logout,
    setUser,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
