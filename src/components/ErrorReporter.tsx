'use client';

import { useEffect } from 'react';

/**
 * 全局前端错误探针：捕获 window.onerror / unhandledrejection 并上报到
 * /api/client-error（匿名可报、IP 限流、发送失败静默丢弃）。
 * 让白屏/JS 崩溃不再依赖用户反馈才被发现（2026-08 白屏事件的教训）。
 */
export function ErrorReporter() {
  useEffect(() => {
    // 去重：同一消息 60 秒内只报一次，避免循环报错打爆通道
    const seen = new Map<string, number>();
    const canReport = (message: string) => {
      const now = Date.now();
      const last = seen.get(message) ?? 0;
      if (now - last < 60_000) return false;
      seen.set(message, now);
      if (seen.size > 50) seen.clear();
      return true;
    };

    const report = (payload: { message: string; stack?: string }) => {
      try {
        if (!payload.message || !canReport(payload.message)) return;
        const body = JSON.stringify({
          message: payload.message.slice(0, 1000),
          stack: payload.stack?.slice(0, 4000),
          url: window.location.href,
          userAgent: navigator.userAgent,
        });
        // keepalive：页面即将卸载时也能发出
        void fetch('/rm/api/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* 探针自身绝不产生新错误 */
      }
    };

    const onError = (event: ErrorEvent) => {
      // 忽略跨域脚本错误噪音
      if (event.message === 'Script error.') return;
      report({ message: event.message, stack: event.error?.stack });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report({
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
