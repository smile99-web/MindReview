'use client';

import { useState } from 'react';

type LearningStep = 'read' | 'practiced';

export interface LearningChecklistProps {
  readCompletedAt: Date | string | null;
  practicedCompletedAt: Date | string | null;
  onJumpToStep?: (step: LearningStep) => void;
  onResetProgress?: () => void;
}

interface StepItem {
  key: LearningStep;
  icon: string;
  label: string;
  hint: string;
  done: boolean;
}

function formatTime(value: Date | string | null): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * LearningChecklist — 知识点页顶部的"学习清单"。
 * 2 步基础完成度（阅读+练习）。全部完成显示🎉横幅。
 * 所有节点自由学习，没有任何锁定。
 */
export function LearningChecklist({
  readCompletedAt,
  practicedCompletedAt,
  onJumpToStep,
  onResetProgress,
}: LearningChecklistProps) {
  const [resetHintShown, setResetHintShown] = useState(false);

  const steps: StepItem[] = [
    {
      key: 'read',
      icon: '📖',
      label: '阅读知识卡',
      hint: '看完知识卡',
      done: !!readCompletedAt,
    },
    {
      key: 'practiced',
      icon: '✏️',
      label: '完成练习题',
      hint: '答对至少 1 道题',
      done: !!practicedCompletedAt,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  return (
    <div
      className={`mb-6 rounded-2xl border ${
        allDone
          ? 'border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-green-50/80'
          : 'border-slate-200/70 bg-white/80'
      } px-4 py-3 shadow-sm`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">学习清单</p>
          <p className="mt-0.5 text-sm text-slate-700">
            已完成 <span className="font-bold text-indigo-600">{completedCount}</span> / {steps.length} 步
            {allDone ? ' · 🎉 全部完成！' : ' · 全部完成即可点亮 ✅'}
          </p>
        </div>
        {onResetProgress && (
          <button
            type="button"
            onClick={() => {
              onResetProgress();
              setResetHintShown(true);
              window.setTimeout(() => setResetHintShown(false), 2200);
            }}
            className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            title="仅清空本地提示（已完成记录保留在数据库中，可继续学习不重置）"
          >
            ↻ {resetHintShown ? '记录已保留，继续加油！' : '继续/重复学习'}
          </button>
        )}
      </div>

      <ol className="mt-3 flex flex-wrap gap-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              step.done
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            <span className="text-base leading-none">{step.icon}</span>
            <span>{step.label}</span>
            {step.done ? (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] shrink-0">
                ✓
              </span>
            ) : onJumpToStep ? (
              <button
                type="button"
                onClick={() => onJumpToStep(step.key)}
                className="ml-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
              >
                开始 →
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      {allDone && (
        <p className="mt-3 text-xs text-emerald-600/80">
          太棒了！本节点已掌握。可以重复学习、进入 ICAP 4 阶段深度训练，或跳到下一个。
        </p>
      )}
      {(readCompletedAt || practicedCompletedAt) && !allDone && (
        <p className="mt-3 text-[11px] text-slate-400">
          已完成时间：
          {readCompletedAt && ` 阅读 ${formatTime(readCompletedAt)}`}
          {practicedCompletedAt && ` · 练习 ${formatTime(practicedCompletedAt)}`}
        </p>
      )}
    </div>
  );
}
