"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const NAV_ITEMS = [
  { href: "/dashboard", label: "首页", icon: "🏠" },
  { href: "/subjects", label: "学科", icon: "📚" },
  { href: "/review", label: "复习", icon: "📝" },
  { href: "/mistakes", label: "错题本", icon: "❌" },
  { href: "/logs", label: "AI记录", icon: "🤖" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  const isAuthPage = pathname.startsWith("/auth/");

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/[0.02] via-purple-500/[0.02] to-indigo-500/[0.02]" />
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between relative">
        <Link
          href={user ? "/dashboard" : "/"}
          className="flex items-center gap-2.5 group"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-sm font-bold shadow-sm shadow-indigo-500/20 group-hover:shadow-md group-hover:shadow-indigo-500/30 transition-shadow">
            知
          </span>
          <span className="font-semibold text-base text-slate-800 tracking-tight">
            知图复习
          </span>
        </Link>

        {/* 导航菜单 — 仅登录后可见 */}
        {user && (
          <div className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-indigo-600 bg-indigo-50/80"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/70"
                  }`}
                >
                  <span className="mr-1.5">{item.icon}</span>
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-indigo-500 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-2">
          {!loading && (
            <>
              {user ? (
                <>
                  <span className="text-sm text-slate-600 font-medium">
                    {user.name || user.username}
                  </span>
                  <button
                    onClick={logout}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                  >
                    退出
                  </button>
                  <Link
                    href="/settings"
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100/70 transition-all duration-200"
                    title="设置"
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Link>
                </>
              ) : (
                !isAuthPage && (
                  <Link
                    href="/auth/login"
                    className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-all duration-200"
                  >
                    登录
                  </Link>
                )
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
