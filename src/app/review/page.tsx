'use client';

import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ReviewTaskCard } from '@/components/review/ReviewTaskCard';
import { CognitiveLoadManager } from '@/components/review/CognitiveLoadManager';
import { REVIEW_MODE_CONFIG } from '@/types';
import type { ReviewMode } from '@/types';

type ReviewTask = ComponentProps<typeof ReviewTaskCard>['task'];

export default function ReviewPage() {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ReviewMode>('standard');
  const [completedCount, setCompletedCount] = useState(0);
  const [recentErrors, setRecentErrors] = useState(0);
  const [sessionStartTime] = useState(() => Date.now());

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/review?mode=${mode}`);
      const data = await res.json();
      setTasks(data.tasks || []);
      setCompletedCount((data.tasks || []).filter((task: ReviewTask) => task.completed).length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTasks();
    });
  }, [loadTasks]);

  const handleComplete = async (taskId: string, quality: number, knowledgeNodeId: string) => {
    try {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          quality,
          knowledgeNodeId,
          userId: 'default-user',
        }),
      });
      setCompletedCount(prev => prev + 1);
      if (quality < 3) setRecentErrors(prev => prev + 1);
      else setRecentErrors(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const allDone = tasks.length > 0 && completedCount >= tasks.length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">每日复习</h1>
          <p className="text-slate-500 mt-1.5 text-[15px]">
            基于掌握度智能调度 · {REVIEW_MODE_CONFIG[mode].label}
          </p>
        </div>
        <Button onClick={loadTasks} loading={loading} variant="secondary">
          刷新
        </Button>
      </div>

      {/* 认知负荷管理 */}
      <CognitiveLoadManager
        mode={mode}
        onModeChange={setMode}
        onBreak={() => alert('建议休息5分钟再继续！')}
        completedCount={completedCount}
        totalCount={tasks.length}
        sessionStartTime={sessionStartTime}
        recentErrors={recentErrors}
        averageMastery={tasks.reduce((sum, task) => sum + (task.knowledgeNode?.masteryLevel || 0), 0) / Math.max(1, tasks.length)}
      />

      {/* 模式选择 */}
      <div className="flex gap-2 mb-6">
        {(Object.entries(REVIEW_MODE_CONFIG) as [ReviewMode, (typeof REVIEW_MODE_CONFIG)[ReviewMode]][]).map(([key, config]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`relative px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              mode === key
                ? 'bg-white text-indigo-600 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)] border border-indigo-200/60'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60 border border-transparent'
            }`}
          >
            <span className="block">{config.label}</span>
            <span className="block text-[11px] opacity-60 mt-0.5">{config.description}</span>
          </button>
        ))}
      </div>

      {/* 进度条 */}
      {tasks.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm text-slate-600 font-medium">
              今日进度 · {completedCount}/{tasks.length}
            </span>
            <span className="text-xs text-slate-400">
              上限 {REVIEW_MODE_CONFIG[mode].maxPerSession} 个/次
            </span>
          </div>
          <div className="h-2 bg-slate-200/70 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {allDone && (
        <Card className="mb-6 !border-emerald-200/80 !bg-gradient-to-br from-emerald-50/50 to-green-50/50">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-lg shadow-emerald-500/25 mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-emerald-700">今日复习完成！</p>
            <p className="text-sm text-emerald-600/80 mt-1">
              共完成 {completedCount} 个知识点的复习
            </p>
            <Button
              className="mt-5"
              variant="secondary"
              onClick={() => {
                setCompletedCount(0);
                loadTasks();
              }}
            >
              继续复习更多
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <div className="text-center py-14">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
              📚
            </div>
            <p className="text-slate-500 font-medium">当前没有待复习的任务</p>
            <p className="text-sm text-slate-400 mt-1.5 mb-5">
              先去拆解教材内容，系统会自动安排复习计划
            </p>
            <Link href="/subjects">
              <Button>前往学科页面</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <ReviewTaskCard
              key={task.id}
              task={task}
              onComplete={handleComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
