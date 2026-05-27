import { jwtDecode } from "jwt-decode";

const AUTH_API = process.env.NEXT_PUBLIC_AUTH_API || "http://localhost:8001";

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
const COOKIE_MAX_AGE_SECONDS = 15 * 60;

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
    clearTokens();
    return null;
  }
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getValidToken();
  if (!token) {
    clearTokens();
    window.location.href = "/";
    throw new Error("Session expired");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
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
  name?: string
) {
  const res = await fetch(`${AUTH_API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email, name }),
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
