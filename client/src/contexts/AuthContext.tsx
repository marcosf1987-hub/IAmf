import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../lib/api";
import { fetchMe, login as apiLogin, signup as apiSignup } from "../lib/api";

const TOKEN_KEY = "rrhhia_token";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  const loadUser = useCallback(async (token: string) => {
    try {
      const { user } = await fetchMe(token);
      setState({ user, token, loading: false });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setState({ user: null, token: null, loading: false });
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      loadUser(stored);
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token, user } = await apiLogin(email, password);
      localStorage.setItem(TOKEN_KEY, token);
      setState({ user, token, loading: false });
    },
    []
  );

  const signup = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const { token, user } = await apiSignup(email, password, fullName);
      localStorage.setItem(TOKEN_KEY, token);
      setState({ user, token, loading: false });
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, token: null, loading: false });
  }, []);

  const setUser = useCallback((user: User) => {
    setState((s) => (s.token ? { ...s, user } : s));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    signup,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
