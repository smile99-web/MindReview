const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "::1"]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

// IPv6 私网/保留地址检查：回环(::1)、IPv4-mapped(::ffff:x.x.x.x)、
// ULA(fc00::/7，即 fc/fd 开头)、链路本地(fe80::/10，即 fe8/fe9/fea/feb 开头)
function isBlockedIpv6(hostname: string): boolean {
  if (hostname === "::1") return true;
  if (hostname.startsWith("::ffff:")) {
    // IPv4-mapped 地址：提取内嵌的 IPv4 部分，再走 IPv4 私网检查
    const v4part = hostname.slice("::ffff:".length);
    if (v4part.includes(".")) return isPrivateIpv4(v4part);
    // WHATWG 会把 ::ffff:127.0.0.1 序列化成压缩十六进制形式 ::ffff:7f00:1，需要还原成点分十进制
    const hexGroups = v4part.split(":");
    if (hexGroups.length === 2) {
      const hi = parseInt(hexGroups[0], 16);
      const lo = parseInt(hexGroups[1], 16);
      if (Number.isInteger(hi) && Number.isInteger(lo) && hi <= 0xffff && lo <= 0xffff) {
        return isPrivateIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
      }
    }
    // 无法解析的 mapped 地址一律拦截
    return true;
  }
  if (hostname.startsWith("fc") || hostname.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(hostname)) return true;
  return false;
}

export function assertSafeExternalBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Base URL must use https");
  }

  // WHATWG 规范下 IPv6 hostname 带方括号（如 "[::1]"），校验前先剥离
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(hostname) || isPrivateIpv4(hostname) || isBlockedIpv6(hostname)) {
    throw new Error("Base URL cannot point to a local or private network address");
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
