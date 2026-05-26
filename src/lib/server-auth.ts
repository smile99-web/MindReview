import crypto from 'crypto';
import type { NextRequest } from 'next/server';

const ACCESS_COOKIE = 'mindreview_access_token';
const DEV_JWT_SECRET = 'mindreview-dev-secret-change-me';

interface JwtPayload {
  sub?: string;
  exp?: number;
  type?: string;
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getBearerToken(req: NextRequest): string | undefined {
  const authorization = req.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }
  return req.cookies.get(ACCESS_COOKIE)?.value;
}

export function getAuthenticatedUserId(req: NextRequest): string | null {
  const token = getBearerToken(req);
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const secret = process.env.JWT_SECRET_KEY || DEV_JWT_SECRET;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const actual = base64UrlDecode(parts[2]);
    if (!safeEqual(expected, actual)) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8')) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.type !== 'access' || typeof payload.exp !== 'number' || payload.exp <= now) {
      return null;
    }

    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
