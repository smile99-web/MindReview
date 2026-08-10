"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { authFetch } from "@/lib/auth";

interface InviteCode {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  createdAt: string;
}

export default function InvitePage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/invite-codes");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCodes(data.codes);
    } catch {
      setError("加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "邀请好友 - 知图复习";
    load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await authFetch("/api/invite-codes", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "生成失败，请重试");
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("确定删除这个推荐码吗？删除后它将无法用于注册。")) return;
    const res = await authFetch(`/api/invite-codes?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCodes((prev) => prev.filter((c) => c.id !== id));
    } else {
      setError("删除失败，请重试");
    }
  };

  const copy = async (c: InviteCode) => {
    try {
      await navigator.clipboard.writeText(c.code);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // 剪贴板不可用时选中即可，用户手动复制
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-xl shadow-md shadow-indigo-500/25 mb-4">
          🎁
        </div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          邀请好友
        </h1>
        <p className="text-slate-500 text-sm mt-1.5">
          生成推荐码分享给同学，他们注册时填写即可加入
        </p>
      </div>

      {error && (
        <div className="bg-red-50/80 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700">我的推荐码</div>
            <div className="text-xs text-slate-400 mt-0.5">
              每个码不限使用次数，最多同时持有 10 个
            </div>
          </div>
          <Button onClick={create} loading={creating} size="sm">
            + 生成推荐码
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="text-center text-sm text-slate-400 py-10">加载中…</div>
      ) : codes.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <div className="text-3xl mb-2">📮</div>
            <p className="text-sm text-slate-500">
              还没有推荐码，点击上方「生成推荐码」创建第一个吧
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {codes.map((c) => (
            <Card key={c.id} padding="sm">
              <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                <div className="min-w-0">
                  <div className="font-mono text-lg font-bold tracking-[0.2em] text-indigo-600 select-all">
                    {c.code}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    已邀请 {c.usedCount} 人 ·{" "}
                    {new Date(c.createdAt).toLocaleDateString("zh-CN")} 创建
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => copy(c)}>
                    {copiedId === c.id ? "✓ 已复制" : "复制"}
                  </Button>
                  <button
                    onClick={() => remove(c.id)}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
