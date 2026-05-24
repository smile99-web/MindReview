import crypto from "crypto";

const PREFIX = "enc:v1";
const DEV_SECRET = "mindreview-dev-secret-change-me";

function getKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET_KEY || DEV_SECRET;
  return crypto.createHash("sha256").update(secret).digest();
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
