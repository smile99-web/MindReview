const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "::1"]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8（"本机"地址块，如 https://0.0.0.1/ 此前可绕过）
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

// IPv6 私网/保留地址检查：回环(::1)、IPv4-mapped(::ffff:x.x.x.x)、
// ULA(fc00::/7，即 fc/fd 开头)、链路本地(fe80::/10，即 fe8/fe9/fea/feb 开头)
function isBlockedIpv6(hostname: string): boolean {
  if (hostname === "::1") return true;
  if (hostname === "::") return true; // 未指定地址（等同 0.0.0.0），此前漏拦
  if (hostname.startsWith("64:ff9b:")) return true; // NAT64 映射段，可用来包装 IPv4 内网
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

  // WHATWG 规范下 IPv6 hostname 带方括号（如 "[::1]"），校验前先剥离。
  // isBlockedIpv6 只对 IPv6 字面量生效：fc/fd/fe8 前缀判断若套到普通域名上，
  // 会把 fcdn.example.com、fe88.api.cn 这类合法域名误杀成"内网地址"。
  // IPv6 字面量必含冒号（或剥离前的方括号），域名二者都没有。
  const rawHostname = url.hostname.toLowerCase();
  const isIpv6Literal = rawHostname.startsWith('[') || rawHostname.includes(':');
  const hostname = rawHostname.replace(/^\[|\]$/g, "");
  if (
    BLOCKED_HOSTS.has(hostname) ||
    isPrivateIpv4(hostname) ||
    (isIpv6Literal && isBlockedIpv6(hostname))
  ) {
    throw new Error("Base URL cannot point to a local or private network address");
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
