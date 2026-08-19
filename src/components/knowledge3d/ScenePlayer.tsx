'use client';

// ---------------------------------------------------------------------------
// ScenePlayer：3D 场景播放器
// 组合 ThreeStage + 讲解步骤条 + 场景自定义控件 + TTS 朗读（可连播）。
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import ThreeStage from './ThreeStage';
import { authFetch } from '@/lib/auth';
import type { Scene3DDefinition, SceneHandle } from '@/lib/lab3d/types';

export default function ScenePlayer({ def }: { def: Scene3DDefinition }) {
  const [step, setStep] = useState(0);
  const handleRef = useRef<SceneHandle | null>(null);
  const [controlValues, setControlValues] = useState<Record<string, number | string>>({});
  const [autoPlay, setAutoPlay] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seqRef = useRef(0);
  const autoRef = useRef(false);
  const prevAutoRef = useRef(false);
  useEffect(() => {
    autoRef.current = autoPlay;
  }, [autoPlay]);

  const stopAudio = useCallback(() => {
    seqRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  // 舞台就绪：初始化步骤与控件默认值
  const onHandle = useCallback(
    (h: SceneHandle | null) => {
      handleRef.current = h;
      if (h) {
        h.setStep(0);
        def.controls?.forEach((c) => {
          if (c.kind === 'select') h.setParam?.(c.id, c.defaultValue);
          if (c.kind === 'slider') h.setParam?.(c.id, c.defaultValue);
        });
      }
    },
    [def],
  );

  // 切换场景：复位
  useEffect(() => {
    queueMicrotask(() => {
      setAutoPlay(false);
      stopAudio();
      setStep(0);
      setControlValues({});
    });
  }, [def, stopAudio]);

  // 步骤同步到场景
  useEffect(() => {
    handleRef.current?.setStep(step);
  }, [step, def]);

  // 卸载清理
  useEffect(() => {
    return () => {
      seqRef.current += 1;
      audioRef.current?.pause();
    };
  }, []);

  const speak = useCallback(
    async (idx: number) => {
      const mySeq = ++seqRef.current;
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeaking(true);
      try {
        const res = await authFetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: def.steps[idx].text,
            contentType: 'lab3d',
            contentRefId: `${def.id}#${idx}`,
          }),
        });
        if (!res.ok) throw new Error('tts failed');
        const data = (await res.json()) as { audioUrl?: string };
        if (mySeq !== seqRef.current) return;
        if (!data.audioUrl) {
          setSpeaking(false);
          return;
        }
        const audio = new Audio(data.audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          if (mySeq !== seqRef.current) return;
          setSpeaking(false);
          if (autoRef.current && idx < def.steps.length - 1) setStep(idx + 1);
        };
        audio.onerror = () => {
          if (mySeq === seqRef.current) setSpeaking(false);
        };
        await audio.play().catch(() => {
          if (mySeq === seqRef.current) setSpeaking(false);
        });
      } catch {
        if (mySeq === seqRef.current) setSpeaking(false);
      }
    },
    [def],
  );

  // 自动连播：开启时朗读当前步骤，播完自动进下一步；关闭时停止
  useEffect(() => {
    if (autoPlay) {
      // 异步调度，避免在 effect 体内同步 setState
      const t = window.setTimeout(() => void speak(step), 0);
      prevAutoRef.current = autoPlay;
      return () => window.clearTimeout(t);
    }
    if (prevAutoRef.current) {
      stopAudio();
    }
    prevAutoRef.current = autoPlay;
  }, [step, autoPlay, speak, stopAudio]);

  const onPlayButton = () => {
    if (speaking) {
      setAutoPlay(false);
      stopAudio();
      return;
    }
    if (autoPlay) {
      // 先关连播（副作用会 stopAudio），稍后再单读当前步
      setAutoPlay(false);
      window.setTimeout(() => void speak(step), 60);
    } else {
      void speak(step);
    }
  };

  const applyParam = (id: string, value: number | string) => {
    setControlValues((v) => ({ ...v, [id]: value }));
    handleRef.current?.setParam?.(id, value);
  };

  // 📊 实时读数：场景暴露 getReadouts 时轮询显示推导量（电流/力矩/顶点…）。
  // 值不变时不触发重渲染（学生拖滑块时每 0.4s 刷新一次足够流畅）。
  const [readouts, setReadouts] = useState<{ label: string; value: string }[]>([]);
  useEffect(() => {
    const t = window.setInterval(() => {
      const h = handleRef.current;
      if (!h?.getReadouts) {
        setReadouts((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      const next = h.getReadouts();
      setReadouts((prev) => {
        if (
          prev.length === next.length &&
          prev.every((p, i) => p.label === next[i].label && p.value === next[i].value)
        ) {
          return prev;
        }
        return next;
      });
    }, 400);
    return () => window.clearInterval(t);
  }, [def]);

  const current = def.steps[step] ?? def.steps[0];
  // def.steps 为空（异常场景定义）时 current 为 undefined，current.text 会崩
  const currentText = current?.text ?? '';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* 3D 舞台 */}
      <div className="h-[320px] w-full bg-slate-100 sm:h-[420px]">
        <ThreeStage def={def} onHandle={onHandle} />
      </div>

      {/* 场景自定义控件 */}
      {def.controls && def.controls.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5">
          {def.controls.map((c) => {
            if (c.kind === 'select') {
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="font-medium">{c.label}</span>
                  <select
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                    value={String(controlValues[c.id] ?? c.defaultValue)}
                    onChange={(e) => applyParam(c.id, e.target.value)}
                  >
                    {c.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            if (c.kind === 'slider') {
              const val = Number(controlValues[c.id] ?? c.defaultValue);
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="font-medium whitespace-nowrap">{c.label}</span>
                  <input
                    type="range"
                    min={c.min}
                    max={c.max}
                    step={c.step}
                    value={val}
                    onChange={(e) => applyParam(c.id, Number(e.target.value))}
                    className="w-28 accent-indigo-600 sm:w-36"
                  />
                  <span className="w-14 text-xs text-slate-500 tabular-nums">
                    {val}
                    {c.unit ?? ''}
                  </span>
                </label>
              );
            }
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => applyParam(c.id, Number(controlValues[c.id] ?? 0) + 1)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 active:scale-95"
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 📊 实时读数（场景提供 getReadouts 时显示） */}
      {readouts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 bg-cyan-50/70 px-4 py-2">
          <span className="text-xs font-semibold text-cyan-700">📊 实时读数</span>
          {readouts.map((r) => (
            <span key={r.label} className="text-xs text-slate-600">
              {r.label}{' '}
              <b className="font-semibold tabular-nums text-cyan-900">{r.value}</b>
            </span>
          ))}
        </div>
      )}

      {/* 讲解步骤 */}
      <div className="border-t border-slate-100 px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {def.steps.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  i === step
                    ? 'bg-indigo-600 text-white'
                    : i < step
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {i + 1}·{s.title}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              aria-label="上一步"
            >
              ◀
            </button>
            <button
              type="button"
              disabled={step === def.steps.length - 1}
              onClick={() => setStep((s) => Math.min(def.steps.length - 1, s + 1))}
              className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-30"
              aria-label="下一步"
            >
              ▶
            </button>
          </div>
        </div>
        <p className="min-h-12 text-sm leading-relaxed text-slate-700">{currentText}</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onPlayButton}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              speaking
                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {speaking ? '⏹ 停止朗读' : '🔊 朗读本步'}
          </button>
          <button
            type="button"
            onClick={() => setAutoPlay((v) => !v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              autoPlay
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {autoPlay ? '⏸ 停止连播' : '▶ 语音连播全部'}
          </button>
          <span className="ml-auto text-xs text-slate-400">
            {def.icon} {def.subject} · 拖动旋转 / 滚轮缩放
          </span>
        </div>
      </div>
    </div>
  );
}
