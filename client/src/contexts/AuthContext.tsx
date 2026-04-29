import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { CompanySummary, OrgUsage, User } from "../lib/api";
import {
  fetchMe,
  login as apiLogin,
  logoutSession,
  signup as apiSignup,
} from "../lib/api";

/** Migración PR2: ya no se usa para sesión; se limpia una vez al cargar. */
const LEGACY_TOKEN_KEY = "rrhhia_token";

type AuthState = {
  user: User | null;
  company: CompanySummary | null;
  usage: OrgUsage | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    company: null,
    usage: null,
    loading: true,
  });

  const refreshSession = useCallback(async () => {
    try {
      const { user, company, usage } = await fetchMe();
      setState({
        user,
        company: company ?? null,
        usage: usage ?? null,
        loading: false,
      });
    } catch {
      setState({ user: null, company: null, usage: null, loading: false });
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      /* noop */
    }
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const me = await apiLogin(email, password);
    setState({
      user: me.user,
      company: me.company ?? null,
      usage: me.usage ?? null,
      loading: false,
    });
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName?: string) => {
    const me = await apiSignup(email, password, fullName);
    setState({
      user: me.user,
      company: me.company ?? null,
      usage: me.usage ?? null,
      loading: false,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } catch {
      /* seguir limpiando estado local */
    }
    setState({ user: null, company: null, usage: null, loading: false });
  }, []);

  const setUser = useCallback((user: User) => {
    setState((s) => (s.user ? { ...s, user } : s));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    signup,
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
