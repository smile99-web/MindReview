'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LatexText } from '@/components/ui/LatexText';
import { RATING_LABEL, RATING_COLOR, type Rating } from '@/lib/fsrs';

interface MistakeOption {
  label: string;
  text: string;
}

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

interface CheckResult {
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  correctAnswerText: string | null;
  matchExplanation: string;
  aiExplanation: string | null;
  questionType: 'multiple_choice' | 'free_form';
  options: MistakeOption[];
  stem: string;
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

// 解析 formatFullQuestion 格式的 questionText（服务端也做
// 了同样的解析，但前端这里做一遍可以让用户在选答案前就看到
// 结构化选项，不需要先点击才能解析）。
function parseQuestion(questionText: string): { stem: string; options: MistakeOption[] } {
  const lines = questionText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { stem: questionText, options: [] };
  const stem = lines[0];
  const options: MistakeOption[] = [];
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Z])\.\s*(.*)$/);
    if (m) options.push({ label: m[1], text: m[2] });
  }
  return { stem, options };
}

export default function MistakeReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [mistake, setMistake] = useState<MistakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string>(''); // 选项 label 或填空文本
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [fsrsSubmitting, setFsrsSubmitting] = useState(false);
  const [fsrsResult, setFsrsResult] = useState<ReviewResult | null>(null);

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

  // Submit user's answer for instant grading + AI explanation
  // (only when wrong). State transitions:
  //   "answering" -> user picked a radio / typed an answer
  //   "checking" -> POST /api/mistakes/[id]/check
  //   "graded"   -> checkResult populated, FSRS buttons appear
  //   "scheduled" -> fsrsResult populated, redirect-to-dashboard
  //                    buttons appear
  const submitAnswer = async () => {
    if (!selected.trim()) {
      setError('请先选择或输入答案');
      return;
    }
    setError('');
    setChecking(true);
    try {
      const res = await authFetch(`/api/mistakes/${id}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAnswer: selected.trim() }),
      });
      const data = (await res.json()) as CheckResult & { error?: string };
      if (!res.ok) throw new Error(data.error || `判分失败 (${res.status})`);
      setCheckResult(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '判分失败'));
    } finally {
      setChecking(false);
    }
  };

  const submitFSRS = async (rating: Rating) => {
    setFsrsSubmitting(true);
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
      setFsrsResult(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '提交失败'));
    } finally {
      setFsrsSubmitting(false);
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

  // FSRS scheduled view (final)
  if (fsrsResult) {
    const days = fsrsResult.nextReviewAt
      ? Math.max(
          0,
          Math.round(
            (new Date(fsrsResult.nextReviewAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
          ),
        )
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
                {fsrsResult.resolved ? '🎉 本次答对，已暂时从错题库隐藏' : '📝 已记录这次复习'}
              </h2>
            </CardHeader>
            <div className="space-y-2.5 text-sm">
              <Row label="你的评分" value={`${fsrsResult.ratingLabel} (${fsrsResult.rating})`} />
              <Row
                label="错题状态"
                value={
                  fsrsResult.state === 'new'
                    ? '新错题'
                    : fsrsResult.state === 'learning'
                      ? '学习中'
                      : fsrsResult.state === 'review'
                        ? '复习中'
                        : fsrsResult.state === 'relearning'
                          ? '再学习中'
                          : fsrsResult.state
                }
              />
              <Row label="记忆稳定性" value={`${fsrsResult.stability.toFixed(2)} 天（半衰期）`} />
              <Row label="难度" value={`${fsrsResult.difficulty.toFixed(1)} / 10`} />
              <Row label="已复习次数" value={`${fsrsResult.reps} 次`} />
              <Row
                label="下次复习"
                value={
                  fsrsResult.resolved
                    ? `📅 ${formatDate(fsrsResult.willResurface)}（按 Ebbinghaus 曲线自动浮现）`
                    : days === 0
                      ? '📅 今日'
                      : `📅 ${days} 天后 (${formatDate(fsrsResult.nextReviewAt)})`
                }
              />
            </div>
          </Card>
          <div className="flex gap-2 justify-end">
            <Link href="/mistakes">
              <Button variant="ghost">返回错题本</Button>
            </Link>
            <Button
              onClick={() => {
                // 全量跳回学科详情页（刚答完的题被 FSRS 重调度后，
                // 列表顶部是下一道待复习题）。用 window.location
                // 保证浏览器不缓存 Next.js 客户端路由状态。
                window.location.href = mistake.subject
                  ? `/mistakes/subject/${mistake.subject.id}`
                  : '/mistakes';
              }}
            >
              继续复习下一题
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Build the question view. We parse the questionText into
  // stem + options for the structured form. If parsing yields
  // no options (free-form text), we fall back to a text input.
  const parsed = parseQuestion(mistake.questionText);
  const correctOpt = parsed.options.find((o) => o.label === mistake.correctAnswer.trim());
  const useStructuredOptions = parsed.options.length > 0;

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
              错因：{mistakeTypeLabel(mistake.mistakeType)}
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

          {/* Question stem */}
          <div className="text-base text-slate-800 leading-relaxed">
            <LatexText text={parsed.stem} />
          </div>

          {/* Option picker (multiple choice) */}
          {useStructuredOptions && !checkResult && (
            <div className="mt-4 space-y-2">
              {parsed.options.map((opt) => (
                <label
                  key={opt.label}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected === opt.label
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`mistake-q-${id}`}
                    value={opt.label}
                    checked={selected === opt.label}
                    onChange={() => setSelected(opt.label)}
                    className="mt-1"
                  />
                  <span className="font-semibold text-slate-500 shrink-0">
                    {opt.label}.
                  </span>
                  <span className="text-slate-700 flex-1">
                    <LatexText text={opt.text} />
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Free-form input (no options parsed) */}
          {!useStructuredOptions && !checkResult && (
            <div className="mt-4">
              <textarea
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                placeholder="写下你的答案..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none resize-y"
              />
            </div>
          )}

          {/* Submit-for-grading button (pre-grading only) */}
          {!checkResult && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => void submitAnswer()}
                loading={checking}
                disabled={!selected.trim()}
              >
                {checking ? '判分中...' : '✓ 提交答案'}
              </Button>
            </div>
          )}

          {/* Grading result */}
          {checkResult && (
            <div className="mt-4 space-y-3">
              {/* Verdict banner */}
              <div
                className={`p-3 rounded-lg border ${
                  checkResult.isCorrect
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-rose-50 border-rose-200'
                }`}
              >
                <div
                  className={`text-sm font-semibold ${
                    checkResult.isCorrect ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {checkResult.isCorrect ? '✓ 答对了！' : '✗ 答错了'}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {checkResult.matchExplanation}
                </div>
              </div>

              {/* Show the correct answer inline if wrong */}
              {!checkResult.isCorrect && (
                <div className="p-3 rounded-lg bg-white border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    正确答案
                  </div>
                  <div className="text-sm text-slate-800">
                    {correctOpt ? (
                      <span>
                        <span className="font-semibold text-emerald-700">
                          {correctOpt.label}.
                        </span>{' '}
                        <LatexText text={correctOpt.text} />
                      </span>
                    ) : (
                      <LatexText text={mistake.correctAnswer} />
                    )}
                  </div>
                </div>
              )}

              {/* AI explanation (only on wrong answers) */}
              {!checkResult.isCorrect && checkResult.aiExplanation && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="text-xs font-semibold text-amber-800 mb-1">💡 AI 讲解</div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                    <LatexText text={checkResult.aiExplanation} />
                  </div>
                </div>
              )}

              {/* Original wrong answer (for context) */}
              {mistake.wrongAnswer && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 mb-1">
                    你之前的原答案
                  </div>
                  <div className="text-sm text-slate-700">
                    <LatexText text={mistake.wrongAnswer} />
                  </div>
                </div>
              )}

              {/* Original AI analysis (if it exists and is different from aiExplanation) */}
              {mistake.analysis && checkResult.isCorrect && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-semibold text-slate-500 mb-1">💡 AI 错因分析（历史）</div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">
                    <LatexText text={mistake.analysis} />
                  </div>
                </div>
              )}

              {/* FSRS rating buttons */}
              <div className="pt-3 border-t border-slate-100">
                <div className="text-sm font-medium text-slate-700 mb-2">
                  你这次答得怎么样？{checkResult.isCorrect ? '（答对了，FSRS 会拉长复习间隔）' : '（答错了，FSRS 会重置复习间隔）'}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {([0, 1, 2, 3] as Rating[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => void submitFSRS(r)}
                      disabled={fsrsSubmitting}
                      className={`p-3 rounded-lg text-white text-sm font-medium transition-opacity ${
                        RATING_COLOR[r]
                      } ${fsrsSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}`}
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

function mistakeTypeLabel(t: string | null): string {
  if (!t) return '未知';
  switch (t) {
    case 'conceptual':
      return '概念';
    case 'calculation':
      return '计算';
    case 'careless':
      return '粗心';
    case 'application':
      return '应用';
    default:
      return t;
  }
}
