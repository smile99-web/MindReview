'use client';

// ---------------------------------------------------------------------------
// /lab3d/[sceneId] — 单场景播放页
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getSceneMeta, loadScene, SCENES } from '@/lib/lab3d/registry';
import type { Scene3DDefinition } from '@/lib/lab3d/types';
import ScenePlayer from '@/components/knowledge3d/ScenePlayer';

export default function Lab3DScenePage() {
  const params = useParams();
  const sceneId = typeof params.sceneId === 'string' ? params.sceneId : '';
  const meta = getSceneMeta(sceneId);
  const [def, setDef] = useState<Scene3DDefinition | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (meta) document.title = `${meta.title} - 3D 实验室 - 知图复习`;
  }, [meta]);

  useEffect(() => {
    if (!sceneId) return;
    let cancelled = false;
    loadScene(sceneId).then((d) => {
      if (cancelled) return;
      if (d) setDef(d);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  if (!meta) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <div className="mb-4 text-4xl">🧊</div>
        <p className="mb-6 text-slate-600">没有找到这个 3D 场景</p>
        <Link href="/lab3d" className="text-indigo-600 hover:underline">
          ← 返回 3D 实验室
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <Link href="/lab3d" className="mb-1 inline-block text-sm text-indigo-500 hover:underline">
            ← 3D 实验室
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            {meta.icon} {meta.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{meta.tagline}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600">
            {meta.subject}
          </span>
          {meta.grade && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
              {meta.grade}
            </span>
          )}
        </div>
      </div>

      {failed ? (
        <div className="flex h-[320px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-600">
          场景加载失败，请返回重试
        </div>
      ) : !def ? (
        <div className="flex h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 sm:h-[420px]">
          🧊 正在加载 3D 场景…
        </div>
      ) : (
        <ScenePlayer def={def} />
      )}

      {/* 同学科其他场景 */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">更多{meta.subject}演示</h2>
        <div className="flex flex-wrap gap-2">
          {SCENES.filter((s) => s.subject === meta.subject && s.id !== meta.id).map((s) => (
            <Link
              key={s.id}
              href={`/lab3d/${s.id}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
            >
              {s.icon} {s.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
