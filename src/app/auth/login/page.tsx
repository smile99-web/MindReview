"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [touched, setTouched] = useState({ username: false, password: false });

  const usernameValid = username.trim().length >= 3;
  const passwordValid = password.length >= 6;
  const formValid = usernameValid && passwordValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;

    setLoading(true);
    setError("");

    try {
      await login(username.trim(), password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-lg font-bold shadow-md shadow-indigo-500/25 mb-4">
            知
          </div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            登录知图复习
          </h1>
          <p className="text-slate-500 text-sm mt-1.5">
            欢迎回来
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <div className="bg-red-50/80 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-700">
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
                onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                placeholder="输入用户名"
                autoComplete="username"
                className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-300"
              />
              {touched.username && !usernameValid && (
                <p className="text-xs text-red-500 mt-1">用户名至少 3 个字符</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder="输入密码"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-300"
              />
              {touched.password && !passwordValid && (
                <p className="text-xs text-red-500 mt-1">密码至少 6 个字符</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              loading={loading}
              disabled={!formValid}
            >
              登录
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-slate-500 mt-6">
          还没有账号？{" "}
          <Link
            href="/auth/register"
            className="text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
          >
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}
