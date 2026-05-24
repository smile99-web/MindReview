"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type ServiceName = "llm" | "tts" | "image";

interface KeyState {
  saved: boolean;
  testing: boolean;
  result: { ok: boolean; error?: string; message?: string; latencyMs?: number } | null;
  key: string;
  baseUrl: string;
  model: string;
  appId: string;      // TTS only
  cluster: string;    // TTS only
  voiceType: string;  // TTS only
}

interface SavedKey {
  service: string;
  key: string; // masked
  baseUrl: string | null;
  model: string | null;
  testOk: boolean;
  lastTest: string | null;
}

const DEFAULT_KEYS: Record<ServiceName, KeyState> = {
  llm: {
    saved: false, testing: false, result: null,
    key: "", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash",
    appId: "", cluster: "", voiceType: "",
  },
  tts: {
    saved: false, testing: false, result: null,
    key: "", baseUrl: "", model: "",
    appId: "", cluster: "volcano_tts", voiceType: "zh_female_qingxin",
  },
  image: {
    saved: false, testing: false, result: null,
    key: "", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seedream-5-0-260128",
    appId: "", cluster: "", voiceType: "",
  },
};

const SERVICE_INFO: Record<ServiceName, { title: string; icon: string; desc: string; docUrl: string; docLabel: string; fields: string[] }> = {
  llm: {
    title: "DeepSeek LLM",
    icon: "🤖",
    desc: "AI 拆解教材、生成题目、分析错题",
    docUrl: "https://api-docs.deepseek.com",
    docLabel: "DeepSeek API 文档",
    fields: ["key", "baseUrl", "model"],
  },
  tts: {
    title: "豆包语音 TTS",
    icon: "🔊",
    desc: "知识卡片语音朗读",
    docUrl: "https://www.volcengine.com/docs/6561",
    docLabel: "火山引擎 TTS 文档",
    fields: ["key", "appId", "cluster", "voiceType"],
  },
  image: {
    title: "Doubao Seedream",
    icon: "🎨",
    desc: "知识点配图生成",
    docUrl: "https://www.volcengine.com/docs/82379/1537010",
    docLabel: "火山方舟图片生成文档",
    fields: ["key", "baseUrl", "model"],
  },
};

export default function SettingsPage() {
  const [keys, setKeys] = useState<Record<ServiceName, KeyState>>(DEFAULT_KEYS);
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载已保存的 keys
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SavedKey[]) => {
        if (Array.isArray(data)) setSavedKeys(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateField = (svc: ServiceName, field: string, value: string) => {
    setKeys((prev) => ({
      ...prev,
      [svc]: { ...prev[svc], [field]: value, result: null },
    }));
  };

  // 保存 Key
  const saveKey = async (svc: ServiceName) => {
    const k = keys[svc];
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: svc,
          key: k.key,
          baseUrl: k.baseUrl || undefined,
          model: k.model || undefined,
        }),
      });
      setKeys((prev) => ({ ...prev, [svc]: { ...prev[svc], saved: true } }));
      // Refresh saved list
      const res = await fetch("/api/settings");
      setSavedKeys(await res.json());
    } catch {
      // ignore
    }
  };

  // 测试连接
  const testConnection = async (svc: ServiceName) => {
    setKeys((prev) => ({ ...prev, [svc]: { ...prev[svc], testing: true, result: null } }));

    const k = keys[svc];
    const testEndpoints: Record<ServiceName, string> = {
      llm: "/api/settings/test-llm",
      tts: "/api/settings/test-tts",
      image: "/api/settings/test-image",
    };

    try {
      const body: Record<string, string> = { key: k.key };
      if (k.baseUrl) body.baseUrl = k.baseUrl;
      if (k.model) body.model = k.model;
      if (svc === "tts") {
        if (k.appId) body.appId = k.appId;
        if (k.cluster) body.cluster = k.cluster;
        if (k.voiceType) body.voiceType = k.voiceType;
      }

      const res = await fetch(testEndpoints[svc], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      setKeys((prev) => ({
        ...prev,
        [svc]: { ...prev[svc], testing: false, result: data, saved: true },
      }));
    } catch (err: any) {
      setKeys((prev) => ({
        ...prev,
        [svc]: { ...prev[svc], testing: false, result: { ok: false, error: err.message } },
      }));
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mb-2">设置</h1>
      <p className="text-slate-500 text-[15px] mb-8">配置 AI 服务 API Key，每个服务可单独测试连接</p>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.entries(SERVICE_INFO) as [ServiceName, typeof SERVICE_INFO["llm"]][]).map(([svc, info]) => {
            const k = keys[svc];
            const saved = savedKeys.find((s) => s.service === svc);

            return (
              <Card key={svc}>
                {/* 服务标题 */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{info.icon}</span>
                    <div>
                      <h3 className="font-semibold text-slate-800 text-[15px]">{info.title}</h3>
                      <p className="text-xs text-slate-400">{info.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {saved?.testOk && <Badge variant="success">已通过</Badge>}
                    <a
                      href={info.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                    >
                      {info.docLabel} ↗
                    </a>
                  </div>
                </div>

                {/* 输入字段 */}
                <div className="space-y-3 mb-4">
                  {/* API Key */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      API Key {!saved && <span className="text-red-400">*</span>}
                      {saved && <span className="text-emerald-500 ml-1">已保存 ✓</span>}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={k.key}
                        onChange={(e) => updateField(svc, "key", e.target.value)}
                        placeholder={saved ? "已保存，可直接测试 · 输入新 Key 可更新" : "输入 API Key..."}
                        className="flex-1 rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-400 font-mono"
                      />
                      <Button size="sm" variant="secondary" onClick={() => saveKey(svc)} disabled={!k.key}>
                        保存
                      </Button>
                    </div>
                  </div>

                  {/* TTS 专用字段 */}
                  {svc === "tts" && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">App ID</label>
                        <input
                          type="text"
                          value={k.appId}
                          onChange={(e) => updateField(svc, "appId", e.target.value)}
                          placeholder="App ID"
                          className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors font-mono placeholder:text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Cluster</label>
                        <input
                          type="text"
                          value={k.cluster}
                          onChange={(e) => updateField(svc, "cluster", e.target.value)}
                          placeholder="volcano_tts"
                          className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors font-mono placeholder:text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">音色</label>
                        <select
                          value={k.voiceType}
                          onChange={(e) => updateField(svc, "voiceType", e.target.value)}
                          className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
                        >
                          <optgroup label="精品音色 (2.0)">
                            <option value="BV701_streaming">擎苍 (男声·推荐)</option>
                            <option value="BV700_streaming">灿灿 (男声)</option>
                            <option value="BV001_streaming">通用女声</option>
                            <option value="BV002_streaming">通用男声</option>
                            <option value="BV400_streaming">小悦 (女声)</option>
                            <option value="BV401_streaming">小悦 2.0 (女声)</option>
                            <option value="BV003_streaming">小辉 (男声)</option>
                            <option value="BV104_streaming">温柔淑女</option>
                            <option value="BV102_streaming">儒雅青年</option>
                            <option value="BV100_streaming">质朴青年</option>
                            <option value="BV004_streaming">开朗青年</option>
                            <option value="BV123_streaming">阳光青年</option>
                            <option value="BV107_streaming">霸气青叔</option>
                            <option value="BV115_streaming">古风少御</option>
                            <option value="BV113_streaming">甜宠少御</option>
                            <option value="BV120_streaming">反卷青年</option>
                            <option value="BV119_streaming">通用赘婿</option>
                          </optgroup>
                          <optgroup label="经典音色 (1.0)">
                            <option value="zh_female_qingxin">清新女声</option>
                            <option value="zh_male_qingxin">清新男声</option>
                            <option value="zh_female_tianmei">甜美女生</option>
                          </optgroup>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* LLM / Image: Base URL + Model */}
                  {(svc === "llm" || svc === "image") && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Base URL</label>
                        <input
                          type="text"
                          value={k.baseUrl}
                          onChange={(e) => updateField(svc, "baseUrl", e.target.value)}
                          placeholder="API 地址"
                          className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors font-mono placeholder:text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                        <input
                          type="text"
                          value={k.model}
                          onChange={(e) => updateField(svc, "model", e.target.value)}
                          placeholder="模型名称"
                          className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors font-mono placeholder:text-slate-300"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 测试按钮 + 结果 */}
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    onClick={() => testConnection(svc)}
                    loading={k.testing}
                    disabled={!k.key && !saved}
                  >
                    测试连接
                  </Button>

                  {k.result && (
                    <div
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                        k.result.ok
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      <span>{k.result.ok ? "✓" : "✗"}</span>
                      <span>
                        {k.result.ok
                          ? `连接成功${k.result.latencyMs ? ` (${k.result.latencyMs}ms)` : ""}`
                          : k.result.error || "连接失败"}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          {/* 数据库配置 */}
          <Card>
            <h3 className="font-semibold text-slate-800 mb-3 text-[15px]">数据库</h3>
            <div className="p-4 bg-slate-50/80 rounded-xl text-sm text-slate-500">
              PostgreSQL + pgvector · 通过 <code className="text-indigo-600 text-xs bg-indigo-50 px-1.5 py-0.5 rounded">DATABASE_URL</code> 环境变量配置
            </div>
          </Card>

          {/* 复习间隔（SM-2） */}
          <Card>
            <h3 className="font-semibold text-slate-800 mb-4 text-[15px]">SM-2 记忆调度</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-slate-50/80 rounded-xl">
                <div className="font-medium text-slate-700">算法</div>
                <div className="text-xs text-slate-400 mt-0.5">SM-2 + 艾宾浩斯遗忘曲线</div>
              </div>
              <div className="p-3 bg-slate-50/80 rounded-xl">
                <div className="font-medium text-slate-700">质量评分</div>
                <div className="text-xs text-slate-400 mt-0.5">0-5 分制，≥3 通过</div>
              </div>
              <div className="p-3 bg-slate-50/80 rounded-xl">
                <div className="font-medium text-slate-700">EF 范围</div>
                <div className="text-xs text-slate-400 mt-0.5">1.3 ~ 2.5+ 动态调整</div>
              </div>
              <div className="p-3 bg-slate-50/80 rounded-xl">
                <div className="font-medium text-slate-700">最大间隔</div>
                <div className="text-xs text-slate-400 mt-0.5">365 天</div>
              </div>
            </div>
          </Card>

          {/* 关于 */}
          <Card>
            <h3 className="font-semibold text-slate-800 mb-3 text-[15px]">关于知图复习</h3>
            <div className="text-sm text-slate-500 space-y-1.5">
              <p>版本: MVP 2.0</p>
              <p>技术栈: Next.js 16 + FastAPI + Prisma + PostgreSQL + pgvector</p>
              <p>认证: JWT + Refresh Token + bcrypt</p>
              <p>记忆调度: SM-2 + 艾宾浩斯遗忘曲线</p>
              <p>AI 服务: DeepSeek / 豆包语音 / Doubao Seedream</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
