import crypto from 'crypto';

/**
 * 家长分享链接的只读 token：HMAC 签名（与 JWT 同一密钥），
 * 不含敏感信息，7 天有效。校验通过只返回 userId，数据接口据此
 * 输出聚合后的周报（不含题目原文等私密内容）。
 */

const SHARE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  if (process.env.JWT_SECRET_KEY) return process.env.JWT_SECRET_KEY;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET_KEY environment variable is required in production');
  }
  return 'mindreview-dev-secret-change-me';
}

function base64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function sign(payloadB64: string): string {
  return base64url(crypto.createHmac('sha256', getSecret()).update(payloadB64).digest());
}

export function createShareToken(userId: string): string {
  const payload = base64url(JSON.stringify({ uid: userId, exp: Date.now() + SHARE_TOKEN_TTL_MS, typ: 'share' }));
  return `${payload}.${sign(payload)}`;
}

export function verifyShareToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const expected = sign(parts[0]);
    const actual = Buffer.from(parts[1]);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), actual)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as {
      uid?: string;
      exp?: number;
      typ?: string;
    };
    if (payload.typ !== 'share' || typeof payload.uid !== 'string' || !payload.uid) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload.uid;
  } catch {
    return null;
  }
}
