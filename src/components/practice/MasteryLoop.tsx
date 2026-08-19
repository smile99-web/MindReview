'use client';

// ---------------------------------------------------------------------------
// MasteryLoop — 掌握训练循环
// 学 → 练 → 讲解 → 再练 → 直到掌握：
//   1. 每轮 AI 出一道新题（避免背答案）
//   2. 答错：立即讲解（解析 + 知识点回顾 + 易错点 + 3D 演示入口），然后再来一题
//   3. 答对：连对计数 +1，掌握度实时反馈（SM-2 已写库）
//   4. 连对 2 题或掌握度 ≥60：判定"掌握"，引导进入下一个知识点
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/auth';
import { LatexText } from '@/components/ui/LatexText';

const MASTERED_THRESHOLD = 60;
const STREAK_TO_MASTER = 2;

interface LoopQuestion {
  id: string;
  questionType?: string;
  stem: string;
  options?: Array<{ label: string; text?: string }> | null;
  answer?: string;
  explanation?: string | null;
}

interface SubmitResult {
  isCorrect: boolean;
  correctAnswer?: string;
  explanation?: string;
  feedback?: string;
  masteryChange?: { before: number; after: number; delta: number };
  sm2State?: { masteryLevel: number; repetitions: number };
}

type Phase = 'intro' | 'loading' | 'answering' | 'graded' | 'mastered';

interface MasteryLoopProps {
  nodeId: string;
  nodeTitle: string;
  nodeSummary?: string | null;
  commonMistakes?: string[];
  /** 有匹配的 3D 演示场景时显示"看 3D 演示"按钮 */
  hasLab3d?: boolean;
  onGoLab3d?: () => void;
  /** 首次答对后回调（用于点亮"练习"步骤） */
  onPracticeCorrect?: () => void;
  nextNodeId?: string | null;
  nextNodeTitle?: string | null;
  subjectId?: string;
}

export default function MasteryLoop({
  nodeId,
  nodeTitle,
  nodeSummary,
  commonMistakes = [],
  hasLab3d = false,
  onGoLab3d,
  onPracticeCorrect,
  nextNodeId,
  nextNodeTitle,
  subjectId,
}: MasteryLoopProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const [question, setQuestion] = useState<LoopQuestion | null>(null);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [streak, setStreak] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [mastery, setMastery] = useState<number | null>(null);
  //  StrictMode/快速连点下的并发保护
  const fetchingRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // 切换知识点时重置循环
  useEffect(() => {
    queueMicrotask(() => {
      setPhase('intro');
      setQuestion(null);
      setSelected('');
      setResult(null);
      setError('');
      setStreak(0);
      setRounds(0);
      setCorrectCount(0);
      setMastery(null);
      seenIdsRef.current = new Set();
    });
  }, [nodeId]);

  const fetchQuestion = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setPhase('loading');
    setError('');
    setSelected('');
    setResult(null);
    try {
      // 每轮强制生成新题，保证"再次练习"不是背答案
      const res = await authFetch(
        `/api/practice?knowledgeNodeId=${encodeURIComponent(nodeId)}&icapLevel=Active&count=1&forceGenerate=true`,
      );
      const data = (await res.json()) as { questions?: LoopQuestion[]; error?: string };
      let q = Array.isArray(data.questions) ? data.questions[0] : undefined;
      // AI 出题失败兜底：从题库取最近题目
      if (!res.ok || !q) {
        const fallback = await authFetch(
          `/api/practice?knowledgeNodeId=${encodeURIComponent(nodeId)}&icapLevel=Active&count=5`,
        );
        const fb = (await fallback.json()) as { questions?: LoopQuestion[] };
        const candidates = (fb.questions ?? []).filter((cand) => !seenIdsRef.current.has(cand.id));
        q = candidates[0] ?? fb.questions?.[0];
      }
      if (!q) throw new Error('暂时没有可用的练习题，请稍后再试');
      seenIdsRef.current.add(q.id);
      setQuestion(q);
      setPhase('answering');
    } catch (e) {
      setError(e instanceof Error ? e.message : '出题失败，请重试');
      setPhase('intro');
    } finally {
      fetchingRef.current = false;
    }
  }, [nodeId]);

  const submit = useCallback(async () => {
    if (!question || !selected || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await authFetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, userAnswer: selected }),
      });
      const data = (await res.json()) as SubmitResult & { error?: string };
      if (!res.ok) throw new Error(data.error || '判题失败，请重试');
      setResult(data);
      setRounds((r) => r + 1);
      const newMastery = data.sm2State?.masteryLevel ?? null;
      if (newMastery !== null) setMastery(newMastery);
      if (data.isCorrect) {
        const newStreak = streak + 1;
        setStreak(newStreak);
        setCorrectCount((c) => c + 1);
        onPracticeCorrect?.();
        setPhase(
          newStreak >= STREAK_TO_MASTER || (newMastery !== null && newMastery >= MASTERED_THRESHOLD)
            ? 'mastered'
            : 'graded',
        );
      } else {
        setStreak(0);
        setPhase('graded');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '判题失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [question, selected, submitting, streak, onPracticeCorrect]);

  const options = question?.options ?? [];
  const isCorrect = result?.isCorrect ?? false;

  return (
    <div className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/60 to-white p-5">
      {/* 头部：目标与进度 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-[15px] font-bold text-slate-800">🎯 掌握训练</h3>
        <span className="text-xs text-slate-500">连对 {STREAK_TO_MASTER} 题即掌握</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="tabular-nums text-slate-500">
            连对 <b className={streak > 0 ? 'text-emerald-600' : 'text-slate-700'}>{streak}</b>/{STREAK_TO_MASTER}
          </span>
          {mastery !== null && (
            <span className="tabular-nums text-slate-500">
              掌握度 <b className={mastery >= MASTERED_THRESHOLD ? 'text-emerald-600' : 'text-indigo-600'}>{mastery}%</b>
            </span>
          )}
          {rounds > 0 && (
            <span className="tabular-nums text-slate-400">
              {rounds} 轮 · 对 {correctCount}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/*  intro：说明 + 开始 */}
      {phase === 'intro' && (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-600">
            围绕「<b>{nodeTitle}</b>」逐题训练：答错立即讲解，连对 {STREAK_TO_MASTER} 题就证明你掌握了
          </p>
          <button
            type="button"
            onClick={() => void fetchQuestion()}
            className="mt-4 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
          >
            🚀 开始训练
          </button>
        </div>
      )}

      {/* loading */}
      {phase === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          AI 正在出题…
        </div>
      )}

      {/* 答题 / 判题后讲解 */}
      {(phase === 'answering' || phase === 'graded') && question && (
        <div>
          <div className="text-sm font-medium text-slate-800">
            <LatexText text={question.stem} />
          </div>

          {options.length > 0 ? (
            <div className="mt-3 space-y-2">
              {options.map((opt) => {
                const isSelected = selected === opt.label;
                const graded = phase === 'graded';
                const isAnswer = graded && opt.label === (result?.correctAnswer ?? question.answer);
                const isWrongPick = graded && isSelected && !isCorrect;
                let cls = 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40';
                if (isAnswer) cls = 'border-emerald-300 bg-emerald-50/70';
                else if (isWrongPick) cls = 'border-rose-300 bg-rose-50/70';
                else if (isSelected) cls = 'border-indigo-400 bg-indigo-50/70';
                else if (graded) cls = 'border-slate-200 bg-white opacity-60';
                return (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={graded}
                    onClick={() => setSelected(opt.label)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${cls}`}
                  >
                    <span className="w-5 shrink-0 text-xs font-bold text-slate-400">{opt.label}.</span>
                    <span className="text-sm text-slate-700">
                      <LatexText text={opt.text ?? ''} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : question.questionType === 'true_false' ? (
            /* 判断题：无选项时给 正确/错误 两个选择 */
            <div className="mt-3 flex gap-3">
              {['正确', '错误'].map((tf) => {
                const isSelected = selected === tf;
                const graded = phase === 'graded';
                return (
                  <button
                    key={tf}
                    type="button"
                    disabled={graded}
                    onClick={() => setSelected(tf)}
                    className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50/70 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/40'
                    } ${graded ? 'opacity-70' : ''}`}
                  >
                    {tf === '正确' ? '✓ 正确' : '✗ 错误'}
                  </button>
                );
              })}
            </div>
          ) : (
            /* 填空题：文本输入 */
            <div className="mt-3">
              <input
                type="text"
                value={selected}
                disabled={phase === 'graded'}
                onChange={(e) => setSelected(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selected.trim() && phase === 'answering') void submit();
                }}
                placeholder="把答案填在这里，回车提交"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
              />
            </div>
          )}

          {phase === 'answering' && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!selected.trim() || submitting}
              className={`mt-4 rounded-xl px-5 py-2 text-sm font-semibold transition ${
                selected.trim() && !submitting
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                  : 'cursor-not-allowed bg-slate-100 text-slate-400'
              }`}
            >
              {submitting ? '判题中…' : '提交答案'}
            </button>
          )}

          {phase === 'graded' && result && (
            <div
              className={`mt-4 rounded-xl border p-4 ${
                isCorrect ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'
              }`}
            >
              {isCorrect ? (
                <p className="text-sm font-semibold text-emerald-700">
                  ✅ 答对了！连对 {streak}/{STREAK_TO_MASTER}
                  {result.masteryChange && result.masteryChange.delta > 0 && (
                    <span className="ml-2 font-normal text-emerald-600">
                      掌握度 +{result.masteryChange.delta}
                    </span>
                  )}
                </p>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    💡 没关系，看讲解 — 正确答案是{' '}
                    <LatexText text={result.correctAnswer ?? question.answer ?? ''} />
                  </p>
                  {/* 讲解：解析 + 知识点回顾 + 易错点 */}
                  {(result.explanation || question.explanation) && (
                    <div className="mt-2 text-sm leading-relaxed text-slate-700">
                      <span className="font-medium text-slate-800">解析：</span>
                      <LatexText text={result.explanation ?? question.explanation ?? ''} />
                    </div>
                  )}
                  {nodeSummary && (
                    <p className="mt-2 border-l-2 border-indigo-300 pl-2.5 text-xs leading-relaxed text-slate-500">
                      <span className="font-medium text-indigo-600">回顾「{nodeTitle}」：</span>
                      {nodeSummary}
                    </p>
                  )}
                  {commonMistakes.length > 0 && (
                    <p className="mt-1.5 text-xs text-rose-600/90">
                      ⚠️ 这个知识点最容易错：{commonMistakes.slice(0, 2).join('；')}
                    </p>
                  )}
                  {hasLab3d && onGoLab3d && (
                    <button
                      type="button"
                      onClick={onGoLab3d}
                      className="mt-2 rounded-lg bg-cyan-100 px-3 py-1.5 text-xs font-medium text-cyan-800 transition hover:bg-cyan-200"
                    >
                      🧊 还是不懂？去看 3D 演示动手玩一玩
                    </button>
                  )}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void fetchQuestion()}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 active:scale-95"
                >
                  {isCorrect ? '再来一题 →' : '我懂了，再来一题 →'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 掌握达成 */}
      {phase === 'mastered' && (
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 text-center">
          <p className="text-3xl">🎉</p>
          <p className="mt-1 text-base font-bold text-emerald-800">
            掌握了「{nodeTitle}」！
          </p>
          <p className="mt-1 text-xs text-emerald-600">
            {rounds} 轮训练 · 答对 {correctCount} 题
            {mastery !== null && ` · 当前掌握度 ${mastery}%`}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {nextNodeId && (
              <button
                type="button"
                onClick={() => router.push(`/cards/${nextNodeId}`)}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
              >
                下一个知识点{nextNodeTitle ? `：${nextNodeTitle}` : ''} →
              </button>
            )}
            <button
              type="button"
              onClick={() => void fetchQuestion()}
              className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              继续巩固
            </button>
            {subjectId && (
              <button
                type="button"
                onClick={() => router.push(`/mindmap?subjectId=${subjectId}`)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                返回学习路径
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
