"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { authFetch } from "@/lib/auth";

type ServiceName = "llm" | "tts" | "image" | "embedding" | "vision";

interface KeyState {
  saved: boolean;
  testing: boolean;
  result: { ok: boolean; error?: string; message?: string; latencyMs?: number } | null;
  maskedKey: string;
  key: string;
  baseUrl: string;
  model: string;
  cluster: string;    // TTS Resource ID
  voiceType: string;  // TTS only
}

interface SavedKey {
  service: string;
  key: string; // masked
  baseUrl: string | null;
  model: string | null;
  isActive: boolean;
  testOk: boolean;
  lastTest: string | null;
}

const DEFAULT_KEYS: Record<ServiceName, KeyState> = {
  llm: {
    saved: false, testing: false, result: null,
    maskedKey: "", key: "", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash",
    cluster: "", voiceType: "",
  },
  tts: {
    saved: false, testing: false, result: null,
    maskedKey: "", key: "", baseUrl: "", model: "",
    cluster: "seed-tts-2.0", voiceType: "zh_female_vv_uranus_bigtts",
  },
  image: {
    saved: false, testing: false, result: null,
    maskedKey: "", key: "", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seedream-5-0-260128",
    cluster: "", voiceType: "",
  },
  embedding: {
    saved: false, testing: false, result: null,
    maskedKey: "", key: "", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-embedding-vision-250615",
    cluster: "", voiceType: "",
  },
  // 视觉模型 — 拍照讲题 OCR 用。默认 MiniMax-M3（多模态）。
  // User 自己在 baseUrl/model 字段填入实际 MiniMax API 端点和模型名。
  vision: {
    saved: false, testing: false, result: null,
    maskedKey: "", key: "", baseUrl: "https://api.minimaxi.com/v1", model: "MiniMax-M3",
    cluster: "", voiceType: "",
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
    fields: ["key", "cluster", "voiceType"],
  },
  image: {
    title: "Doubao Seedream",
    icon: "🎨",
    desc: "知识点配图生成",
    docUrl: "https://www.volcengine.com/docs/82379/1537010",
    docLabel: "火山方舟图片生成文档",
    fields: ["key", "baseUrl", "model"],
  },
  embedding: {
    title: "Doubao Embedding",
    icon: "🧠",
    desc: "知识点语义向量搜索",
    docUrl: "https://www.volcengine.com/docs/82379/1537010",
    docLabel: "火山方舟 Embedding 文档",
    fields: ["key", "baseUrl", "model"],
  },
  vision: {
    title: "视觉模型 (MiniMax M3)",
    icon: "👁️",
    desc: "拍照讲题 OCR 识别题目文字与学科。默认 MiniMax-M3 多模态模型，请在下方填写你的 API Key。",
    docUrl: "https://platform.MiniMax.io",
    docLabel: "MiniMax 平台文档",
    fields: ["key", "baseUrl", "model"],
  },
};

// ===== 火山方舟 Agent Plan（统一调用）=====
// 默认值与 src/lib/ark.ts 的 ARK_DEFAULT_MODELS 同步维护
// （该模块 import 了 prisma，客户端不能直接引用，故此处复制常量）
const ARK_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";
// Agent Plan 套餐内用模型别名（非带日期的 Model ID）；tts 字段是 Resource ID
const ARK_DEFAULT_MODELS = {
  llm: "doubao-seed-2.1-turbo",
  vision: "doubao-seed-2.1-turbo",
  image: "doubao-seedream-5.0-lite",
  embedding: "doubao-embedding-vision",
  tts: "seed-tts-2.0",
  voice: "zh_female_vv_uranus_bigtts",
};

interface ArkState {
  enabled: boolean;
  key: string;
  saved: boolean;
  maskedKey: string;
  baseUrl: string;
  models: typeof ARK_DEFAULT_MODELS;
  testing: boolean;
  saving: boolean;
  result: { ok: boolean; error?: string; message?: string; latencyMs?: number } | null;
  showAdvanced: boolean;
}

const ARK_MODEL_FIELDS: { field: keyof typeof ARK_DEFAULT_MODELS; label: string }[] = [
  { field: "llm", label: "LLM 文本模型" },
  { field: "vision", label: "视觉模型（拍照讲题）" },
  { field: "image", label: "图片生成模型" },
  { field: "embedding", label: "Embedding 向量模型" },
  { field: "tts", label: "TTS Resource ID" },
];

// 音色选项与下方 TTS 卡片共用（方舟 TTS 用同一套音色 ID）
const VOICE_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: "精品音色 (2.0)",
    options: [
      { value: "zh_female_vv_uranus_bigtts", label: "豆包通用女声" },
      { value: "BV701_streaming", label: "擎苍 (男声·推荐)" },
      { value: "BV700_streaming", label: "灿灿 (男声)" },
      { value: "BV001_streaming", label: "通用女声" },
      { value: "BV002_streaming", label: "通用男声" },
      { value: "BV400_streaming", label: "小悦 (女声)" },
      { value: "BV401_streaming", label: "小悦 2.0 (女声)" },
      { value: "BV003_streaming", label: "小辉 (男声)" },
      { value: "BV104_streaming", label: "温柔淑女" },
      { value: "BV102_streaming", label: "儒雅青年" },
      { value: "BV100_streaming", label: "质朴青年" },
      { value: "BV004_streaming", label: "开朗青年" },
      { value: "BV123_streaming", label: "阳光青年" },
      { value: "BV107_streaming", label: "霸气青叔" },
      { value: "BV115_streaming", label: "古风少御" },
      { value: "BV113_streaming", label: "甜宠少御" },
      { value: "BV120_streaming", label: "反卷青年" },
      { value: "BV119_streaming", label: "通用赘婿" },
    ],
  },
  {
    label: "经典音色 (1.0)",
    options: [
      { value: "zh_female_qingxin", label: "清新女声" },
      { value: "zh_male_qingxin", label: "清新男声" },
      { value: "zh_female_tianmei", label: "甜美女生" },
    ],
  },
];

function VoiceGroupOptions() {
  return (
    <>
      {VOICE_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<Record<ServiceName, KeyState>>(DEFAULT_KEYS);
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ark, setArk] = useState<ArkState>({
    enabled: false,
    key: "",
    saved: false,
    maskedKey: "",
    baseUrl: ARK_DEFAULT_BASE_URL,
    models: { ...ARK_DEFAULT_MODELS },
    testing: false,
    saving: false,
    result: null,
    showAdvanced: false,
  });

  const applySavedKeys = useCallback((data: SavedKey[]) => {
    // 方舟统一调用行：model 列是 JSON 字符串，解析失败回退默认模型
    const arkRow = data.find((s) => s.service === "ark");
    if (arkRow) {
      let models = { ...ARK_DEFAULT_MODELS };
      try {
        if (arkRow.model) models = { ...models, ...JSON.parse(arkRow.model) };
      } catch { /* 容忍非 JSON 旧数据 */ }
      setArk((prev) => ({
        ...prev,
        enabled: arkRow.isActive,
        saved: true,
        maskedKey: arkRow.key || "",
        baseUrl: arkRow.baseUrl || ARK_DEFAULT_BASE_URL,
        models,
      }));
    }
    setSavedKeys(data.filter((s) => s.service !== "ark"));
    setKeys((prev) => {
      const next = { ...prev };
      for (const saved of data) {
        // 过滤条件必须覆盖全部服务卡片（含 vision），否则保存后刷新不回填
        if (saved.service !== "llm" && saved.service !== "tts" && saved.service !== "image" && saved.service !== "embedding" && saved.service !== "vision") continue;
        const svc = saved.service;
        next[svc] = {
          ...next[svc],
          saved: true,
          maskedKey: saved.key,
          baseUrl: svc === "tts" ? next[svc].baseUrl : saved.baseUrl || next[svc].baseUrl,
          model: svc === "tts" ? next[svc].model : saved.model || next[svc].model,
          cluster: svc === "tts" ? saved.baseUrl || next[svc].cluster : next[svc].cluster,
          voiceType: svc === "tts" ? saved.model || next[svc].voiceType : next[svc].voiceType,
        };
      }
      return next;
    });
  }, []);

  useEffect(() => { document.title = '设置 - 知图复习'; }, []);

  // 加载已保存的 keys
  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const res = await authFetch("/api/settings");
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(res.status === 401 ? "登录已过期，请重新登录" : data?.error || "加载设置失败");
        }
        if (!Array.isArray(data)) {
          throw new Error("设置数据格式异常");
        }
        if (!cancelled) {
          setLoadError(null);
          applySavedKeys(data);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "加载设置失败";
        if (!cancelled) setLoadError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [applySavedKeys]);

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
      const res = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: svc,
          key: k.key,
          baseUrl: svc === "tts" ? k.cluster || undefined : k.baseUrl || undefined,
          model: svc === "tts" ? k.voiceType || undefined : k.model || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(res.status === 401 ? "登录已过期，请重新登录后再保存" : data?.error || "保存失败");
      }

      setKeys((prev) => ({
        ...prev,
        [svc]: {
          ...prev[svc],
          key: "",
          saved: true,
          maskedKey: typeof data?.masked === "string" ? data.masked : prev[svc].maskedKey,
          result: { ok: true, message: "保存成功" },
        },
      }));
      // Refresh saved list
      const refreshRes = await authFetch("/api/settings");
      const saved = await refreshRes.json().catch(() => null);
      if (Array.isArray(saved)) applySavedKeys(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      setKeys((prev) => ({
        ...prev,
        [svc]: { ...prev[svc], result: { ok: false, error: message } },
      }));
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
      embedding: "/api/settings/test-embedding",
      vision: "/api/settings/test-vision",
    };

    try {
      const body: Record<string, string> = { key: k.key };
      if (k.baseUrl) body.baseUrl = k.baseUrl;
      if (k.model) body.model = k.model;
      if (svc === "tts") {
        if (k.cluster) body.cluster = k.cluster;
        if (k.cluster) body.resourceId = k.cluster;
        if (k.voiceType) body.voiceType = k.voiceType;
      }

      const res = await authFetch(testEndpoints[svc], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      setKeys((prev) => ({
        ...prev,
        // 只有测试成功才标记 saved：失败也标 saved 会让 UI 显示"已保存"的假状态
        [svc]: { ...prev[svc], testing: false, result: data, saved: data?.ok === true ? true : prev[svc].saved },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setKeys((prev) => ({
        ...prev,
        [svc]: { ...prev[svc], testing: false, result: { ok: false, error: message } },
      }));
    }
  };

  // ===== 方舟统一调用：保存 / 开关 / 测试 =====
  // 返回是否成功：toggleArk 乐观更新后需要依据成败决定是否回滚
  const saveArk = async (enabledOverride?: boolean): Promise<boolean> => {
    setArk((prev) => ({ ...prev, saving: true, result: null }));
    try {
      const res = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: "ark",
          key: ark.key, // 留空时服务端保留已保存的 key
          baseUrl: ark.baseUrl || undefined,
          model: JSON.stringify(ark.models),
          isActive: enabledOverride ?? ark.enabled,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(res.status === 401 ? "登录已过期，请重新登录后再保存" : data?.error || "保存失败");
      }
      setArk((prev) => ({
        ...prev,
        key: "",
        saved: true,
        enabled: enabledOverride ?? prev.enabled,
        maskedKey: typeof data?.masked === "string" ? data.masked : prev.maskedKey,
        result: { ok: true, message: "保存成功" },
      }));
      const refreshRes = await authFetch("/api/settings");
      const saved = await refreshRes.json().catch(() => null);
      if (Array.isArray(saved)) applySavedKeys(saved);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      setArk((prev) => ({ ...prev, result: { ok: false, error: message } }));
      return false;
    } finally {
      setArk((prev) => ({ ...prev, saving: false }));
    }
  };

  const toggleArk = async () => {
    const next = !ark.enabled;
    // 开启前必须有已保存的 key，否则开了也调不通
    if (next && !ark.saved) {
      setArk((prev) => ({ ...prev, result: { ok: false, error: "请先填写并保存方舟 API Key，再开启统一调用" } }));
      return;
    }
    setArk((prev) => ({ ...prev, enabled: next }));
    if (ark.saved) {
      const ok = await saveArk(next);
      // 乐观更新失败必须回滚：否则 UI 显示"已开启"而服务端仍是关闭，
      // 用户以为切换成功，刷新后状态"神秘"变回
      if (!ok) {
        setArk((prev) => ({ ...prev, enabled: !next }));
      }
    }
  };

  const testArk = async () => {
    setArk((prev) => ({ ...prev, testing: true, result: null }));
    try {
      const res = await authFetch("/api/settings/test-ark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: ark.key,
          baseUrl: ark.baseUrl || undefined,
          model: ark.models.llm,
        }),
      });
      const data = await res.json();
      setArk((prev) => ({
        ...prev,
        testing: false,
        result: data,
        saved: data?.ok === true ? true : prev.saved,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setArk((prev) => ({ ...prev, testing: false, result: { ok: false, error: message } }));
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mb-2">设置</h1>
      <p className="text-slate-500 text-[15px] mb-8">配置 AI 服务 API Key，每个服务可单独测试连接</p>
      {loadError && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 火山方舟 Agent Plan：统一调用（一个 Key 调全部模型） */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌋</span>
                <div>
                  <h3 className="font-semibold text-slate-800 text-[15px]">火山方舟 Agent Plan（统一调用）</h3>
                  <p className="text-xs text-slate-400">一个 Key 调用 LLM / 视觉 / 图片 / 向量 / 语音全部模型</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {ark.enabled && <Badge variant="success">已开启</Badge>}
                <a
                  href="https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                >
                  领取 Agent Plan Key ↗
                </a>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-700">
              API Key 需在方舟控制台「Agent Plan 开通管理」页领取（与普通方舟 Key 不通用）。
              注意：官方将 Agent Plan 的文本/向量模型定位为 AI 编程工具使用，直接 API 调用存在套餐停用风险；图片/语音模型官方支持直接 API 调用。
            </div>

            {/* 总开关 */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/80 mb-4">
              <div className="text-sm">
                <div className="font-medium text-slate-700">启用方舟统一调用</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  开启后所有 AI 功能走方舟；下方各服务独立配置保留为备选（关闭后自动回退）
                </div>
              </div>
              <button
                type="button"
                onClick={toggleArk}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${
                  ark.enabled ? "bg-indigo-500" : "bg-slate-300"
                }`}
                aria-pressed={ark.enabled}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${
                    ark.enabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {/* API Key */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  方舟 API Key {!ark.saved && <span className="text-red-400">*</span>}
                  {ark.saved && <span className="text-emerald-500 ml-1">已保存 ✓</span>}
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={ark.key}
                    onChange={(e) => setArk((prev) => ({ ...prev, key: e.target.value, result: null }))}
                    placeholder={ark.saved ? "已保存，可直接测试 · 输入新 Key 可更新" : "输入方舟 API Key..."}
                    className="flex-1 rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-400 font-mono"
                  />
                  <Button size="sm" variant="secondary" onClick={() => saveArk()} loading={ark.saving} disabled={!ark.key && !ark.saved}>
                    保存
                  </Button>
                </div>
                {ark.saved && ark.maskedKey && (
                  <p className="mt-1 text-xs text-slate-400 font-mono">当前已保存：{ark.maskedKey}</p>
                )}
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Base URL</label>
                <input
                  type="text"
                  value={ark.baseUrl}
                  onChange={(e) => setArk((prev) => ({ ...prev, baseUrl: e.target.value, result: null }))}
                  placeholder={ARK_DEFAULT_BASE_URL}
                  className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors font-mono placeholder:text-slate-300"
                />
              </div>

              {/* 高级：各任务模型 ID 覆盖 */}
              <button
                type="button"
                onClick={() => setArk((prev) => ({ ...prev, showAdvanced: !prev.showAdvanced }))}
                className="text-xs text-slate-400 hover:text-indigo-500 transition-colors"
              >
                {ark.showAdvanced ? "▾ 收起模型配置" : "▸ 模型 ID 高级配置（默认值已适配 Agent Plan）"}
              </button>

              {ark.showAdvanced && (
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-slate-200/60">
                  {ARK_MODEL_FIELDS.map(({ field, label }) => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                      <input
                        type="text"
                        value={ark.models[field]}
                        onChange={(e) =>
                          setArk((prev) => ({
                            ...prev,
                            models: { ...prev.models, [field]: e.target.value },
                            result: null,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors font-mono placeholder:text-slate-300"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">TTS 音色</label>
                    <select
                      value={ark.models.voice}
                      onChange={(e) =>
                        setArk((prev) => ({
                          ...prev,
                          models: { ...prev.models, voice: e.target.value },
                          result: null,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
                    >
                      <VoiceGroupOptions />
                    </select>
                  </div>
                  <p className="col-span-2 text-[11px] text-slate-400">
                    修改模型后点「保存」生效；模型 ID 以方舟控制台「模型广场/开通管理」中你的订阅可用 ID 为准
                  </p>
                </div>
              )}
            </div>

            {/* 测试按钮 + 结果 */}
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={testArk} loading={ark.testing} disabled={!ark.key && !ark.saved}>
                测试连接
              </Button>
              {ark.result && (
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                    ark.result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}
                >
                  <span>{ark.result.ok ? "✓" : "✗"}</span>
                  <span>
                    {ark.result.ok
                      ? ark.result.message || `连接成功${ark.result.latencyMs ? ` (${ark.result.latencyMs}ms)` : ""}`
                      : ark.result.error || "连接失败"}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* 备选方案说明 */}
          <p className="text-xs text-slate-400 px-1">
            以下为各服务独立配置（备选方案）：未开启方舟统一调用时生效
          </p>
          {(Object.entries(SERVICE_INFO) as [ServiceName, typeof SERVICE_INFO["llm"]][]).map(([svc, info]) => {
            const k = keys[svc];
            const saved = savedKeys.find((s) => s.service === svc);
            const hasSavedKey = Boolean(saved || k.saved);

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
                      API Key {!hasSavedKey && <span className="text-red-400">*</span>}
                      {hasSavedKey && <span className="text-emerald-500 ml-1">已保存 ✓</span>}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={k.key}
                        onChange={(e) => updateField(svc, "key", e.target.value)}
                        placeholder={hasSavedKey ? "已保存，可直接测试 · 输入新 Key 可更新" : "输入 API Key..."}
                        className="flex-1 rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-400 font-mono"
                      />
                      <Button size="sm" variant="secondary" onClick={() => saveKey(svc)} disabled={!k.key}>
                        保存
                      </Button>
                    </div>
                    {hasSavedKey && k.maskedKey && (
                      <p className="mt-1 text-xs text-slate-400 font-mono">
                        当前已保存：{k.maskedKey}
                      </p>
                    )}
                  </div>

                  {/* TTS 专用字段 */}
                  {svc === "tts" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Resource ID</label>
                        <input
                          type="text"
                          value={k.cluster}
                          onChange={(e) => updateField(svc, "cluster", e.target.value)}
                          placeholder="seed-tts-2.0"
                          className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors font-mono placeholder:text-slate-300"
                        />
                        <p className="mt-1 text-[11px] text-slate-400">
                          不需要填写 OpenSpeech 接口 URL
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">音色</label>
                        <select
                          value={k.voiceType}
                          onChange={(e) => updateField(svc, "voiceType", e.target.value)}
                          className="w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
                        >
                          <VoiceGroupOptions />
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Base URL + Model fields for services that need them */}
                  {(svc === "llm" || svc === "image" || svc === "embedding" || svc === "vision") && (
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
                    disabled={!k.key && !hasSavedKey}
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
                          ? k.result.message || `连接成功${k.result.latencyMs ? ` (${k.result.latencyMs}ms)` : ""}`
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
