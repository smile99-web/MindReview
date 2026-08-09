'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { readApiJson } from '@/lib/read-api-json';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { LatexText } from '@/components/ui/LatexText';

interface KnowledgePoint {
  title?: string;
  summary?: string;
  keywords?: string[];
  prerequisites?: string[];
  commonMistakes?: string[];
  typicalQuestions?: string[];
  difficulty?: number;
  cognitiveLoad?: number;
  icapLevel?: string;
}

interface PracticeQuestion {
  questionType?: string;
  stem?: string;
  options?: Array<{ label?: string; text?: string }>;
  answer?: string;
  explanation?: string;
  difficulty?: number;
  cognitiveLoad?: number;
}

interface ExamData {
  id: string;
  ocrText: string;
  subjectName: string | null;
  knowledgePoints?: { nodes?: KnowledgePoint[]; edges?: unknown[] };
  practiceQuestions?: PracticeQuestion[];
  userNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

type Phase = 'idle' | 'analyzing' | 'practicing' | 'reviewing' | 'icap-creating';

/** iOS WebKit 中断长请求/响应解析失败时的原始英文报错，统一翻译成可操作提示。 */
function friendlyError(err: unknown, fallback: string): string {
  const msg = getErrorMessage(err, fallback);
  if (/did not match the expected pattern|load failed|network connection was lost/i.test(msg)) {
    return '网络请求被浏览器中断（可能是等待时间过长），请重试';
  }
  return msg;
}

export default function ExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 16 — params is a Promise that must be unwrapped with `use()`.
  const { id } = use(params);
  const router = useRouter();
  const [exam, setExam] = useState<ExamData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [learningIdx, setLearningIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({});
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch(`/api/exam/${id}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `加载失败 (${res.status})`);
        }
        if (!cancelled) setExam((await res.json()) as ExamData);
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

  const handleAnalyze = async () => {
    if (!exam) return;
    setError('');
    setPhase('analyzing');
    try {
      const res = await authFetch('/api/exam/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: exam.id }),
      });
      const data = await readApiJson<{ knowledgePoints?: ExamData['knowledgePoints']; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || `分析失败 (${res.status})`);
      setExam((prev) => (prev ? { ...prev, knowledgePoints: data.knowledgePoints } : prev));
    } catch (err: unknown) {
      setError(friendlyError(err, '分析失败'));
    } finally {
      setPhase('idle');
    }
  };

  const handlePractice = async () => {
    if (!exam) return;
    setError('');
    setPhase('practicing');
    try {
      const res = await authFetch('/api/exam/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: exam.id, count: 5 }),
      });
      const data = await readApiJson<{ questions?: PracticeQuestion[]; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || `出题失败 (${res.status})`);
      setExam((prev) => (prev ? { ...prev, practiceQuestions: data.questions } : prev));
      setPhase('reviewing');
      setPracticeAnswers({});
      setPracticeSubmitted(false);
    } catch (err: unknown) {
      setError(friendlyError(err, '出题失败'));
      setPhase('idle');
    }
  };

  const handleStartIcap = async () => {
    if (!exam) return;
    setError('');
    setPhase('icap-creating');
    try {
      const res = await authFetch(`/api/exam/${exam.id}/create-node`, { method: 'POST' });
      const data = await readApiJson<{ nodeId?: string; error?: string }>(res);
      if (!res.ok || !data.nodeId) throw new Error(data.error || '启动失败');
      router.push(`/cards/${data.nodeId}`);
    } catch (err: unknown) {
      setError(friendlyError(err, '启动 ICAP 训练失败'));
      setPhase('idle');
    }
  };

  const handleLearnPoint = async (idx: number) => {
    setError('');
    setLearningIdx(idx);
    try {
      const res = await authFetch(`/api/exam/${exam!.id}/learn/${idx}`, { method: 'POST' });
      const data = await readApiJson<{ nodeId?: string; error?: string }>(res);
      if (!res.ok || !data.nodeId) throw new Error(data.error || '创建失败');
      router.push(`/cards/${data.nodeId}`);
    } catch (err: unknown) {
      setError(friendlyError(err, '创建知识点失败'));
      setLearningIdx(null);
    }
  };

  const handleDelete = async () => {
    if (!exam) return;
    if (!window.confirm('确定要删除这条拍照讲题记录吗？已分析的知识点和练习题都会一并删除。')) {
      return;
    }
    setDeleting(true);
    try {
      const res = await authFetch(`/api/exam/${exam.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `删除失败 (${res.status})`);
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '删除失败'));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full" />
      </div>
    );
  }

  if (error && !exam) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-rose-600">{error}</p>
        <Link href="/dashboard">
          <Button variant="ghost">返回仪表盘</Button>
        </Link>
      </div>
    );
  }

  if (!exam) return null;

  const knowledgePoints = exam.knowledgePoints?.nodes || [];
  const practiceQuestions = exam.practiceQuestions || [];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/dashboard"
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              ← 返回仪表盘
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 mt-1">
              📷 拍照讲题详情
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              学科：{exam.subjectName || '未能识别'} · 创建于{' '}
              {new Date(exam.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            loading={deleting}
            disabled={deleting}
            className="text-rose-600 hover:text-rose-700"
          >
            🗑️ 删除
          </Button>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* OCR text */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-800">📝 识别到的题目</h2>
          </CardHeader>
          <div className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-200">
            {exam.ocrText}
          </div>
        </Card>

        {/* Knowledge points */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">
                📚 拆解的基础知识点
                {knowledgePoints.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({knowledgePoints.length} 个)
                  </span>
                )}
              </h2>
              {knowledgePoints.length === 0 && (
                <Button
                  size="sm"
                  onClick={handleAnalyze}
                  loading={phase === 'analyzing'}
                  disabled={phase === 'analyzing'}
                >
                  {phase === 'analyzing' ? '拆解中...' : '🔍 分析知识点'}
                </Button>
              )}
            </div>
          </CardHeader>

          {knowledgePoints.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">点击任意知识点卡片即可进入专项学习（ICAP训练 + 练习题）</p>
              {knowledgePoints.map((kp, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => void handleLearnPoint(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleLearnPoint(i); }}
                  className={`group p-3 bg-gradient-to-br from-indigo-50/60 to-white rounded-lg border transition-all cursor-pointer ${
                    learningIdx === i
                      ? 'border-indigo-400 ring-2 ring-indigo-200 scale-[1.01]'
                      : 'border-indigo-100 hover:border-indigo-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 mt-0.5 transition-colors ${
                      learningIdx === i
                        ? 'bg-indigo-500 text-white animate-pulse'
                        : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200'
                    }`}>
                      {learningIdx === i ? '⋯' : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">
                        {kp.title}
                      </div>
                      {kp.summary && (
                        <div className="text-sm text-slate-600 mt-1">
                          <LatexText text={kp.summary} />
                        </div>
                      )}
                      {(kp.keywords || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(kp.keywords || []).slice(0, 6).map((kw, j) => (
                            <span
                              key={j}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* hover 提示：点击进入学习 */}
                      <div className="mt-2 text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <span>🧠 进入 ICAP 学习</span>
                        <span>→</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="mt-3 flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleStartIcap}
                  loading={phase === 'icap-creating'}
                  disabled={phase === 'icap-creating'}
                >
                  {phase === 'icap-creating' ? '准备中...' : '🧠 ICAP 训练'}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handlePractice}
                  loading={phase === 'practicing'}
                  disabled={phase === 'practicing'}
                >
                  {phase === 'practicing' ? '出题中...' : '✨ 出练习题'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">点击上方"分析知识点"开始</p>
          )}
        </Card>

        {/* Practice questions */}
        {practiceQuestions.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-slate-800">
                ✏️ 练习题
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({practiceQuestions.length} 道)
                </span>
              </h2>
            </CardHeader>
            <PracticeSession
              questions={practiceQuestions}
              answers={practiceAnswers}
              submitted={practiceSubmitted}
              onAnswer={(idx, val) =>
                setPracticeAnswers((prev) => ({ ...prev, [idx]: val }))
              }
              onSubmit={() => setPracticeSubmitted(true)}
              onMore={handlePractice}
              busy={phase === 'practicing'}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function PracticeSession({
  questions,
  answers,
  submitted,
  onAnswer,
  onSubmit,
  onMore,
  busy,
}: {
  questions: PracticeQuestion[];
  answers: Record<number, string>;
  submitted: boolean;
  onAnswer: (idx: number, val: string) => void;
  onSubmit: () => void;
  onMore: () => void;
  busy: boolean;
}) {
  const allAnswered = questions.every((_, i) => !!answers[i]);
  const correctCount = questions.filter(
    (q, i) => answers[i] && q.answer && answers[i] === q.answer,
  ).length;

  return (
    <div>
      {submitted && (
        <div className="mb-3 text-sm">
          <span
            className={
              correctCount === questions.length
                ? 'text-emerald-600 font-medium'
                : correctCount > 0
                  ? 'text-amber-600 font-medium'
                  : 'text-rose-600 font-medium'
            }
          >
            得分 {correctCount}/{questions.length}
          </span>
        </div>
      )}
      <div className="space-y-3">
        {questions.map((q, qi) => {
          const userAns = answers[qi];
          const correct = submitted && userAns && userAns === q.answer;
          const wrong = submitted && userAns && userAns !== q.answer;
          return (
            <div
              key={qi}
              className={`p-3 rounded-lg border ${
                correct
                  ? 'bg-emerald-50 border-emerald-200'
                  : wrong
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-white border-slate-200'
              }`}
            >
              <div className="text-xs text-slate-500 mb-1.5">第 {qi + 1} 题</div>
              <div className="text-sm font-medium text-slate-800 mb-2">
                <LatexText text={q.stem || ''} />
              </div>
              {q.options && q.options.length > 0 ? (
                <div className="space-y-1.5">
                  {q.options.map((opt, j) => {
                    const optVal = opt.label || opt.text || String(j);
                    const isUserChoice = userAns === optVal;
                    const isCorrectChoice = submitted && q.answer === optVal;
                    return (
                      <label
                        key={j}
                        className={`flex items-start gap-2 p-2 rounded-md cursor-pointer text-sm hover:bg-slate-50 ${
                          isUserChoice && !submitted
                            ? 'bg-indigo-50/40'
                            : isCorrectChoice
                              ? 'bg-emerald-100/50'
                              : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name={`exam-detail-q-${qi}`}
                          value={optVal}
                          checked={isUserChoice}
                          disabled={submitted}
                          onChange={() => onAnswer(qi, optVal)}
                          className="mt-1"
                        />
                        <span className="font-semibold text-slate-500">
                          {opt.label || String.fromCharCode(65 + j)}.
                        </span>
                        <span className="text-slate-700 flex-1">
                          <LatexText text={opt.text || ''} />
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={userAns || ''}
                  disabled={submitted}
                  onChange={(e) => onAnswer(qi, e.target.value)}
                  placeholder="输入你的答案..."
                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                />
              )}
              {submitted && q.explanation && (
                <div className="mt-2 text-xs text-slate-600 bg-white/60 rounded-md p-2">
                  <span className="font-semibold text-slate-700">解析：</span>
                  <LatexText text={q.explanation} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2 justify-end">
        {submitted ? (
          <Button size="sm" variant="ghost" onClick={onMore} loading={busy} disabled={busy}>
            ↻ 再来一组
          </Button>
        ) : (
          <Button size="sm" onClick={onSubmit} disabled={!allAnswered}>
            提交答案
          </Button>
        )}
      </div>
    </div>
  );
}
