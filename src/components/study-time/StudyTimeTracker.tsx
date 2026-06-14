"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { useStudyTimeTracker } from "@/lib/use-study-time-tracker";

/**
 * 全站挂载的活动追踪器 —— 仅在用户已登录时启用 hook。
 * 不渲染任何 UI，仅作为副作用宿主。
 */
export function StudyTimeTracker() {
  const { user, loading } = useAuth();
  const enabled = !loading && !!user;
  useStudyTimeTracker(enabled);
  return null;
}