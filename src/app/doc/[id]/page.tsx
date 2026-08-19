'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { LatexText } from '@/components/ui/LatexText';

interface KnowledgePoint {
  title?: string;
  summary?: string;
  keywords?: string[];
  difficulty?: number;
  icapLevel?: string;
}

interface PracticeQuestion {
  questionType?: string;
  stem?: string;
  options?: Array<{ label?: string; text?: string }>;
  answer?: string;
  explanation?: string;
  difficulty?: number;
}

interface DocData {
  id: string;
  fileName: string;
  subjectName: string | null;
  content: string;
  knowledgePoints?: { nodes?: KnowledgePoint[] };
  practiceQuestions?: PracticeQuestion[];
  userNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

type Phase = 'idle' | 'analyzing' | 'practicing' | 'icap-creating';

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: '选择题',
  fill_blank: '填空题',
  short_answer: '问答题',
};

export default function DocDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<DocData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [subjectInput, setSubjectInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({});
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch(`/api/doc/${id}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `加载失败 (${res.status})`);
        }
        const full = (await res.json()) as DocData;
        if (!cancelled) {
          setDoc(full);
          setSubjectInput(full.subjectName || '');
        }
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
    if (!doc) return;
    setError('');
    setPhase('analyzing');
    try {
      const body: { docId: string; subject?: string } = { docId: doc.id };
      if (subjectInput.trim()) body.subject = subjectInput.trim();
      const res = await authFetch('/api/doc/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        knowledgePoints?: DocData['knowledgePoints'];
        subjectName?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `分析失败 (${res.status})`);
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              knowledgePoints: data.knowledgePoints,
              subjectName: data.subjectName || prev.subjectName,
            }
          : prev,
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, '分析失败'));
    } finally {
      setPhase('idle');
    }
  };

  const handlePractice = async () => {
    if (!doc) return;
    setError('');
    setPhase('practicing');
    try {
      const types = [
        { type: 'multiple_choice', count: 3 },
        { type: 'fill_blank', count: 2 },
        { type: 'short_answer', count: 2 },
      ];
      const res = await authFetch('/api/doc/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, types }),
      });
      const data = (await res.json()) as {
        questions?: PracticeQuestion[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `出题失败 (${res.status})`);
      setDoc((prev) => (prev ? { ...prev, practiceQuestions: data.questions } : prev));
      setPracticeSubmitted(false);
      setPracticeAnswers({});
    } catch (err: unknown) {
      setError(getErrorMessage(err, '出题失败'));
    } finally {
      // 成功/失败都要复位：只挂在 catch 上会让 phase 永远卡在
      // 'practicing'，"再来一组"按钮永久禁用（同 handleAnalyze 的写法）
      setPhase('idle');
    }
  };

  const handleStartIcap = async () => {
    if (!doc) return;
    setError('');
    setPhase('icap-creating');
    try {
      const res = await authFetch(`/api/doc/${doc.id}/create-node`, { method: 'POST' });
      const data = (await res.json()) as { nodeId?: string; error?: string };
      if (!res.ok || !data.nodeId) throw new Error(data.error || '启动失败');
      router.push(`/cards/${data.nodeId}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '启动 ICAP 训练失败'));
      setPhase('idle');
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    if (!window.confirm('确定要删除这个文件记录吗？已分析的知识点和练习题都会一并删除。')) {
      return;
    }
    setDeleting(true);
    try {
      const res = await authFetch(`/api/doc/${doc.id}`, { method: 'DELETE' });
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

  if (error && !doc) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-rose-600">{error}</p>
        <Link href="/dashboard">
          <Button variant="ghost">返回仪表盘</Button>
        </Link>
      </div>
    );
  }

  if (!doc) return null;

  const knowledgePoints = doc.knowledgePoints?.nodes || [];
  const allQuestions = doc.practiceQuestions || [];
  // 过滤时携带原始下标：practiceAnswers 始终以题目在 allQuestions 中的下标为 key，
  // 避免切换题型筛选后答案归属错乱、提交时错题记录下标错位
  const indexedQuestions = allQuestions.map((q, originalIdx) => ({ q, originalIdx }));
  const filteredQuestions = typeFilter
    ? indexedQuestions.filter((item) => item.q.questionType === typeFilter)
    : indexedQuestions;
  const typeCounts: Record<string, number> = {};
  allQuestions.forEach((q) => {
    const t = q.questionType || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });

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
              📄 {doc.fileName}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {doc.subjectName ? `学科：${doc.subjectName} · ` : ''}字符数：
              {doc.content.length} · 创建于{' '}
              {new Date(doc.createdAt).toLocaleString('zh-CN')}
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

        {/* Content preview */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-800">📄 文件内容</h2>
          </CardHeader>
          <div className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-200 max-h-72 overflow-y-auto">
            {doc.content}
          </div>
        </Card>

        {/* Knowledge points */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">
                📚 拆解的知识点
                {knowledgePoints.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({knowledgePoints.length} 个)
                  </span>
                )}
              </h2>
            </div>
          </CardHeader>

          {/* Subject input */}
          <div className="mb-3 flex items-center gap-2">
            <label className="text-xs text-slate-500 shrink-0">学科：</label>
            <input
              type="text"
              value={subjectInput}
              onChange={(e) => setSubjectInput(e.target.value)}
              placeholder="留空由 AI 推断，或手动填入"
              className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none"
            />
            {knowledgePoints.length === 0 && (
              <Button
                size="sm"
                onClick={handleAnalyze}
                loading={phase === 'analyzing'}
                disabled={phase === 'analyzing'}
              >
                {phase === 'analyzing' ? '拆解中...' : '🔍 分析'}
              </Button>
            )}
            {knowledgePoints.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleAnalyze}
                loading={phase === 'analyzing'}
                disabled={phase === 'analyzing'}
              >
                {phase === 'analyzing' ? '重新拆解...' : '重新拆解'}
              </Button>
            )}
          </div>

          {knowledgePoints.length > 0 ? (
            <div className="space-y-3">
              {knowledgePoints.map((kp, i) => (
                <div
                  key={i}
                  className="p-3 bg-gradient-to-br from-indigo-50/60 to-white rounded-lg border border-indigo-100"
                >
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">
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
                  {phase === 'practicing' ? 'AI出题中...' : '✨ AI生成题目'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">在上方填入或留空学科，然后点击"分析"开始</p>
          )}
        </Card>

        {/* Practice questions */}
        {allQuestions.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-slate-800">
                  ✏️ 练习题
                </h2>
                <span className="text-xs text-slate-500">
                  ({allQuestions.length} 道)
                </span>
                {/* Type filter chips */}
                <div className="ml-auto flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('')}
                    className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                      typeFilter === ''
                        ? 'bg-indigo-100 text-indigo-700 font-medium'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    全部 ({allQuestions.length})
                  </button>
                  {Object.entries(typeCounts).map(([type, count]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTypeFilter(type)}
                      className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                        typeFilter === type
                          ? 'bg-indigo-100 text-indigo-700 font-medium'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {TYPE_LABELS[type] || type} ({count})
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <PracticeSession
              questions={filteredQuestions}
              allQuestions={allQuestions}
              answers={practiceAnswers}
              submitted={practiceSubmitted}
              onAnswer={(idx, val) =>
                setPracticeAnswers((prev) => ({ ...prev, [idx]: val }))
              }
              onSubmit={() => {
                setPracticeSubmitted(true);
                // Record wrong answers to the mistake book so the
                // 错题本 picks them up with FSRS scheduling.
                const wrongs = allQuestions
                  .filter((q, i) => {
                    // 只有选项正常的选择题参与判分/录错题（填空/简答/文本
                    // 回退题措辞不同即误判，正确答案不能进错题本）
                    const gradableMC =
                      (q.questionType || 'multiple_choice') === 'multiple_choice' &&
                      !!q.options && q.options.length > 0;
                    if (!gradableMC) return false;
                    const ans = practiceAnswers[i];
                    return ans && q.answer && ans !== q.answer;
                  })
                  .map((q, i) => ({
                    questionText:
                      q.questionType === 'multiple_choice'
                        ? (q.stem || '') +
                          (q.options || []).map((o) => `\n${o.label}. ${o.text}`).join('')
                        : q.stem || '',
                    wrongAnswer: practiceAnswers[allQuestions.indexOf(q)] || '',
                    correctAnswer: q.answer || '',
                    questionType: q.questionType,
                    explanation: q.explanation,
                  }));
                if (wrongs.length > 0) {
                  void authFetch(`/api/doc/${doc!.id}/record-mistakes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wrongAnswers: wrongs }),
                  });
                }
              }}
              onMore={handlePractice}
              busy={phase === 'practicing'}
              typeLabels={TYPE_LABELS}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function PracticeSession({
  questions,
  allQuestions,
  answers,
  submitted,
  onAnswer,
  onSubmit,
  onMore,
  busy,
  typeLabels,
}: {
  questions: Array<{ q: PracticeQuestion; originalIdx: number }>;
  allQuestions: PracticeQuestion[];
  answers: Record<number, string>;
  submitted: boolean;
  onAnswer: (idx: number, val: string) => void;
  onSubmit: () => void;
  onMore: () => void;
  busy: boolean;
  typeLabels: Record<string, string>;
}) {
  // 是否全部答完基于全部题目（而非当前过滤视图）；answers 以原始下标为 key
  const allAnswered = allQuestions.length > 0 && allQuestions.every((_, i) => !!answers[i]);
  // 只有选项正常的选择题参与红绿判分/计分（与 DocUploadCard 的 isGradableMC
  // 同口径）：填空/简答及选项畸形的文本回退题措辞不同即误判（"0.5" vs "0.50"、
  // 多一个空格都判错 → 正确答案被记进错题本），只展示参考答案对照。
  const isGradableMC = (q: PracticeQuestion) =>
    (q.questionType || 'multiple_choice') === 'multiple_choice' && !!q.options && q.options.length > 0;
  const mcCount = questions.filter(({ q }) => isGradableMC(q)).length;
  const correctCount = questions.filter(
    ({ q, originalIdx }) => isGradableMC(q) && answers[originalIdx] && q.answer && answers[originalIdx] === q.answer,
  ).length;

  return (
    <div>
      {submitted && mcCount > 0 && (
        <div className="mb-3 text-sm">
          <span
            className={
              correctCount === mcCount
                ? 'text-emerald-600 font-medium'
                : correctCount > 0
                  ? 'text-amber-600 font-medium'
                  : 'text-rose-600 font-medium'
            }
          >
            得分 {correctCount}/{mcCount}
          </span>
        </div>
      )}
      <div className="space-y-3">
        {questions.map(({ q, originalIdx: qi }) => {
          const userAns = answers[qi];
          const qType = q.questionType || 'multiple_choice';
          const isMC = qType === 'multiple_choice';
          const isFill = qType === 'fill_blank';
          const isShort = qType === 'short_answer';
          // options 畸形（缺失/为空）的选择题回退为文本作答：否则不渲染
          // 任何作答控件 → allAnswered 永 false → 提交按钮永久禁用（死锁）。
          // DocUploadCard 已修过同款问题（mcFallbackText），本页是漏改副本。
          const mcFallback = isMC && (!q.options || q.options.length === 0);
          // 只有选项正常的选择题参与 exact-match 判分（红绿高亮/计分/错题收录）；
          // 填空/简答/文本回退题只展示答案对照（与 DocUploadCard 同口径）
          const gradable = isMC && !mcFallback;
          const correct = gradable && submitted && userAns && userAns === q.answer;
          const wrong = gradable && submitted && userAns && userAns !== q.answer;

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
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                  {typeLabels[qType] || qType}
                </span>
                <span className="text-xs text-slate-400">第 {qi + 1} 题</span>
              </div>
              <div className="text-sm font-medium text-slate-800 mb-2">
                <LatexText text={q.stem || ''} />
              </div>

              {isMC && q.options && q.options.length > 0 ? (
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
                          name={`doc-detail-q-${qi}`}
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
              ) : mcFallback && !submitted ? (
                <input
                  type="text"
                  value={userAns || ''}
                  onChange={(e) => onAnswer(qi, e.target.value)}
                  placeholder="输入你的答案..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none"
                />
              ) : mcFallback && submitted ? (
                <div className="text-sm">
                  <span className="text-slate-500">你的答案：</span>
                  <span className="text-slate-700">{userAns || '（未作答）'}</span>
                  {q.answer && (
                    <>
                      <span className="text-slate-400 mx-1">|</span>
                      <span className="text-emerald-700 font-medium">
                        参考: {q.answer}
                      </span>
                    </>
                  )}
                </div>
              ) : isFill && !submitted ? (
                <input
                  type="text"
                  value={userAns || ''}
                  onChange={(e) => onAnswer(qi, e.target.value)}
                  placeholder="输入你的答案..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none"
                />
              ) : isFill && submitted ? (
                <div className="text-sm">
                  <span className="text-slate-500">你的答案：</span>
                  <span className="text-slate-700">
                    {userAns || '（未作答）'}
                  </span>
                  {q.answer && (
                    <>
                      <span className="text-slate-400 mx-1">|</span>
                      <span className="text-emerald-700 font-medium">
                        参考: {q.answer}
                      </span>
                    </>
                  )}
                </div>
              ) : isShort && !submitted ? (
                <textarea
                  value={userAns || ''}
                  onChange={(e) => onAnswer(qi, e.target.value)}
                  placeholder="输入你的答案..."
                  rows={3}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none resize-y"
                />
              ) : isShort && submitted ? (
                <div className="text-sm">
                  <div className="mb-1">
                    <span className="text-slate-500">你的答案：</span>
                    <span className="text-slate-700">
                      {userAns || '（未作答）'}
                    </span>
                  </div>
                  {q.answer && (
                    <div className="p-2 bg-white/60 rounded-md">
                      <span className="text-xs text-slate-500">参考答案：</span>
                      <span className="text-sm text-emerald-700">{q.answer}</span>
                    </div>
                  )}
                </div>
              ) : null}

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
