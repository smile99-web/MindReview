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
];

const AUTH_PAGES = ["/auth/login", "/auth/register"];

const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
];
const ACCESS_COOKIE = "mindreview_access_token";
const DEV_JWT_SECRET = "mindreview-dev-secret-change-me";

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

    const secret = process.env.JWT_SECRET_KEY || DEV_JWT_SECRET;
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

  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  if (pathname.startsWith("/api/") && !isPublicApi && !hasValidAccessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (pathname === "/" && authCookie?.value === "1") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (AUTH_PAGES.some((p) => pathname.startsWith(p)) && authCookie?.value === "1") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (
    PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) &&
    authCookie?.value !== "1"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
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
    "/auth/:path*",
  ],
};
