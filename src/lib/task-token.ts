import crypto from 'crypto';

/**
 * 轻量任务令牌：把"答案"随任务下发给前端但不落库，用 HMAC 签名防篡改。
 * 用于图谱训练类游戏（找茬/挖空/默画）——任务是一次性的，不值得建表。
 *
 * domain 是签名域（如 'cloze' / 'rebuild'），不同游戏的 token 互不通用。
 * 密钥与登录 JWT 同源（JWT_SECRET_KEY）。
 */

function getSecret(): string {
  // 与 server-auth.ts 保持一致：生产环境缺失 JWT_SECRET_KEY 时直接抛错，
  // 否则任何人都能用源码公开的 dev secret 伪造游戏 token（读/改答案）。
  if (process.env.JWT_SECRET_KEY) return process.env.JWT_SECRET_KEY;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET_KEY environment variable is required in production');
  }
  return 'mindreview-dev-secret-change-me';
}

function base64UrlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function signTaskPayload<T extends object>(domain: string, payload: T, ttlSeconds: number): string {
  const body = base64UrlEncode(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  );
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', getSecret()).update(`${domain}.${body}`).digest(),
  );
  return `${body}.${sig}`;
}

export function verifyTaskToken<T extends { exp?: number }>(domain: string, token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', getSecret()).update(`${domain}.${parts[0]}`).digest();
  const actual = base64UrlDecode(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]).toString('utf8')) as T;
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
