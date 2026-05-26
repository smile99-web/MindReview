'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface IcapPipelineProps {
  knowledgeNodeId: string;
  knowledgeNodeTitle: string;
  onComplete?: (results: IcapResults) => void;
  onClose?: () => void;
}

interface IcapResults {
  passive: { completed: boolean; durationMs: number };
  active: { completed: boolean; score: number; durationMs: number };
  constructive: { completed: boolean; response: string; durationMs: number };
  interactive: { completed: boolean; responses: number; durationMs: number };
}

interface Question {
  id: string;
  stem: string;
  options?: Array<{ label: string; text: string }>;
  answer: string;
  explanation?: string;
  questionType: string;
  icapLevel: string;
  difficulty: number;
}

interface KnowledgeNodeDetail {
  title: string;
  summary?: string | null;
  keywords?: string[];
}

const STAGES = [
  { key: 'passive' as const, label: '阅读理解', description: '阅读知识点，建立初步印象', icon: '📖', color: 'from-slate-500 to-slate-600' },
  { key: 'active' as const, label: '主动回忆', description: '完成练习题，检验记忆', icon: '✏️', color: 'from-blue-500 to-blue-600' },
  { key: 'constructive' as const, label: '构建理解', description: '用自己的话总结规律', icon: '🏗️', color: 'from-emerald-500 to-emerald-600' },
  { key: 'interactive' as const, label: '互动深化', description: 'AI追问，变式练习', icon: '🤖', color: 'from-purple-500 to-purple-600' },
];

export function IcapPipeline({ knowledgeNodeId, knowledgeNodeTitle, onComplete, onClose }: IcapPipelineProps) {
  const [stage, setStage] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [userSummary, setUserSummary] = useState('');
  const [showAnswer, setShowAnswer] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<IcapResults>({
    passive: { completed: false, durationMs: 0 },
    active: { completed: false, score: 0, durationMs: 0 },
    constructive: { completed: false, response: '', durationMs: 0 },
    interactive: { completed: false, responses: 0, durationMs: 0 },
  });
  const [startTime, setStartTime] = useState(() => Date.now());
  const [activeAnswers, setActiveAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [node, setNode] = useState<KnowledgeNodeDetail | null>(null);

  useEffect(() => {
    fetch(`/api/knowledge/${knowledgeNodeId}`)
      .then(r => r.json())
      .then(setNode)
      .catch(() => {});
  }, [knowledgeNodeId]);

  const recordStageTime = useCallback((stageKey: keyof IcapResults) => {
    const durationMs = Date.now() - startTime;
    setResults(prev => ({
      ...prev,
      [stageKey]: { ...prev[stageKey], completed: true, durationMs },
    }));
  }, [startTime]);

  const goToStage = async (idx: number) => {
    recordStageTime(STAGES[stage].key);
    setStage(idx);
    setStartTime(Date.now());

    if (idx === 1) {
      // Active stage - load questions
      setLoading(true);
      try {
        const res = await fetch(`/api/practice?knowledgeNodeId=${knowledgeNodeId}&icapLevel=Active&count=3`);
        const data = await res.json();
        setQuestions(data.questions || []);
      } catch { /* ignore */ }
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async (questionId: string, userAnswer: string) => {
    try {
      const res = await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userAnswer }),
      });
      const data = await res.json();
      setShowAnswer(prev => ({ ...prev, [questionId]: true }));
      setSubmitted(prev => ({ ...prev, [questionId]: true }));

      setResults(prev => ({
        ...prev,
        active: {
          ...prev.active,
          score: prev.active.score + (data.isCorrect ? 1 : 0),
        },
      }));
    } catch { /* ignore */ }
  };

  const handleSubmitSummary = () => {
    recordStageTime('constructive');
    setResults(prev => ({
      ...prev,
      constructive: { ...prev.constructive, response: userSummary },
    }));
    goToStage(3);
  };

  const allDone = stage === 3 && results.interactive.completed;

  if (allDone) {
    const totalScore = results.active.score;
    return (
      <Card>
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-lg shadow-emerald-500/25 mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">ICAP训练完成!</h3>
          <p className="text-sm text-slate-500 mt-1">知识点: {knowledgeNodeTitle}</p>
          <div className="grid grid-cols-2 gap-3 mt-4 max-w-xs mx-auto">
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-xs text-slate-500">练习得分</div>
              <div className="text-lg font-bold text-indigo-600">{totalScore}/{questions.length || '-'}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-xs text-slate-500">构建总结</div>
              <div className="text-sm text-emerald-600 font-medium">{userSummary ? '已提交' : '未完成'}</div>
            </div>
          </div>
          <div className="flex gap-2 justify-center mt-5">
            <Button variant="secondary" onClick={onClose}>返回</Button>
            <Button onClick={() => onComplete?.(results)}>查看结果</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-6">
        {STAGES.map((s, i) => (
          <div key={s.key} className="flex-1 flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < stage
                  ? 'bg-emerald-100 text-emerald-600'
                  : i === stage
                  ? 'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-300'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {i < stage ? '✓' : s.icon}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 text-center leading-tight">{s.label}</span>
          </div>
        ))}
      </div>

      <h3 className="text-lg font-bold text-slate-800 mb-1">{knowledgeNodeTitle}</h3>
      <p className="text-sm text-slate-500 mb-4">{STAGES[stage].description}</p>

      {/* Stage 0: Passive */}
      {stage === 0 && node && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-5 border border-indigo-100/60">
            <h4 className="font-semibold text-slate-800 mb-2">{node.title}</h4>
            <p className="text-sm text-slate-600 leading-relaxed">{node.summary || '暂无摘要'}</p>
            {(node.keywords?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {node.keywords?.map((kw: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-white/80 text-indigo-600 text-xs rounded-full font-medium">
                    #{kw}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">阅读完成后点击下一步</span>
            <Button onClick={() => goToStage(1)}>已阅读，下一步</Button>
          </div>
        </div>
      )}

      {/* Stage 1: Active */}
      {stage === 1 && (
        <div className="space-y-4">
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl" />)}
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500">暂无练习题</p>
              <Button className="mt-3" variant="secondary" onClick={() => goToStage(2)}>跳过，下一步</Button>
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="bg-white border border-slate-200/60 rounded-xl p-4">
                <div className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 font-medium mb-3">{q.stem}</p>

                    {!submitted[q.id] ? (
                      <>
                        {q.options ? (
                          <div className="space-y-1.5 mb-3">
                            {q.options.map((opt, j) => (
                              <label key={j} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                                <input
                                  type="radio"
                                  name={`q-${q.id}`}
                                  value={opt.text}
                                  onChange={e => setActiveAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                  className="text-indigo-600"
                                />
                                <span className="text-xs font-semibold text-slate-400">{opt.label}.</span>
                                <span className="text-slate-700">{opt.text}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder="输入你的答案..."
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                            onChange={e => setActiveAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          />
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleSubmitAnswer(q.id, activeAnswers[q.id] || '')}
                          disabled={!activeAnswers[q.id]}
                        >
                          提交
                        </Button>
                      </>
                    ) : (
                      <div className={`p-3 rounded-lg text-sm ${showAnswer[q.id] ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50'}`}>
                        <p className="font-semibold text-emerald-800">答案: {q.answer}</p>
                        {q.explanation && <p className="text-emerald-700/80 mt-1 text-xs">{q.explanation}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {!loading && (
            <div className="flex justify-end">
              <Button onClick={() => goToStage(2)}>下一步</Button>
            </div>
          )}
        </div>
      )}

      {/* Stage 2: Constructive */}
      {stage === 2 && (
        <div className="space-y-4">
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100/60">
            <p className="text-sm text-amber-800 font-medium">请用自己的话总结这个知识点</p>
            <p className="text-xs text-amber-600/80 mt-1">可以包括：核心概念、关键公式、解题思路、与其他知识的联系</p>
          </div>
          <textarea
            className="w-full min-h-[120px] px-4 py-3 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            placeholder="我理解的这个知识点是..."
            value={userSummary}
            onChange={e => setUserSummary(e.target.value)}
          />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => goToStage(1)}>返回上一步</Button>
            <Button onClick={handleSubmitSummary} disabled={!userSummary.trim()}>提交总结</Button>
          </div>
        </div>
      )}

      {/* Stage 3: Interactive */}
      {stage === 3 && (
        <div className="space-y-4">
          <div className="bg-purple-50 rounded-xl p-5 border border-purple-100/60 text-center">
            <p className="text-purple-800 font-medium">AI互动深化环节</p>
            <p className="text-sm text-purple-600/80 mt-1">
              AI会根据你的回答生成追问和变式题，帮助你深入理解。
            </p>
            <div className="mt-4 space-y-3">
              <div className="bg-white rounded-lg p-3 text-left text-sm border border-purple-100/60">
                <p className="text-slate-700 font-medium">追问1: 你能举一个生活中用到{knowledgeNodeTitle}的例子吗？</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-left text-sm border border-purple-100/60">
                <p className="text-slate-700 font-medium">追问2: 如果条件变了，这个结论还成立吗？为什么？</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setResults(prev => ({
                  ...prev,
                  interactive: { ...prev.interactive, responses: prev.interactive.responses + 1 },
                }));
              }}
            >
              已思考完毕
            </Button>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => goToStage(2)}>返回上一步</Button>
            <Button onClick={() => {
              recordStageTime('interactive');
              setResults(prev => ({ ...prev, interactive: { ...prev.interactive, completed: true } }));
            }}>
              完成训练
            </Button>
          </div>
        </div>
      )}

      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          ✕
        </button>
      )}
    </Card>
  );
}
