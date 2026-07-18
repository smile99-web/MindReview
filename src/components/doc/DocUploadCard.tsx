'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LatexText } from '@/components/ui/LatexText';

// ── types ────────────────────────────────────────────────────────────────
interface KnowledgePointItem {
  title?: string;
  summary?: string;
  keywords?: string[];
  difficulty?: number;
  icapLevel?: string;
}

interface PracticeQuestionItem {
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
  knowledgePoints?: { nodes?: KnowledgePointItem[] };
  practiceQuestions?: PracticeQuestionItem[];
  createdAt: string;
}

type Phase =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'practicing'
  | 'reviewing'
  | 'icap-creating';

// ── DocUploadCard ─────────────────────────────────────────────────────────
export function DocUploadCard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<DocData | null>(null);
  const [history, setHistory] = useState<DocData[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, string>>({});
  const [practiceSubmitted, setPracticeSubmitted] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [contentExpanded, setContentExpanded] = useState(false);
  const [subjectInput, setSubjectInput] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch('/api/doc/list');
        if (!res.ok) return;
        const data = (await res.json()) as { docs: DocData[] };
        setHistory(data.docs || []);
      } catch { /* silent */ }
    })();
  }, []);

  useEffect(() => () => {
    setPracticeAnswers({});
    setPracticeSubmitted(false);
  }, [doc?.id]);

  // ── handlers ──────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setError('');
    setPhase('uploading');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/doc/upload', { method: 'POST', body: fd });
      const data = (await res.json()) as DocData & { error?: string };
      if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`);
      setDoc(data);
      setContentExpanded(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '上传失败'));
    } finally {
      setPhase('idle');
    }
  };

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
        questions?: PracticeQuestionItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `出题失败 (${res.status})`);
      setDoc((prev) =>
        prev ? { ...prev, practiceQuestions: data.questions } : prev,
      );
      setPhase('reviewing');
      setPracticeSubmitted(false);
      setPracticeAnswers({});
    } catch (err: unknown) {
      setError(getErrorMessage(err, '出题失败'));
      setPhase('idle');
    }
  };

  const handleStartIcap = async () => {
    if (!doc) return;
    setError('');
    setPhase('icap-creating');
    try {
      const res = await authFetch(`/api/doc/${doc.id}/create-node`, {
        method: 'POST',
      });
      const data = (await res.json()) as { nodeId?: string; error?: string };
      if (!res.ok || !data.nodeId) throw new Error(data.error || '启动失败');
      router.push(`/cards/${data.nodeId}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '启动 ICAP 训练失败'));
      setPhase('idle');
    }
  };

  const handleReset = () => {
    setDoc(null);
    setError('');
    setPhase('idle');
    setPracticeAnswers({});
    setPracticeSubmitted(false);
    setContentExpanded(false);
    setSubjectInput('');
  };

  const handlePickHistory = async (d: DocData) => {
    // Fetch full doc content from the server (history list doesn't include it)
    try {
      const res = await authFetch(`/api/doc/${d.id}`);
      if (!res.ok) return;
      const full = (await res.json()) as DocData;
      setDoc(full);
      setShowHistory(false);
      setError('');
      setPhase(
        full.practiceQuestions && full.practiceQuestions.length > 0
          ? 'reviewing'
          : 'idle',
      );
      setSubjectInput(full.subjectName || '');
    } catch { /* silent */ }
  };

  // ── derived ────────────────────────────────────────────────────────────
  const knowledgePoints = (doc?.knowledgePoints?.nodes || []) as KnowledgePointItem[];
  const allQuestions = (doc?.practiceQuestions || []) as PracticeQuestionItem[];
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

  const typeLabels: Record<string, string> = {
    multiple_choice: '选择题',
    fill_blank: '填空题',
    short_answer: '问答题',
  };

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 tracking-tight text-[15px]">
            📄 文件出题
          </h3>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs text-slate-500 hover:text-indigo-600 transition-colors"
            >
              {showHistory ? '收起历史' : `历史 (${history.length})`}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          上传 .docx 或 .txt 文件，AI 自动提取知识点，出选择/填空/问答三种题型
        </p>
      </CardHeader>

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div className="mb-3 p-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50">
          {history.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => void handlePickHistory(h)}
              className="w-full text-left p-2 rounded-md hover:bg-white transition-colors"
            >
              <div className="text-xs font-medium text-slate-800 truncate">
                {h.fileName} {h.subjectName && `· ${h.subjectName}`}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {new Date(h.createdAt).toLocaleString('zh-CN')}
              </div>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-3 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {!doc ? (
        /* ── upload prompt ── */
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
          >
            <div className="text-3xl mb-2">📄</div>
            <p className="text-sm text-slate-700 font-medium">
              点击或拖拽上传文件
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              支持 .docx 和 .txt 格式，最大 10MB
            </p>
          </div>
        </div>
      ) : (
        /* ── loaded state ── */
        <div>
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-slate-800">
                📎 {doc.fileName}
              </span>
              {doc.subjectName && (
                <span className="ml-2 text-xs text-slate-500">
                  {doc.subjectName}
                </span>
              )}
              <span className="ml-2 text-[10px] text-slate-400">
                {doc.content.length} 字符
              </span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-500 hover:text-rose-500 transition-colors shrink-0"
            >
              ↻ 重新上传
            </button>
          </div>

          {/* Content preview */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setContentExpanded((v) => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              {contentExpanded ? '收起内容预览 ▲' : '展开内容预览 ▼'}
            </button>
            {contentExpanded && (
              <div className="mt-1.5 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {doc.content.slice(0, 500)}
                {doc.content.length > 500 && (
                  <span className="text-slate-400"> …（截断显示）</span>
                )}
              </div>
            )}
          </div>

          {/* Subject guess input */}
          <div className="mb-3 flex items-center gap-2">
            <label className="text-xs text-slate-500 shrink-0">学科：</label>
            <input
              type="text"
              value={subjectInput}
              onChange={(e) => setSubjectInput(e.target.value)}
              placeholder="留空由 AI 推断，或手动填入"
              className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none"
            />
          </div>

          {/* Step 2: analyze */}
          {knowledgePoints.length === 0 && (
            <div className="mb-3 flex justify-end">
              <Button
                size="sm"
                onClick={handleAnalyze}
                loading={phase === 'analyzing'}
                disabled={phase === 'analyzing'}
              >
                {phase === 'analyzing' ? '拆解中...' : '🔍 分析知识点'}
              </Button>
            </div>
          )}

          {/* Knowledge points */}
          {knowledgePoints.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                提取的知识点
                <span className="text-[10px] font-normal text-slate-400 normal-case tracking-normal">
                  ({knowledgePoints.length} 个)
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {knowledgePoints.map((kp, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-gradient-to-br from-indigo-50/60 to-white rounded-lg border border-indigo-100"
                  >
                    <div className="flex items-start gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">
                          {kp.title}
                        </div>
                        {kp.summary && (
                          <div className="text-xs text-slate-600 mt-0.5">
                            <LatexText text={kp.summary} />
                          </div>
                        )}
                        {(kp.keywords || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(kp.keywords || []).slice(0, 4).map((kw, j) => (
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
              </div>
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
          )}

          {/* Practice questions */}
          {allQuestions.length > 0 && (
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
                const wrongs = allQuestions
                  .filter((q, i) => {
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
              typeFilter={typeFilter}
              onChangeFilter={setTypeFilter}
              typeCounts={typeCounts}
              typeLabels={typeLabels}
            />
          )}
        </div>
      )}

      {phase === 'uploading' && (
        <div className="mt-3 text-center text-xs text-slate-500">
          上传并解析中...
        </div>
      )}
    </Card>
  );
}

// ── PracticeSession ───────────────────────────────────────────────────────
function PracticeSession({
  questions,
  allQuestions,
  answers,
  submitted,
  onAnswer,
  onSubmit,
  onMore,
  typeFilter,
  onChangeFilter,
  typeCounts,
  typeLabels,
}: {
  questions: Array<{ q: PracticeQuestionItem; originalIdx: number }>;
  allQuestions: PracticeQuestionItem[];
  answers: Record<number, string>;
  submitted: boolean;
  onAnswer: (idx: number, val: string) => void;
  onSubmit: () => void;
  onMore: () => void;
  typeFilter: string;
  onChangeFilter: (v: string) => void;
  typeCounts: Record<string, number>;
  typeLabels: Record<string, string>;
}) {
  // 是否全部答完基于全部题目（而非当前过滤视图）；answers 以原始下标为 key
  const allAnswered = allQuestions.length > 0 && allQuestions.every((_, i) => !!answers[i]);
  const correctCount = questions.filter(
    ({ q, originalIdx }) => answers[originalIdx] && q.answer && answers[originalIdx] === q.answer,
  ).length;

  return (
    <div className="mb-3">
      {/* Type filter tabs + score */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          练习题
        </span>
        <button
          type="button"
          onClick={() => onChangeFilter('')}
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
            onClick={() => onChangeFilter(type)}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
              typeFilter === type
                ? 'bg-indigo-100 text-indigo-700 font-medium'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {typeLabels[type] || type} ({count})
          </button>
        ))}
        {submitted && (
          <span
            className={`ml-auto text-[10px] font-medium ${
              correctCount === questions.length
                ? 'text-emerald-600'
                : correctCount > 0
                  ? 'text-amber-600'
                  : 'text-rose-600'
            }`}
          >
            {correctCount}/{questions.length} 正确
          </span>
        )}
      </div>

      {questions.length === 0 && (
        <p className="text-xs text-slate-400 py-2">该题型暂无题目</p>
      )}

      <div className="space-y-3">
        {questions.map(({ q, originalIdx: qi }) => {
          const userAns = answers[qi];
          const correct = submitted && userAns && userAns === q.answer;
          const wrong = submitted && userAns && userAns !== q.answer;
          const qType = q.questionType || 'multiple_choice';
          const isMC = qType === 'multiple_choice';
          const isFill = qType === 'fill_blank';
          const isShort = qType === 'short_answer';

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

              {/* Multiple choice */}
              {isMC && q.options && q.options.length > 0 && (
                <div className="space-y-1.5">
                  {q.options.map((opt, j) => {
                    const optVal = opt.label || opt.text || String(j);
                    const isUserChoice = userAns === optVal;
                    const isCorrectChoice = submitted && q.answer === optVal;
                    return (
                      <label
                        key={j}
                        className={`flex items-start gap-2 p-2 rounded-md cursor-pointer text-xs hover:bg-slate-50 ${
                          isUserChoice && !submitted
                            ? 'bg-indigo-50/40'
                            : isCorrectChoice
                              ? 'bg-emerald-100/50'
                              : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name={`doc-q-${qi}`}
                          value={optVal}
                          checked={isUserChoice}
                          disabled={submitted}
                          onChange={() => onAnswer(qi, optVal)}
                          className="mt-0.5"
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
              )}

              {/* Fill blank */}
              {isFill && !submitted && (
                <input
                  type="text"
                  value={userAns || ''}
                  onChange={(e) => onAnswer(qi, e.target.value)}
                  placeholder="输入你的答案..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none"
                />
              )}
              {isFill && submitted && (
                <div className="text-sm">
                  <span className="text-slate-500">你的答案：</span>
                  <span className={correct ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
                    {userAns || '（未作答）'}
                  </span>
                  {q.answer && (
                    <>
                      <span className="text-slate-400 mx-1">|</span>
                      <span className="text-emerald-700 font-medium">
                        正确: {q.answer}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Short answer */}
              {isShort && !submitted && (
                <textarea
                  value={userAns || ''}
                  onChange={(e) => onAnswer(qi, e.target.value)}
                  placeholder="输入你的答案..."
                  rows={3}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none resize-y"
                />
              )}
              {isShort && submitted && (
                <div className="text-sm">
                  <div className="mb-1">
                    <span className="text-slate-500">你的答案：</span>
                    <span className={correct ? 'text-emerald-700 font-medium' : 'text-rose-700 font-medium'}>
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
              )}

              {/* Explanation (shown after submit) */}
              {submitted && q.explanation && (
                <div className="mt-2 text-[11px] text-slate-600 bg-white/60 rounded-md p-2">
                  <span className="font-semibold text-slate-700">解析：</span>
                  <LatexText text={q.explanation} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2 justify-end">
        {submitted ? (
          <Button size="sm" variant="ghost" onClick={onMore}>
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
