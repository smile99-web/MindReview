import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';

const ACCESS_COOKIE = 'mindreview_access_token';
const DEV_JWT_SECRET = 'mindreview-dev-secret-change-me';
const ACCESS_TOKEN_EXPIRE_SECONDS = 15 * 60; // 15 min
const REFRESH_TOKEN_EXPIRE_DAYS = 7;

function getSecret(): string {
  if (process.env.JWT_SECRET_KEY) return process.env.JWT_SECRET_KEY;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET_KEY environment variable is required in production');
  }
  return DEV_JWT_SECRET;
}

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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

interface JwtPayload {
  sub?: string;
  exp?: number;
  type?: string;
}

// --- JWT sign / verify ---

export function createAccessToken(sub: string, username: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({ sub, username, exp: now + ACCESS_TOKEN_EXPIRE_SECONDS, type: 'access' }),
  );
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', getSecret()).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

export function createRefreshTokenValue(): string {
  return crypto.randomBytes(64).toString('base64url');
}

// --- password hashing ---

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

// --- auth helpers ---

/**
 * Extract userId from the JWT Bearer token in the request's Authorization header
 * (or the access_token cookie). Returns null if no valid token is present.
 *
 * This is the canonical server-side way to get the authenticated userId.
 * Prefer this over reading userId from query params or request bodies.
 */
export function extractUserIdFromRequest(req: NextRequest): string | null {
  return getAuthenticatedUserId(req);
}

export function getAuthenticatedUserId(req: NextRequest): string | null {
  const token = getBearerToken(req);
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const secret = getSecret();
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

export const REFRESH_TOKEN_EXPIRE_MS = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
