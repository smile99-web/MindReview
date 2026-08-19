"use client";

import { useEffect, useRef } from "react";
import { authFetch, AUTH_API, getValidToken } from "@/lib/auth";

/**
 * 学习时长追踪器 —— 客户端 hook。
 *
 * 规则：
 * - 监听 mousedown / pointerdown / touchstart / keydown / input / scroll / wheel
 *   任一事件即视为"有活动"，刷新最后活动时间戳
 * - 距最近活动 ≤ 30 秒 → 持续累计学习时长（每秒 +1）
 * - 距最近活动 > 30 秒 → 暂停计时（不发心跳）
 * - 标签页隐藏 → 立即 flush 当前心跳 + 暂停
 * - 心跳间隔 15 秒：累计到 15 秒就 flush 一次并归零
 * - 卸载 / 路由切换时强制 flush，避免最后一段时长丢失
 *
 * 数据流：localStorage 兜底当前活跃段起点，刷新页面可恢复。
 */

const HEARTBEAT_INTERVAL_SECONDS = 15;
const INACTIVITY_TIMEOUT_MS = 30 * 1000;
const TICK_INTERVAL_MS = 1000;
const STORAGE_KEY = "mindreview:study-tracker:v1";

interface PersistedState {
  activeSince: number;
  lastActivityAt: number;
  accumulatedSeconds: number;
  isActive: boolean;
}

function emptyState(): PersistedState {
  const now = Date.now();
  return {
    activeSince: now,
    lastActivityAt: now,
    accumulatedSeconds: 0,
    isActive: true,
  };
}

function readPersisted(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (
      typeof parsed.activeSince !== "number" ||
      typeof parsed.lastActivityAt !== "number" ||
      typeof parsed.accumulatedSeconds !== "number" ||
      typeof parsed.isActive !== "boolean"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(state: PersistedState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function useStudyTimeTracker(enabled: boolean) {
  const stateRef = useRef<PersistedState>(emptyState());
  const inFlightRef = useRef(false);
  const tickerIdRef = useRef<number | null>(null);
  const activityHandlersRef = useRef<{
    activity: () => void;
    onVisibilityChange: () => void;
    onPageHide: () => void;
    onBeforeUnload: () => void;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    // 返回是否已发出：上一次心跳还在途时返回 false，
    // 调用方据此把本次时长保留到下轮（否则会静默丢失最多 15 秒）
    function sendHeartbeat(body: {
      startedAt: string;
      endedAt: string;
      durationSeconds: number;
      heartbeatId?: string;
    }): boolean {
      if (inFlightRef.current) return false;
      inFlightRef.current = true;
      try {
        // sendBeacon 是原生 API，不会像 authFetch 一样自动补 basePath；
        // 应用挂在 /rm 下，裸 /api/... 会打到 nginx 其它站点 → 404 静默丢数据。
        const url = `${AUTH_API}/api/study-time/heartbeat`;
        const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
        const sent =
          typeof navigator !== "undefined" && navigator.sendBeacon?.(url, blob);
        if (sent) {
          // sendBeacon 已发，立即放行
          setTimeout(() => {
            inFlightRef.current = false;
          }, 0);
          return true;
        }
      } catch {
        /* 退回到 fetch */
      }
      void authFetch("/api/study-time/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      })
        .catch(() => {
          /* 心跳失败静默丢弃，下轮继续，避免 unhandled rejection */
        })
        .finally(() => {
          inFlightRef.current = false;
        });
      return true;
    }

    function flushHeartbeat() {
      const s = stateRef.current;
      const seconds = s.accumulatedSeconds;
      if (seconds <= 0) {
        s.isActive = false;
        writePersisted(s);
        return;
      }

      const startedAt = new Date(s.activeSince);
      const endedAt = new Date(s.activeSince + seconds * 1000);
      const sent = sendHeartbeat({
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds: seconds,
        // 幂等键按内容派生（activeSince+seconds 唯一确定一次心跳）：
        // 同一内容无论重发多少次服务端都只计一次；用随机 UUID 则每次
        // 重发都是新键，去重形同虚设。
        heartbeatId: `${s.activeSince}:${seconds}`,
      });
      if (!sent) {
        // 上一次心跳还在途：本次时长保留在 accumulatedSeconds 里下轮再发，不清零
        return;
      }

      const now = Date.now();
      const stillActive =
        now - s.lastActivityAt <= INACTIVITY_TIMEOUT_MS && !document.hidden;
      if (stillActive) {
        stateRef.current = {
          activeSince: now,
          lastActivityAt: s.lastActivityAt,
          accumulatedSeconds: 0,
          isActive: true,
        };
      } else {
        stateRef.current = {
          activeSince: s.activeSince,
          lastActivityAt: s.lastActivityAt,
          accumulatedSeconds: 0,
          isActive: false,
        };
      }
      writePersisted(stateRef.current);
    }

    function flushAndPause() {
      const s = stateRef.current;
      if (!s.isActive) return;
      flushHeartbeat();
    }

    // 逐秒 +1 会在定时器被节流/合盖唤醒时漏计：按真实时间差累计，
    // 单次 tick 最多补 5 秒（长时间无 tick 通常意味着挂起，不该白送时长）
    let lastTickAt = 0;
    function tick() {
      const s = stateRef.current;
      if (!s.isActive) return;

      if (document.hidden) {
        flushAndPause();
        return;
      }
      if (Date.now() - s.lastActivityAt > INACTIVITY_TIMEOUT_MS) {
        flushHeartbeat();
        return;
      }

      const now = Date.now();
      const delta = lastTickAt > 0 ? Math.min(5, Math.max(1, Math.round((now - lastTickAt) / 1000))) : 1;
      lastTickAt = now;
      s.accumulatedSeconds += delta;
      if (s.accumulatedSeconds >= HEARTBEAT_INTERVAL_SECONDS) {
        flushHeartbeat();
      }
    }

    function onActivity() {
      const now = Date.now();
      const s = stateRef.current;
      if (!s.isActive) {
        stateRef.current = {
          activeSince: now,
          lastActivityAt: now,
          accumulatedSeconds: 0,
          isActive: true,
        };
      } else {
        s.lastActivityAt = now;
      }
      writePersisted(stateRef.current);
    }

    function onVisibilityChange() {
      if (document.hidden) {
        flushAndPause();
      } else {
        const s = stateRef.current;
        if (!s.isActive) {
          stateRef.current = {
            activeSince: Date.now(),
            lastActivityAt: Date.now(),
            accumulatedSeconds: 0,
            isActive: true,
          };
        } else {
          s.lastActivityAt = Date.now();
        }
        writePersisted(stateRef.current);
      }
    }

    function start() {
      const now = Date.now();
      const restored = readPersisted();

      if (
        restored &&
        restored.isActive &&
        now - restored.lastActivityAt <= INACTIVITY_TIMEOUT_MS &&
        !document.hidden
      ) {
        stateRef.current = restored;
      } else {
        stateRef.current = emptyState();
        writePersisted(stateRef.current);
      }

      // 绑定 activity 事件
      const opts: AddEventListenerOptions = { passive: true, capture: true };
      window.addEventListener("mousedown", onActivity, opts);
      window.addEventListener("pointerdown", onActivity, opts);
      window.addEventListener("touchstart", onActivity, opts);
      window.addEventListener("keydown", onActivity, opts);
      window.addEventListener("input", onActivity, opts);
      window.addEventListener("scroll", onActivity, opts);
      window.addEventListener("wheel", onActivity, opts);
      document.addEventListener("visibilitychange", onVisibilityChange);
      window.addEventListener("pagehide", flushAndPause);
      window.addEventListener("beforeunload", flushAndPause);

      activityHandlersRef.current = {
        activity: onActivity,
        onVisibilityChange,
        onPageHide: flushAndPause,
        onBeforeUnload: flushAndPause,
      };

      // 启动 ticker
      lastTickAt = Date.now();
      tickerIdRef.current = window.setInterval(tick, TICK_INTERVAL_MS);
    }

    function stop() {
      flushAndPause();
      if (tickerIdRef.current !== null) {
        window.clearInterval(tickerIdRef.current);
        tickerIdRef.current = null;
      }
      const opts: EventListenerOptions = { capture: true };
      window.removeEventListener("mousedown", onActivity, opts);
      window.removeEventListener("pointerdown", onActivity, opts);
      window.removeEventListener("touchstart", onActivity, opts);
      window.removeEventListener("keydown", onActivity, opts);
      window.removeEventListener("input", onActivity, opts);
      window.removeEventListener("scroll", onActivity, opts);
      window.removeEventListener("wheel", onActivity, opts);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushAndPause);
      window.removeEventListener("beforeunload", flushAndPause);
    }

    void getValidToken().then((token) => {
      if (cancelled) return;
      if (!token) return; // 未登录不追踪
      start();
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled]);
}