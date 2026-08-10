import { jwtDecode } from "jwt-decode";

// 应用挂在 /rm 子路径（next.config.ts basePath）。AUTH_API 作为
// `${AUTH_API}/api/auth/*` 的前缀，默认带 basePath；跨域部署时才用
// NEXT_PUBLIC_AUTH_API 覆盖。
const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API || "/rm";

interface User {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  grade: string | null;
  avatarUrl: string | null;
}

interface TokenPayload {
  sub: string;
  username: string;
  exp: number;
  type: string;
}

const ACCESS_KEY = "mindreview_access_token";
const REFRESH_KEY = "mindreview_refresh_token";
const USER_KEY = "mindreview_user";
const ACCESS_COOKIE = "mindreview_access_token";
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export class AuthExpiredError extends Error {
  constructor(message = "Session expired") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

function setAuthCookies(access: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ACCESS_COOKIE}=${encodeURIComponent(access)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  document.cookie = `auth_status=1; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax${secure}`;
}

function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  setAuthCookies(access);
}

function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = `${ACCESS_COOKIE}=; path=/; max-age=0`;
  document.cookie = "auth_status=; path=/; max-age=0";
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  // basePath('/rm')：window.location 不带 next/link 的自动前缀，要显式补上
  const target = next && next !== "/"
    ? `/rm/auth/login?next=${encodeURIComponent(next)}`
    : "/rm/auth/login";
  window.location.assign(target);
}

function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = jwtDecode<TokenPayload>(token);
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now + 30; // 30s buffer
  } catch {
    return true;
  }
}

export async function getValidToken(): Promise<string | null> {
  const access = getAccessToken();
  if (access && !isTokenExpired(access)) {
    setAuthCookies(access);
    return access;
  }

  const refresh = getRefreshToken();
  if (!refresh) return null;

  try {
    const res = await fetch(`${AUTH_API}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      clearTokens();
      return null;
    }
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    return data.access_token;
  } catch {
    // 网络层失败（断网/DNS/CORS 等 fetch 抛异常）：服务端并未拒绝刷新，
    // 保留 token 不清除，返回 null 让调用方稍后重试（同 ensureFreshToken）
    return null;
  }
}

/**
 * Force-refresh the access token using the refresh token.
 * Used by AuthProvider's setInterval to keep the session alive on idle tabs.
 * Returns true if a fresh access token was obtained.
 */
export async function ensureFreshToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${AUTH_API}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    setUser(data.user);
    return true;
  } catch {
    return false;
  }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getValidToken();
  if (!token) {
    // 区分"确实无凭证"与"刷新接口网络失败"：getValidToken 在网络层失败时
    // 按设计保留 refresh token 供重试，此时清 token + 跳登录会把弱网用户
    // （iPad 常见）强制登出。只在 refresh token 都没了才真正登出。
    if (!getRefreshToken()) {
      clearTokens();
      redirectToLogin();
      throw new AuthExpiredError();
    }
    throw new Error('网络异常，无法刷新登录状态，请检查网络后重试');
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  // basePath('/rm')：应用挂在子路径下，fetch 不会自动加前缀，
  // 调用方保持 '/api/...' 写法不变，统一在这里补（全项目 100+ 调用点）。
  const url = typeof input === "string" && input.startsWith("/api") ? `/rm${input}` : input;
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearTokens();
    redirectToLogin();
    throw new AuthExpiredError();
  }
  return res;
}

function parseError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const detail = typeof err === "object" && err !== null && "detail" in err
    ? (err as { detail?: unknown }).detail
    : undefined;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          const record = item as { msg?: unknown; message?: unknown };
          return typeof record.msg === "string"
            ? record.msg
            : typeof record.message === "string"
              ? record.message
              : JSON.stringify(item);
        }
        return String(item);
      })
      .join("; ");
  }
  return fallback;
}

export async function login(username: string, password: string) {
  const res = await fetch(`${AUTH_API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(parseError(err, "登录失败"));
  }
  const data = await res.json();
  setTokens(data.access_token, data.refresh_token);
  setUser(data.user);
  return data.user as User;
}

export async function register(
  username: string,
  password: string,
  email?: string,
  name?: string,
  inviteCode?: string
) {
  const res = await fetch(`${AUTH_API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email, name, inviteCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(parseError(err, "注册失败"));
  }
  const data = await res.json();
  setTokens(data.access_token, data.refresh_token);
  setUser(data.user);
  return data.user as User;
}

export function logout() {
  clearTokens();
}

export function getCurrentUser(): User | null {
  return getUser();
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}
