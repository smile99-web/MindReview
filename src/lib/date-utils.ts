// 应用统一日期工具：全项目按 UTC+8 日界切分"天"。
// 原因：用户在中国（CST，UTC+8），VPS 也是 CST；若用 UTC 日界，
// 每天 00:00-08:00（北京时间）的活动会被归到"昨天"，各页面"今天"数据对不上。

// 应用时区相对 UTC 的偏移（毫秒），固定 +8 小时
const APP_TZ_OFFSET_MS = 8 * 3600 * 1000;

/**
 * 返回 UTC+8 时区下的日期 key（'YYYY-MM-DD'）。
 * 实现：把时间戳整体 +8 小时再取 UTC 日期，等价于 UTC+8 下的日历日。
 */
export function appDateKey(d: Date): string {
  return new Date(d.getTime() + APP_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 返回某个 UTC+8 日期（'YYYY-MM-DD'）零点的 Date 实例。
 * 例：'2026-07-18' → 北京时间 2026-07-18 00:00:00（UTC 2026-07-17 16:00:00）。
 */
export function startOfAppDay(dateKey: string): Date {
  return new Date(dateKey + 'T00:00:00.000+08:00');
}
