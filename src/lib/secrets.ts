import crypto from "crypto";

const PREFIX = "enc:v1";
const DEV_SECRET = "mindreview-dev-secret-change-me";

/**
 * Resolve the AES key for at-rest secret encryption. In production, refuse
 * to fall back to a hardcoded dev secret — that would silently encrypt
 * every stored API key with a key the public source code already leaks,
 * making the encryption a no-op.
 *
 * ⚠️ 耦合警告：未设置 API_KEY_ENCRYPTION_SECRET 时回退用 JWT_SECRET_KEY 派生密钥。
 * 这意味着**轮换 JWT_SECRET_KEY 会使所有已加密的 API key 无法解密**（GCM auth tag
 * 校验失败抛错），用户需在设置页重新填写。生产环境应同时设置两个独立变量，
 * 避免该耦合；如已耦合需轮换 JWT，先迁移 API key 再换。
 */
function getKey(): Buffer {
  const envSecret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET_KEY;
  if (envSecret) {
    return crypto.createHash("sha256").update(envSecret).digest();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'API_KEY_ENCRYPTION_SECRET (or JWT_SECRET_KEY) environment variable is required in production'
    );
  }
  return crypto.createHash("sha256").update(DEV_SECRET).digest();
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(`${PREFIX}:`)) {
    return value;
  }

  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value: string): string {
  const secret = decryptSecret(value);
  if (secret.length <= 10) {
    return "*".repeat(secret.length);
  }
  return `${secret.slice(0, 6)}${"*".repeat(secret.length - 10)}${secret.slice(-4)}`;
}
