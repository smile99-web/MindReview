import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/subjects",
  "/review",
  "/mistakes",
  "/practice",
  "/logs",
  "/settings",
  "/mindmap",
  "/cards",
  "/chapters",
  "/schemas",
  "/search",
  "/analytics",
  "/exam",
  "/doc",
  "/lab3d",
  "/invite",
];

const AUTH_PAGES = ["/auth/login", "/auth/register"];

const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/health",
];
const ACCESS_COOKIE = "mindreview_access_token";
const DEV_JWT_SECRET = "mindreview-dev-secret-change-me";

/**
 * 精确前缀匹配：`/review-x` 不应命中 `/review`。
 * startsWith 裸用会把 `/api/auth/loginAnything` 误判为公开接口（认证绕过），
 * 也会把 `/cards-gallery` 这类公开页误判为受保护页。
 */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * Resolve the JWT secret. In production, refuse to fall back to a hardcoded
 * dev secret — that would silently let an attacker forge a valid token and
 * bypass the proxy's 401 check. Mirrors the guard in src/lib/server-auth.ts
 * so the two halves can't disagree on what counts as "secure enough".
 */
function getProxySecret(): string {
  const envSecret = process.env.JWT_SECRET_KEY;
  if (envSecret) return envSecret;
  if (process.env.NODE_ENV === 'production') {
    // Fail closed: the proxy cannot verify tokens without a real secret.
    // This throws on every request, but that's preferable to silently
    // accepting forgeries.
    throw new Error('JWT_SECRET_KEY environment variable is required in production');
  }
  return DEV_JWT_SECRET;
}

type JwtPayload = {
  exp?: number;
  type?: string;
};

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function base64UrlToString(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function verifyAccessToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const header = JSON.parse(base64UrlToString(parts[0])) as { alg?: string };
    if (header.alg !== "HS256") return false;

    const secret = getProxySecret();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
    );

    if (!timingSafeEqual(signature, base64UrlToBytes(parts[2]))) return false;

    const payload = JSON.parse(base64UrlToString(parts[1])) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    return payload.type === "access" && typeof payload.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}

function getBearerToken(request: NextRequest): string | undefined {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return request.cookies.get(ACCESS_COOKIE)?.value;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authCookie = request.cookies.get("auth_status");
  const hasValidAccessToken = await verifyAccessToken(getBearerToken(request));

  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => matchesPrefix(pathname, p));
  if (pathname.startsWith("/api/") && !isPublicApi && !hasValidAccessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // basePath('/rm')：nextUrl.pathname 已被 Next 剥掉前缀，上面的匹配逻辑
  // 不用改；但 new URL(path, request.url) 不会带前缀，必须用 nextUrl.clone()
  // （clone 保留 basePath，序列化时自动拼回）做重定向。
  if (pathname === "/" && authCookie?.value === "1") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (AUTH_PAGES.some((p) => matchesPrefix(pathname, p)) && authCookie?.value === "1") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (
    PROTECTED_PREFIXES.some((p) => matchesPrefix(pathname, p)) &&
    authCookie?.value !== "1"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/api/:path*",
    "/dashboard/:path*",
    "/subjects/:path*",
    "/review/:path*",
    "/mistakes/:path*",
    "/practice/:path*",
    "/logs/:path*",
    "/settings/:path*",
    "/mindmap/:path*",
    "/cards/:path*",
    "/chapters/:path*",
    "/schemas/:path*",
    "/search/:path*",
    "/analytics/:path*",
    "/exam/:path*",
    "/doc/:path*",
    "/lab3d/:path*",
    "/invite/:path*",
    "/auth/:path*",
  ],
};
