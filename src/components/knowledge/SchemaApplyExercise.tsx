'use client';

import { authFetch } from '@/lib/auth';
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/errors';
import { LatexText } from '@/components/ui/LatexText';

interface SchemaApplyExerciseProps {
  schemaId: string;
  schemaName: string;
  schemaDescription?: string | null;
  schemaData?: {
    schemaType?: string;
    keyInsights?: string[];
    applicationScope?: string;
    typicalExample?: string;
    transferHints?: string;
  } | null;
  memberCount?: number;
  onComplete?: (score: number) => void;
  onClose?: () => void;
}

interface ProblemSetup {
  problemTitle: string;
  problemDescription: string;
  schemaApplies: string;
  steps: { step: number; label: string; description: string }[];
}

interface StepFeedback {
  step: number;
  status: 'correct' | 'partially-correct' | 'incorrect';
  explanation: string;
  score: number; // 0-100 per step
}

interface CheckResult {
  stepFeedbacks: StepFeedback[];
  overallScore: number;
  overallComment: string;
}

interface ApiErrorResponse {
  error?: string;
}

export function SchemaApplyExercise({
  schemaId,
  schemaName,
  schemaDescription,
  schemaData,
  memberCount,
  onComplete,
  onClose,
}: SchemaApplyExerciseProps) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'submitted' | 'complete'>('loading');
  const [problemSetup, setProblemSetup] = useState<ProblemSetup | null>(null);
  const [stepAnswers, setStepAnswers] = useState<Record<string, string>>({});
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(true);
  const [showExpected, setShowExpected] = useState<Record<string, boolean>>({});

  const generateProblem = useCallback(async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await authFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-schema-problem',
          schemaId,
          schemaName,
          schemaDescription,
          schemaData,
          memberCount,
        }),
      });

      const data = await res.json() as ProblemSetup & ApiErrorResponse;
      if (!res.ok) {
        throw new Error(data.error || '生成题目失败');
      }

      setProblemSetup(data);
      setPhase('ready');
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }, [memberCount, schemaData, schemaDescription, schemaId, schemaName]);

  // Generate problem on mount
  useEffect(() => {
    queueMicrotask(() => {
      void generateProblem();
    });
  }, [generateProblem]);

  const handleSubmit = async () => {
    // Validate all steps are filled
    if (!problemSetup) return;
    const missingSteps = problemSetup.steps.filter(
      (s) => !stepAnswers[`step-${s.step}`]?.trim()
    );
    if (missingSteps.length > 0) {
      setError(`请填写所有步骤（第${missingSteps[0].step}步为空）`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await authFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check-schema-apply',
          schemaId,
          schemaName,
          problemTitle: problemSetup.problemTitle,
          problemDescription: problemSetup.problemDescription,
          steps: problemSetup.steps.map((s) => ({
            step: s.step,
            label: s.label,
            description: s.description,
            answer: stepAnswers[`step-${s.step}`] || '',
          })),
        }),
      });

      const data = await res.json() as CheckResult & ApiErrorResponse;
      if (!res.ok) {
        throw new Error(data.error || '验证失败');
      }

      setCheckResult(data);
      setPhase('submitted');
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setStepAnswers({});
    setCheckResult(null);
    setShowExpected({});
    setPhase('ready');
    setError('');
    void generateProblem();
  };

  const handleComplete = () => {
    onComplete?.(checkResult?.overallScore ?? 0);
  };

  // ── Status badge ──
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'correct':
        return { label: '正确', className: 'bg-emerald-100 text-emerald-700' };
      case 'partially-correct':
        return { label: '部分正确', className: 'bg-amber-100 text-amber-700' };
      case 'incorrect':
        return { label: '不正确', className: 'bg-red-100 text-red-700' };
      default:
        return { label: status, className: 'bg-slate-100 text-slate-500' };
    }
  };

  const getStepScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500';
    if (score >= 50) return 'text-amber-500';
    return 'text-red-500';
  };

  const getOverallColor = (score: number) => {
    if (score >= 80) return 'from-emerald-500 to-green-500 shadow-emerald-500/25';
    if (score >= 60) return 'from-amber-500 to-orange-500 shadow-amber-500/25';
    if (score >= 40) return 'from-orange-500 to-red-500 shadow-orange-500/25';
    return 'from-red-500 to-rose-500 shadow-red-500/25';
  };

  // ── Loading/generating state ──
  if (phase === 'loading' && generating) {
    return (
      <Card>
        <div className="space-y-4 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-200 rounded-lg" />
            <div className="h-5 w-36 bg-slate-200 rounded" />
          </div>
          <div className="h-4 w-64 bg-slate-100 rounded" />
          <div className="h-28 bg-slate-100 rounded-xl" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error && !problemSetup) {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="text-red-500 mb-2">
            <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Button variant="secondary" onClick={generateProblem}>
            重试
          </Button>
        </div>
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

  // ── Complete state ──
  if (phase === 'complete') {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/25 mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">图式应用练习完成</h3>
          <p className="text-sm text-slate-500 mt-1">
            图式: {schemaName}
          </p>
          <div className="mt-3">
            <span className={`text-2xl font-bold ${checkResult ? 'text-indigo-600' : 'text-slate-400'}`}>
              {checkResult?.overallScore ?? '-'}%
            </span>
          </div>
          <div className="flex gap-2 justify-center mt-5">
            <Button variant="secondary" onClick={onClose}>
              返回
            </Button>
            <Button onClick={handleRetry}>再做一题</Button>
          </div>
        </div>
      </Card>
    );
  }

  // ── Ready / Submitted state ──
  return (
    <Card>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shadow-indigo-500/20">
              🔗
            </div>
            <h3 className="font-semibold text-slate-800 text-[15px]">
              图式应用练习
            </h3>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            应用知识图式解决新问题，检验迁移能力
          </p>
        </div>

        {/* Schema info banner */}
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl p-4 border border-indigo-100/60">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🧠</span>
            <span className="font-semibold text-slate-800 text-sm">{schemaName}</span>
          </div>
          {schemaDescription && (
            <p className="text-sm text-slate-600 leading-relaxed mb-2">{schemaDescription}</p>
          )}
          {schemaData?.schemaType && (
            <span className="inline-block px-2 py-0.5 bg-white/60 text-indigo-600 text-xs rounded-full font-medium">
              {schemaData.schemaType}
            </span>
          )}
          {schemaData?.keyInsights && schemaData.keyInsights.length > 0 && (
            <div className="mt-2.5 space-y-1">
              <p className="text-xs text-indigo-500 font-medium">核心洞见:</p>
              <ul className="space-y-0.5">
                {schemaData.keyInsights.map((ki, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>{ki}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Problem presentation */}
        {problemSetup && (
          <>
            <div className="bg-white border border-slate-200/80 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-xs rounded-full font-medium">
                  新问题
                </span>
                <span className="text-xs text-slate-400">
                  {problemSetup.problemTitle}
                </span>
              </div>
              {/* LatexText 根元素是 div，不能套在 <p> 里（非法嵌套 → hydration 报错） */}
              <LatexText text={problemSetup.problemDescription} className="text-sm text-slate-700 leading-relaxed" />
            </div>

            {/* Schema selection (pre-filled) */}
            <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-100/60">
              <label className="text-sm font-medium text-slate-700 block mb-1.5">
                应使用哪个图式？
              </label>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span className="text-sm font-semibold text-emerald-700">
                  {problemSetup.schemaApplies}
                </span>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">
                按图式步骤解决此问题:
              </p>
              {problemSetup.steps.map((step) => {
                const feedback =
                  checkResult?.stepFeedbacks.find((f) => f.step === step.step) ?? null;
                const isRevealed = showExpected[`step-${step.step}`] ?? false;
                const answer = stepAnswers[`step-${step.step}`] || '';

                return (
                  <div
                    key={step.step}
                    className={`rounded-xl border p-4 transition-colors ${
                      feedback
                        ? feedback.status === 'correct'
                          ? 'bg-emerald-50/40 border-emerald-200/60'
                          : feedback.status === 'partially-correct'
                          ? 'bg-amber-50/40 border-amber-200/60'
                          : 'bg-red-50/40 border-red-200/60'
                        : 'bg-slate-50/60 border-slate-200/60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                          feedback
                            ? feedback.status === 'correct'
                              ? 'bg-emerald-100 text-emerald-600'
                              : feedback.status === 'partially-correct'
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-red-100 text-red-600'
                            : 'bg-indigo-100 text-indigo-600'
                        }`}
                      >
                        {step.step}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 mb-1">
                          第{step.step}步: {step.label}
                        </p>
                        <LatexText text={step.description} className="text-xs text-slate-500 mb-2.5" />

                        {!feedback ? (
                          <textarea
                            value={answer}
                            onChange={(e) => {
                              setStepAnswers((prev) => ({
                                ...prev,
                                [`step-${step.step}`]: e.target.value,
                              }));
                              if (error) setError('');
                            }}
                            placeholder={`输入第${step.step}步的具体操作...`}
                            rows={3}
                            className="w-full rounded-lg border border-slate-200/80 px-3 py-2 text-sm resize-none bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-300"
                            disabled={phase === 'submitted'}
                          />
                        ) : (
                          <div className="space-y-2">
                            {/* Student answer */}
                            <div className="bg-white/80 rounded-lg p-2.5 border border-slate-100">
                              <p className="text-xs text-slate-400 mb-0.5">你的回答</p>
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{answer}</p>
                            </div>

                            {/* Feedback */}
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                  getStatusBadge(feedback.status).className
                                }`}
                              >
                                {getStatusBadge(feedback.status).label}
                              </span>
                              <span
                                className={`text-xs font-bold ${getStepScoreColor(feedback.score)}`}
                              >
                                {feedback.score}/100
                              </span>
                            </div>
                            <LatexText text={feedback.explanation} className="text-sm text-slate-600 leading-relaxed" />

                            {/* Show expected answer toggle */}
                            {feedback.status !== 'correct' && (
                              <button
                                onClick={() =>
                                  setShowExpected((prev) => ({
                                    ...prev,
                                    [`step-${step.step}`]: !isRevealed,
                                  }))
                                }
                                className="text-xs text-indigo-500 hover:text-indigo-600 transition-colors font-medium"
                              >
                                {isRevealed ? '隐藏参考答案' : '查看参考答案'}
                              </button>
                            )}
                            {isRevealed && (
                              <div className="bg-indigo-50/80 rounded-lg p-2.5 border border-indigo-100/60">
                                <p className="text-xs text-indigo-500 font-medium mb-0.5">
                                  参考答案
                                </p>
                                <p className="text-sm text-slate-700">{step.description}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50/80 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Overall result (submitted only) */}
            {checkResult && (
              <div className="bg-gradient-to-br from-indigo-50/80 to-violet-50/80 rounded-xl p-5 border border-indigo-100/60">
                <div className="flex items-center gap-4 mb-3">
                  <div
                    className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${getOverallColor(checkResult.overallScore)} text-white shadow-lg`}
                  >
                    <span className="text-lg font-bold">{checkResult.overallScore}%</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {checkResult.overallScore >= 80
                        ? '图式应用优秀！'
                        : checkResult.overallScore >= 60
                        ? '基本掌握，继续努力'
                        : checkResult.overallScore >= 40
                        ? '需要更多练习'
                        : '建议重新学习图式'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      综合评分
                    </p>
                  </div>
                </div>
                {checkResult.overallComment && (
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {checkResult.overallComment}
                  </p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-1">
              {phase === 'ready' ? (
                <>
                  <div />
                  <div className="flex gap-2">
                    {onClose && (
                      <Button variant="ghost" onClick={onClose}>
                        关闭
                      </Button>
                    )}
                    <Button onClick={handleSubmit} loading={loading}>
                      AI 验证
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex gap-2 w-full justify-between">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={handleRetry}>
                      再做一题
                    </Button>
                    {checkResult && checkResult.overallScore < 80 && (
                      <Button variant="ghost" onClick={() => {
                        setCheckResult(null);
                        setShowExpected({});
                        setPhase('ready');
                      }}>
                        重新作答
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {onClose && (
                      <Button variant="ghost" onClick={onClose}>
                        关闭
                      </Button>
                    )}
                    <Button onClick={handleComplete}>
                      完成
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {onClose && !error && (
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
