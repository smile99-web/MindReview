// ---------------------------------------------------------------------------
// 进程内滑动窗口限流 + 登录失败锁定
// pm2 以单实例 fork 模式运行（见 ecosystem.config.js），进程内存即可靠。
// 用 globalThis 挂单例，避免 Next.js dev/构建期模块重复实例化导致计数器清零。
// ---------------------------------------------------------------------------

interface WindowBucket {
  /** 窗口内的请求时间戳（升序） */
  hits: number[];
}

interface FailBucket {
  count: number;
  resetAt: number;
}

interface RateLimitStore {
  windows: Map<string, WindowBucket>;
  failures: Map<string, FailBucket>;
  lastSweep: number;
}

const store: RateLimitStore = ((globalThis as Record<string, unknown>).__mindreviewRateLimit as
  | RateLimitStore
  | undefined) ?? {
  windows: new Map(),
  failures: new Map(),
  lastSweep: 0,
};
(globalThis as Record<string, unknown>).__mindreviewRateLimit = store;

/** 定期清扫过期桶，防止长期运行时内存膨胀 */
function sweep(now: number) {
  if (now - store.lastSweep < 10 * 60 * 1000) return;
  store.lastSweep = now;
  for (const [key, bucket] of store.windows) {
    if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 24 * 60 * 60 * 1000) {
      store.windows.delete(key);
    }
  }
  for (const [key, bucket] of store.failures) {
    if (bucket.resetAt <= now) store.failures.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** 被限流时建议的 Retry-After 秒数 */
  retryAfterSeconds: number;
}

/**
 * 滑动窗口限流：key 在 windowMs 内最多 limit 次。
 * 例如 rateLimit(`llm:${userId}`, 30, 3600_000) — 每小时 30 次。
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const windowStart = now - windowMs;
  const bucket = store.windows.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t > windowStart);
  if (bucket.hits.length >= limit) {
    store.windows.set(key, bucket);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.hits[0] + windowMs - now) / 1000)) };
  }
  bucket.hits.push(now);
  store.windows.set(key, bucket);
  return { ok: true, retryAfterSeconds: 0 };
}

/** 登录防爆破参数：15 分钟内失败 10 次 → 锁 15 分钟 */
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** 登录前检查：当前是否处于锁定中 */
export function isLoginBlocked(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = store.failures.get(key);
  if (bucket && bucket.resetAt > now && bucket.count >= LOGIN_MAX_FAILURES) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** 登录失败后计数；达到上限自动锁定 LOGIN_LOCK_MS */
export function recordLoginFailure(key: string): void {
  const now = Date.now();
  sweep(now);
  const bucket = store.failures.get(key);
  if (bucket && bucket.resetAt > now) {
    bucket.count += 1;
    if (bucket.count >= LOGIN_MAX_FAILURES) {
      bucket.resetAt = now + LOGIN_LOCK_MS;
    }
    return;
  }
  store.failures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
}

export function clearLoginFailures(key: string): void {
  store.failures.delete(key);
}

/** 从请求里提取限流用的客户端标识（IP，兜底 'unknown'）
 *
 * 部署前提：nginx 配置 `proxy_set_header X-Real-IP $remote_addr`（覆盖写入，
 * 客户端伪造无效）和 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
 * （追加模式——客户端自带的 XFF 会排在我方真实 IP 之前）。
 * 因此必须优先取 x-real-ip：取 XFF 首段会把客户端伪造的值当成限流 key，
 * 攻击者每次换 XFF 即获全新限流桶（限流与登录防爆破全部失效）。
 */
export function clientIp(req: Request): string {
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}
