'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LatexText } from '@/components/ui/LatexText';
import { RATING_LABEL, RATING_COLOR, type Rating } from '@/lib/fsrs';

interface MistakeDetail {
  id: string;
  questionText: string;
  wrongAnswer: string | null;
  correctAnswer: string;
  mistakeType: string | null;
  analysis: string | null;
  resolved: boolean;
  state: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  nextReviewAt: string | null;
  lastReviewAt: string | null;
  subject?: { id: string; name: string; icon: string | null } | null;
  knowledgeNode?: { id: string; title: string } | null;
  createdAt: string;
}

interface ReviewResult {
  rating: Rating;
  ratingLabel: string;
  state: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewAt: string | null;
  nextReviewAt: string | null;
  resolved: boolean;
  willResurface: string | null;
  history: unknown[];
}

export default function MistakeReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [mistake, setMistake] = useState<MistakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [result, setResult] = useState<ReviewResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch(`/api/mistakes/${id}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `加载失败 (${res.status})`);
        }
        if (!cancelled) setMistake((await res.json()) as MistakeDetail);
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const submit = async (rating: Rating) => {
    setSubmitting(true);
    setError('');
    const t0 = Date.now();
    try {
      const res = await authFetch(`/api/mistakes/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, durationMs: Date.now() - t0 }),
      });
      const data = (await res.json()) as ReviewResult & { error?: string };
      if (!res.ok) throw new Error(data.error || `提交失败 (${res.status})`);
      setResult(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '提交失败'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full" />
      </div>
    );
  }

  if (error && !mistake) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-rose-600">{error}</p>
        <Link href="/mistakes" className="text-indigo-600 hover:text-indigo-700 text-sm">
          ← 返回错题本
        </Link>
      </div>
    );
  }

  if (!mistake) return null;

  // Result view (after submit)
  if (result) {
    const days = result.nextReviewAt
      ? Math.max(0, Math.round(
          (new Date(result.nextReviewAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ))
      : 0;
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
        <div className="max-w-2xl mx-auto">
          <Link
            href={mistake.subject ? `/mistakes/subject/${mistake.subject.id}` : '/mistakes'}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            ← 返回
          </Link>

          <Card className="mt-3 mb-4">
            <CardHeader>
              <h2 className="text-base font-semibold text-slate-800">
                {result.resolved ? '🎉 本次答对，已暂时从错题库隐藏' : '📝 已记录这次复习'}
              </h2>
            </CardHeader>
            <div className="space-y-2.5 text-sm">
              <Row label="你的评分" value={`${result.ratingLabel} (${result.rating})`} />
              <Row label="错题状态" value={
                result.state === 'new' ? '新错题' :
                result.state === 'learning' ? '学习中' :
                result.state === 'review' ? '复习中' :
                result.state === 'relearning' ? '再学习中' : result.state
              } />
              <Row label="记忆稳定性" value={`${result.stability.toFixed(2)} 天（半衰期）`} />
              <Row label="难度" value={`${result.difficulty.toFixed(1)} / 10`} />
              <Row label="已复习次数" value={`${result.reps} 次`} />
              <Row
                label="下次复习"
                value={
                  result.resolved
                    ? `📅 ${formatDate(result.willResurface)}（按 Ebbinghaus 曲线自动浮现）`
                    : days === 0
                      ? '📅 今日'
                      : `📅 ${days} 天后 (${formatDate(result.nextReviewAt)})`
                }
              />
            </div>
          </Card>

          <div className="flex gap-2 justify-end">
            <Link href="/mistakes">
              <Button variant="ghost">返回错题本</Button>
            </Link>
            <Button onClick={() => {
              setResult(null);
              setRevealed(false);
              setUserAnswer('');
            }}>
              继续复习下一题
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Question view (initial)
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href={mistake.subject ? `/mistakes/subject/${mistake.subject.id}` : '/mistakes'}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          ← 返回
        </Link>

        <div className="mt-3 mb-4 flex items-center gap-2 flex-wrap">
          {mistake.subject && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {mistake.subject.icon} {mistake.subject.name}
            </span>
          )}
          {mistake.mistakeType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700">
              错因：{mistake.mistakeType === 'conceptual' ? '概念' :
                     mistake.mistakeType === 'calculation' ? '计算' :
                     mistake.mistakeType === 'careless' ? '粗心' :
                     mistake.mistakeType === 'application' ? '应用' : mistake.mistakeType}
            </span>
          )}
          {mistake.knowledgeNode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
              关联：{mistake.knowledgeNode.title}
            </span>
          )}
          <span className="ml-auto text-[10px] text-slate-400">
            已复习 {mistake.reps} 次 · 稳定性 {mistake.stability.toFixed(1)}d
          </span>
        </div>

        <Card className="mb-4">
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-800">📝 重做这道题</h2>
          </CardHeader>
          <div className="text-base text-slate-800 whitespace-pre-wrap leading-relaxed">
            <LatexText text={mistake.questionText} />
          </div>

          {!revealed ? (
            <div className="mt-4">
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="写下你的答案...（选填）"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none resize-y"
              />
              <div className="mt-3 flex justify-end">
                <Button onClick={() => setRevealed(true)}>
                  查看答案
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-xs font-semibold text-emerald-800 mb-1">✓ 正确答案</div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap">
                  <LatexText text={mistake.correctAnswer} />
                </div>
              </div>
              {mistake.wrongAnswer && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                  <div className="text-xs font-semibold text-rose-800 mb-1">✗ 你的原答案</div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap">
                    <LatexText text={mistake.wrongAnswer} />
                  </div>
                </div>
              )}
              {mistake.analysis && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-700 mb-1">💡 AI 错因分析</div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">
                    <LatexText text={mistake.analysis} />
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100">
                <div className="text-sm font-medium text-slate-700 mb-2">
                  你这次答得怎么样？
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([0, 1, 2, 3] as Rating[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => void submit(r)}
                      disabled={submitting}
                      className={`p-3 rounded-lg text-white text-sm font-medium transition-opacity ${
                        RATING_COLOR[r]
                      } ${submitting ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
                    >
                      {RATING_LABEL[r]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  评分会按 FSRS 算法调整下次复习时间。答对（自己答对 / 秒答）会拉长间隔，答错会重置回 1 天后。
                </p>
              </div>
            </div>
          )}
        </Card>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-slate-500 w-20 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 flex-1">{value}</span>
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
