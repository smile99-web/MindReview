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
  authFetch,
  getValidToken,
  ensureFreshToken,
} from "@/lib/auth";

// 每 10 分钟主动 refresh 一次 access token，避免浏览器不活跃时
// access token 过期导致下次打开页面就跳登录页。
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

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
    name?: string,
    inviteCode?: string
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

      // getValidToken 返回 null 时（refresh 失败/凭证失效）不能照常
      // setUser——否则本地 user 记录还在、token 已没了，页面处于
      // "看似登录但所有请求都 401"的僵尸态
      const token = await getValidToken();
      const savedUser = token ? getCurrentUser() : null;
      if (!cancelled && savedUser) {
        setUser(savedUser);
      }
      if (!cancelled) {
        setLoading(false);
      }
    }

    restoreSession();

    // 后台定时续 token：浏览器不活跃也不会掉线
    const refreshTimer = setInterval(() => {
      if (!cancelled) {
        void ensureFreshToken();
      }
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await apiLogin(username, password);
    setUser(u);
  }, []);

  const register = useCallback(
    async (username: string, password: string, email?: string, name?: string, inviteCode?: string) => {
      const u = await apiRegister(username, password, email, name, inviteCode);
      setUser(u);
    },
    []
  );

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
    // 登出后必须离开受保护页：否则用户停留在 /dashboard 等页面，
    // 数据仍渲染着，直到下次请求 401 才被踢走（proxy 的页面守卫
    // 也只在导航时生效）
    if (typeof window !== 'undefined') {
      window.location.assign('/rm/');
    }
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

/**
 * Returns the current authenticated user's ID, or null if not logged in.
 * Use this instead of hardcoding 'default-user' or reading from localStorage.
 */
export function useUserId(): string | null {
  const { user } = useAuth();
  return user?.id ?? null;
}

/**
 * Returns a fetch wrapper that automatically attaches the Authorization header
 * and X-User-Id header to every request.
 *
 * Usage: const authFetch = useAuthFetch();
 *        authFetch('/api/dashboard')  // token + userId attached automatically
 */
export function useAuthFetch() {
  const { getToken } = useAuth();
  const userId = useUserId();

  return useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (userId) {
        headers.set('X-User-Id', userId);
      }
      return authFetch(input, { ...init, headers });
    },
    [getToken, userId],
  );
}
