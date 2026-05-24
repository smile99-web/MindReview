"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getCurrentUser,
  isAuthenticated,
  getValidToken,
} from "@/lib/auth";

interface User {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  grade: string | null;
  avatarUrl: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    email?: string,
    name?: string
  ) => Promise<void>;
  logout: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  getToken: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!isAuthenticated()) {
        if (!cancelled) setLoading(false);
        return;
      }

      await getValidToken();
      const savedUser = getCurrentUser();
      if (!cancelled && savedUser) {
        setUser(savedUser);
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await apiLogin(username, password);
    setUser(u);
  }, []);

  const register = useCallback(
    async (username: string, password: string, email?: string, name?: string) => {
      const u = await apiRegister(username, password, email, name);
      setUser(u);
    },
    []
  );

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  const getToken = useCallback(async () => {
    return await getValidToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, getToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
