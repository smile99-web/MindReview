'use client';

import { useState, useEffect, useMemo } from 'react';
import { suggestMode, shouldTakeBreak } from '@/lib/cognitive-load';
import { useDensity } from '@/components/ui/DensityProvider';
import type { DensityLevel } from '@/lib/ui-density';
import type { ReviewMode } from '@/types';

interface CognitiveLoadManagerProps {
  mode: ReviewMode;
  onModeChange: (mode: ReviewMode) => void;
  onBreak: () => void;
  completedCount: number;
  totalCount: number;
  sessionStartTime?: number;
  recentErrors?: number;
  averageMastery?: number;
}

export function CognitiveLoadManager({
  mode,
  onModeChange,
  onBreak,
  completedCount,
  totalCount,
  sessionStartTime,
  recentErrors = 0,
  averageMastery = 50,
}: CognitiveLoadManagerProps) {
  const { setCognitiveLoad, densityLevel } = useDensity();
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [showBreakReminder, setShowBreakReminder] = useState(false);

  // Compute cognitive load from recent errors, average mastery, and session duration.
  const cognitiveLoad = useMemo(() => {
    const errorFactor = recentErrors >= 5 ? 5 : recentErrors >= 3 ? 4 : recentErrors >= 2 ? 3 : recentErrors >= 1 ? 2 : 1;
    const masteryFactor = averageMastery < 30 ? 2 : averageMastery < 50 ? 1 : 0;
    const sessionFactor = sessionMinutes >= 45 ? 1 : sessionMinutes >= 30 ? 0.5 : 0;
    return Math.min(5, Math.max(1, Math.round(errorFactor + masteryFactor * 0.5 + sessionFactor * 0.5)));
  }, [recentErrors, averageMastery, sessionMinutes]);

  // Sync cognitive load to the density context.
  useEffect(() => {
    setCognitiveLoad(cognitiveLoad);
  }, [cognitiveLoad, setCognitiveLoad]);

  useEffect(() => {
    if (!sessionStartTime) return;
    const timer = setInterval(() => {
      const minutes = Math.floor((Date.now() - sessionStartTime) / 60000);
      setSessionMinutes(minutes);
      if (shouldTakeBreak(minutes, recentErrors)) {
        setShowBreakReminder(true);
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [sessionStartTime, recentErrors]);

  const suggestedMode = suggestMode(recentErrors, averageMastery);

  const densityLabel: Record<DensityLevel, string> = {
    sparse: '精简',
    comfortable: '舒适',
    compact: '紧凑',
  };

  const densityColor: Record<DensityLevel, string> = {
    sparse: 'text-amber-600 bg-amber-50 border-amber-200',
    comfortable: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    compact: 'text-blue-600 bg-blue-50 border-blue-200',
  };

  const modeOptions: Array<{ key: ReviewMode; label: string }> = [
    { key: 'basic', label: '基础' },
    { key: 'standard', label: '标准' },
    { key: 'challenge', label: '挑战' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Session timer */}
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {sessionMinutes}分钟
          </div>

          {/* Density indicator */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${densityColor[densityLevel]}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              {densityLevel === 'sparse' && (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
              {densityLevel === 'comfortable' && (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h8.25M3.75 12h12M3.75 17.25h7.5" />
              )}
              {densityLevel === 'compact' && (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h4.5M3.75 9.75h10.5M3.75 12.75h16.5M3.75 15.75h10.5M3.75 18.75h4.5" />
              )}
            </svg>
            {densityLabel[densityLevel]}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            {completedCount}/{totalCount}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode selector */}
          <div className="flex rounded-xl bg-slate-100 p-0.5">
            {modeOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => onModeChange(opt.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  mode === opt.key
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt.label}
                {opt.key === suggestedMode && mode !== opt.key && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1 align-middle" />
                )}
              </button>
            ))}
          </div>

          {/* Break reminder */}
          {showBreakReminder && (
            <button
              onClick={() => { setShowBreakReminder(false); onBreak(); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
            >
              休息一下
            </button>
          )}
        </div>
      </div>

      {suggestedMode !== mode && (
        <div className="mt-2.5 text-xs text-amber-600 bg-amber-50/80 rounded-lg px-3 py-1.5 border border-amber-100/60">
          建议切换至{modeOptions.find(o => o.key === suggestedMode)?.label}模式 — {
            recentErrors >= 3 ? '连续错误较多' : averageMastery < 30 ? '掌握度偏低' : '适合当前状态'
          }
        </div>
      )}
    </div>
  );
}
