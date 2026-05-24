"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
    title: "AI 智能拆解",
    desc: "输入教材内容，AI 自动拆解为最小可复习知识点，生成关键词、前置知识和典型题型。",
    gradient: "from-indigo-500 to-blue-500",
    bg: "from-indigo-50 to-blue-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5M20.25 16.5V18a2.25 2.25 0 01-2.25 2.25h-1.5M3.75 16.5V18A2.25 2.25 0 006 20.25h1.5M7.5 12h9m-9 0a4.5 4.5 0 004.5-4.5m-4.5 4.5a4.5 4.5 0 014.5 4.5M16.5 12a4.5 4.5 0 00-4.5-4.5m4.5 4.5a4.5 4.5 0 01-4.5 4.5" />
      </svg>
    ),
    title: "思维导图",
    desc: "可视化知识点之间的包含、前置、对比等关系，支持拖拽缩放，点击节点查看详情。",
    gradient: "from-purple-500 to-violet-500",
    bg: "from-purple-50 to-violet-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-2.77.774 6.023 6.023 0 01-2.77-.774" />
      </svg>
    ),
    title: "ICAP 分层学习",
    desc: "从被动阅读到互动应用，四个层级精准匹配认知负荷，让每个知识点都得到充分消化。",
    gradient: "from-emerald-500 to-green-500",
    bg: "from-emerald-50 to-green-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "间隔复习调度",
    desc: "基于掌握度自动安排复习计划，次日、3天、7天、14天四档间隔，最大化记忆效率。",
    gradient: "from-amber-500 to-orange-500",
    bg: "from-amber-50 to-orange-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
    title: "错题本 + AI 分析",
    desc: "记录错题后 AI 自动分析错因类型（概念/计算/粗心/应用），关联对应知识点查漏补缺。",
    gradient: "from-red-500 to-rose-500",
    bg: "from-red-50 to-rose-50",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
      </svg>
    ),
    title: "TTS 语音朗读",
    desc: "点击即可听取知识卡片的语音讲解，支持豆包 TTS 引擎，让听觉辅助记忆。",
    gradient: "from-cyan-500 to-teal-500",
    bg: "from-cyan-50 to-teal-50",
  },
];

const SUBJECTS = [
  { name: "语文", icon: "📖", color: "text-orange-600 bg-orange-50" },
  { name: "数学", icon: "📐", color: "text-blue-600 bg-blue-50" },
  { name: "物理", icon: "⚡", color: "text-purple-600 bg-purple-50" },
  { name: "化学", icon: "🧪", color: "text-green-600 bg-green-50" },
  { name: "历史", icon: "📜", color: "text-amber-600 bg-amber-50" },
  { name: "道法", icon: "⚖️", color: "text-red-600 bg-red-50" },
];

export default function HomePage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Already logged in → redirect
  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setSubmitting(true);
    setError("");

    try {
      await login(username.trim(), password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  // Show nothing while checking auth or redirecting
  if (loading || user) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] grid grid-cols-1 lg:grid-cols-2">
      {/* ====== 左侧：产品介绍 ====== */}
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 px-8 py-12 lg:px-12 xl:px-20">
        <div className="w-full max-w-[540px]">
          {/* Logo + 标题 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-lg font-bold shadow-md shadow-indigo-500/25">
              知
            </div>
            <span className="text-xs font-semibold text-indigo-500 uppercase tracking-widest">
              MindReview
            </span>
          </div>

          <h1 className="text-4xl xl:text-5xl font-bold text-slate-800 tracking-tight leading-tight mb-4">
            知图复习
          </h1>
          <p className="text-lg xl:text-xl text-slate-500 font-medium mb-3">
            面向中学生的 AI 知识复习系统
          </p>

          <p className="text-slate-500 text-[15px] leading-relaxed mb-8">
            轻量级的知识点拆解 + 思维导图 + 主动复习工具。
            覆盖<strong className="text-slate-700">数学、物理、化学、历史、道法</strong>五大学科，
            用 AI 帮你把厚厚一本教材变成一张清晰的知识网络。
          </p>

          {/* 学科标签 */}
          <div className="flex flex-wrap gap-2 mb-10">
            {SUBJECTS.map((s) => (
              <span
                key={s.name}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium ${s.color} border border-transparent`}
              >
                <span>{s.icon}</span>
                {s.name}
              </span>
            ))}
          </div>

          {/* 功能列表 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/80 transition-colors duration-200"
              >
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${f.gradient} text-white shadow-sm shrink-0`}
                >
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-0.5">
                    {f.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== 右侧：登录窗口 ====== */}
      <div className="flex items-center justify-center bg-white px-8 py-12 lg:px-12 xl:px-20 border-t lg:border-t-0 lg:border-l border-slate-200/60">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
              登录
            </h2>
            <p className="text-slate-500 text-sm mt-1.5">
              登录后开始你的知识复习之旅
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            {error && (
              <div className="bg-red-50/80 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-700 animate-fade-in">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                autoComplete="username"
                className="w-full rounded-xl border border-slate-200/80 px-4 py-3 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all duration-200 placeholder:text-slate-300"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200/80 px-4 py-3 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all duration-200 placeholder:text-slate-300"
              />
            </div>

            <Button
              type="submit"
              className="w-full py-3"
              loading={submitting}
              disabled={!username.trim() || !password}
            >
              登录
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-center text-sm text-slate-500">
              还没有账号？{" "}
              <Link
                href="/auth/register"
                className="text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
              >
                立即注册
              </Link>
            </p>

            <div className="mt-4 p-3 bg-slate-50/80 rounded-xl">
              <p className="text-xs text-slate-400 text-center">
                演示账号：<code className="text-slate-600 font-medium">demo</code>
                {" / "}
                <code className="text-slate-600 font-medium">password123</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
