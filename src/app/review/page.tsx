'use client';

import { useCallback, useEffect, useState, useMemo, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ReviewTaskCard } from '@/components/review/ReviewTaskCard';
import { CognitiveLoadManager } from '@/components/review/CognitiveLoadManager';
import { DensityProvider, useDensity } from '@/components/ui/DensityProvider';
import { REVIEW_MODE_CONFIG } from '@/types';
import type { ReviewMode } from '@/types';
import { useAuth, useUserId } from '@/components/auth/AuthProvider';
import type { ActionableStep } from '@/lib/learner-model';

type ReviewTask = ComponentProps<typeof ReviewTaskCard>['task'];

export default function ReviewPage() {
  return (
    <DensityProvider>
      <ReviewContent />
    </DensityProvider>
  );
}

function ReviewContent() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = useUserId() || '';
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ReviewMode>('standard');
  const [completedCount, setCompletedCount] = useState(0);
  const [recentErrors, setRecentErrors] = useState(0);
  const [sessionStartTime] = useState(() => Date.now());
  const [tutorTaskId, setTutorTaskId] = useState<string | null>(null);
  const [tutorMessage, setTutorMessage] = useState('');
  const [tutorReply, setTutorReply] = useState('');
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorHistory, setTutorHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [tutorSessionId, setTutorSessionId] = useState<string | null>(null);
  const [profileApplied, setProfileApplied] = useState(false);
  const [recommendedMode, setRecommendedMode] = useState<string | null>(null);
  const [reviewActionableSteps, setReviewActionableSteps] = useState<ActionableStep[]>([]);
  const [showBreakPrompt, setShowBreakPrompt] = useState(false);

  const { densityLevel, infoChunkSize } = useDensity();

  // Paginate tasks in non-compact modes.
  const [visibleCount, setVisibleCount] = useState(infoChunkSize);

  const visibleTasks = useMemo(() => {
    if (densityLevel === 'compact') return tasks;
    return tasks.slice(0, visibleCount);
  }, [tasks, densityLevel, visibleCount]);

  const hasMoreTasks = visibleTasks.length < tasks.length;

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

  useEffect(() => { document.title = '每日复习 - 知图复习'; }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // Fetch learner profile and apply recommended settings
  useEffect(() => {
    async function applyProfile() {
      if (profileApplied) return;
      try {
        const res = await fetch(`/api/learner/profile?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return;
        const data = await res.json();
        const recs = data.recommendations;
        const steps: ActionableStep[] = (data.actionableSteps as ActionableStep[]) || [];

        // Capture review-related actionable steps for the banner
        const reviewSteps = steps.filter(
          (s) => s.type === 'review_weakness' || s.type === 'fix_mistakes',
        );
        setReviewActionableSteps(reviewSteps);

        // Map suggested mode to valid ReviewMode
        const modeMap: Record<string, ReviewMode> = {
          challenge: 'challenge',
          standard: 'standard',
          basic: 'basic',
        };
        if (recs) {
          const suggested = modeMap[recs.suggestedMode];
          if (suggested) {
            setMode(suggested);
            setRecommendedMode(suggested === 'challenge' ? '挑战模式' : suggested === 'standard' ? '标准模式' : '基础模式');
          }
        }
        setProfileApplied(true);
      } catch {
        // Silently fail — profile is optional
      }
    }
    applyProfile();
  }, [userId, profileApplied]);

  const handleComplete = async (taskId: string, quality: number, knowledgeNodeId: string) => {
    try {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          quality,
          knowledgeNodeId,
          userId,
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

  const handleTutorSend = async () => {
    if (!tutorMessage.trim() || !tutorTaskId) return;
    setTutorLoading(true);
    const task = tasks.find(t => t.id === tutorTaskId);
    const newHistory = [...tutorHistory, { role: 'user', content: tutorMessage.trim() }];
    setTutorHistory(newHistory);
    setTutorMessage('');
    try {
      const res = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: tutorSessionId,
          knowledgeNodeId: task?.knowledgeNodeId || '',
          message: tutorMessage.trim(),
          userId,
          history: tutorHistory,
        }),
      });
      const data = await res.json();
      setTutorReply(data.reply || data.error || '没有回复');
      setTutorHistory([...newHistory, { role: 'assistant', content: data.reply || '' }]);
    } catch {
      setTutorReply('请求失败，请重试');
    } finally {
      setTutorLoading(false);
    }
  };

  const densityBanner = useMemo(() => {
    if (densityLevel === 'sparse') {
      return { text: '精简模式：检测到学习负担较重，已减少同时显示的任务数量', className: 'text-amber-700 bg-amber-50/80 border-amber-100' };
    }
    if (densityLevel === 'compact') {
      return { text: '紧凑模式：你掌握得很好，显示所有任务', className: 'text-blue-700 bg-blue-50/80 border-blue-100' };
    }
    return null;
  }, [densityLevel]);

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

      {/* Cognitive load manager — updates density context internally */}
      <CognitiveLoadManager
        mode={mode}
        onModeChange={setMode}
        onBreak={() => setShowBreakPrompt(true)}
        completedCount={completedCount}
        totalCount={tasks.length}
        sessionStartTime={sessionStartTime}
        recentErrors={recentErrors}
        averageMastery={tasks.reduce((sum, task) => sum + (task.knowledgeNode?.masteryLevel || 0), 0) / Math.max(1, tasks.length)}
      />

      {/* Mode selector */}
      <div className="flex gap-2 mb-2">
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

      {/* Profile-based optimization indicator */}
      {recommendedMode && (
        <div className="flex items-center gap-1.5 mb-6 text-[12px] text-indigo-500/80">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
          基于你的学习画像，已自动选择<span className="font-medium">{recommendedMode}</span>
        </div>
      )}

      {/* Review recommendation banner from learner profile */}
      {reviewActionableSteps.length > 0 && (
        <div className="mb-6 text-[13px] text-amber-700 bg-amber-50/70 border border-amber-200/60 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <div className="flex-1 min-w-0">
              <span className="font-medium">基于你的学习画像：</span>
              建议优先复习
              {reviewActionableSteps.slice(0, 2).map((step, i) => (
                <span key={step.id}>
                  {i > 0 && '、'}
                  <button
                    onClick={() => router.push(step.targetUrl)}
                    className="font-medium text-amber-600 underline underline-offset-2 hover:text-amber-700 transition-colors"
                  >
                    {step.title.replace(/^复习 "/, '').replace(/"$/, '').replace(/^纠错 "/, '').replace(/"$/, '')}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
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

      {/* Break prompt overlay */}
      {showBreakPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowBreakPrompt(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-8 mx-4 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">☕</div>
            <h3 className="font-semibold text-slate-800 text-lg mb-2">休息一下</h3>
            <p className="text-sm text-slate-500 mb-6">
              认知负荷较高，建议休息 5 分钟再继续。短暂的休息能显著提高学习效率。
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" onClick={() => setShowBreakPrompt(false)}>
                继续学习
              </Button>
              <Button onClick={() => { setShowBreakPrompt(false); }}>
                休息 5 分钟
              </Button>
            </div>
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
          {Array.from({ length: densityLevel === 'sparse' ? 2 : 3 }).map((_, i) => (
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
        <div>
          {/* Density mode info banner */}
          {densityBanner && (
            <div className={`mb-4 text-xs rounded-lg px-3 py-2 border ${densityBanner.className}`}>
              {densityBanner.text}
            </div>
          )}

          <div className="space-y-4">
            {visibleTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <ReviewTaskCard
                    task={task}
                    onComplete={handleComplete}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const nodeId = task.knowledgeNodeId;
                    const sessionId = `review_tutor_${nodeId}`;
                    setTutorSessionId(sessionId);
                    setTutorTaskId(task.id);
                    setTutorReply('');
                    setTutorMessage('');
                    setTutorHistory([]);
                    fetch(`/api/tutor/history?sessionId=${encodeURIComponent(sessionId)}`)
                      .then(r => r.json())
                      .then(data => {
                        if (data.messages && Array.isArray(data.messages)) {
                          setTutorHistory(data.messages.map((m: { role: string; content: string }) =>
                            ({ role: m.role, content: m.content })));
                        }
                      })
                      .catch(() => {});
                  }}
                >
                  AI追问
                </Button>
              </div>
            ))}
          </div>

          {/* "Show more" button for non-compact mode */}
          {hasMoreTasks && (
            <div className="mt-6 text-center">
              <Button
                variant="secondary"
                onClick={() => setVisibleCount(prev => Math.min(prev + infoChunkSize, tasks.length))}
              >
                显示更多任务 ({tasks.length - visibleTasks.length} 个剩余)
              </Button>
            </div>
          )}
        </div>
      )}

      {tutorTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setTutorTaskId(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">
                AI追问 · {tasks.find(t => t.id === tutorTaskId)?.knowledgeNode?.title || '知识点'}
              </h3>
              <button onClick={() => setTutorTaskId(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[120px]">
              {tutorHistory.length === 0 && !tutorReply && (
                <p className="text-sm text-slate-400 text-center py-8">
                  输入你的问题，AI会基于知识点内容进行追问和讲解
                </p>
              )}
              {tutorHistory.map((msg, i) => (
                <div key={i} className={`p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-50 ml-8' : 'bg-slate-50 mr-8'}`}>
                  <p className="text-xs text-slate-400 mb-0.5">{msg.role === 'user' ? '你' : 'AI'}</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))}
              {tutorReply && tutorHistory.length === 0 && (
                <div className="p-3 rounded-xl text-sm bg-slate-50 mr-8">
                  <p className="text-xs text-slate-400 mb-0.5">AI</p>
                  <p className="text-slate-700 whitespace-pre-wrap">{tutorReply}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                placeholder="输入你的问题..."
                value={tutorMessage}
                onChange={e => setTutorMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTutorSend()}
              />
              <Button size="sm" onClick={handleTutorSend} loading={tutorLoading} disabled={!tutorMessage.trim()}>
                发送
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
