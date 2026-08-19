'use client';

// ---------------------------------------------------------------------------
// Knowledge3DSection：卡片页内嵌的 3D 演示区
// 依据知识点标题/关键词/学科匹配场景（registry 轻量匹配，不打包 three.js），
// 选中后再动态加载场景实现。
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { loadScene, matchScenes, type SceneMeta } from '@/lib/lab3d/registry';
import type { Scene3DDefinition } from '@/lib/lab3d/types';
import ScenePlayer from './ScenePlayer';

export default function Knowledge3DSection({
  title,
  keywords,
  subjectName,
}: {
  title?: string | null;
  keywords?: string[] | string | null;
  subjectName?: string | null;
}) {
  const matches = useMemo(
    () => matchScenes({ title, keywords, subjectName }),
    [title, keywords, subjectName],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [def, setDef] = useState<Scene3DDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  // loadScene 失败（chunk 404/网络抖动）时返回 null——置位 failed
  // 渲染错误块 + 重试，否则永远停在"正在加载 3D 场景…"。
  const [failed, setFailed] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  const active: SceneMeta | undefined = matches.find((m) => m.id === activeId) ?? matches[0];

  useEffect(() => {
    if (!active) {
      queueMicrotask(() => setDef(null));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        // 切场景时必须清空旧 def：否则加载期间用新标题渲染旧场景
        setDef(null);
        setLoading(true);
        setFailed(false);
      }
    });
    loadScene(active.id)
      .then((d) => {
        if (cancelled) return;
        setDef(d);
        setLoading(false);
        if (!d) setFailed(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [active, reloadTick]);

  if (matches.length === 0) return null;

  return (
    <div className="space-y-3">
      {matches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActiveId(m.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active?.id === m.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {m.icon} {m.title}
            </button>
          ))}
        </div>
      )}
      {failed ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-600 sm:h-[420px]">
          <span>⚠️ 场景加载失败</span>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setReloadTick((t) => t + 1);
            }}
            className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-700"
          >
            重试
          </button>
        </div>
      ) : loading || !def ? (
        <div className="flex h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 sm:h-[420px]">
          🧊 正在加载 3D 场景…
        </div>
      ) : (
        <ScenePlayer def={def} />
      )}
    </div>
  );
}

/** 供卡片页判断是否需要渲染"3D 演示"标签页（不加载 three.js） */
export { matchScenes };
