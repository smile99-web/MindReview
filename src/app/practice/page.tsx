'use client';

import { authFetch } from '@/lib/auth';
import { Suspense, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { LatexText } from '@/components/ui/LatexText';
import { IcapPipeline } from '@/components/practice/IcapPipeline';
import { DensityProvider, useDensity } from '@/components/ui/DensityProvider';
import { useUserId } from '@/components/auth/AuthProvider';
import { getHintLevel, HINT_LEVEL_LABELS, HINT_LEVEL_DESCRIPTIONS } from '@/lib/sm2';
import type { HintLevel } from '@/lib/sm2';
import type { ActionableStep } from '@/lib/learner-model';

interface PracticeNode {
  id: string;
  title: string;
  masteryLevel: number;
  repetitions?: number | null;
  subject?: {
    name?: string | null;
  } | null;
}

interface PracticeQuestionOption {
  label: string;
  text?: string;
}

interface PracticeQuestion {
  id?: string;
  stem?: string;
  options?: PracticeQuestionOption[];
  answer?: string;
  explanation?: string;
  difficulty?: number;
  icapLevel?: string;
}

interface KnowledgeResponse {
  nodes?: PracticeNode[];
}

interface QuestionResponse {
  questions?: PracticeQuestion[];
  error?: string;
  detail?: string;
}

interface PracticeSubmitResponse {
  isCorrect?: boolean;
  quality?: number;
  score?: number | null;
  feedback?: string;
  gradingSource?: 'ai' | 'rule' | 'self';
  correctAnswer?: string;
  explanation?: string | null;
  masteryChange?: {
    before: number;
    after: number;
    delta: number;
  };
  nextReviewAt?: string | null;
}

interface PracticeRecommendation {
  id: string;
  type: string;
  nodeId: string;
  title: string;
  masteryLevel?: number | null;
  subjectName?: string | null;
  quality?: number | null;
  targetUrl?: string;
}

interface PracticeHistoryItem {
  id: string;
  nodeId?: string | null;
  nodeTitle: string;
  subjectName?: string | null;
  action: string;
  quality?: number | null;
  masteryBefore?: number | null;
  masteryAfter?: number | null;
  durationSeconds?: number | null;
  createdAt: string | Date;
}

interface SchemaListItem {
  id: string;
  name: string;
  subjectName?: string | null;
  avgMemberMastery?: number;
  masteryLevel?: number;
  members?: Array<{ id: string; title: string; masteryLevel: number }>;
}

function classifyGenerationError(status: number, error?: string, detail?: string): string {
  const message = `${error || ''} ${detail || ''}`.toLowerCase();

  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('api key')) {
    return 'AI 服务鉴权失败，请到设置页检查 API Key 是否正确保存。';
  }

  if (status === 429 || message.includes('rate limit')) {
    return 'AI 服务请求过于频繁，请稍后再试。';
  }

  if (status === 503 || message.includes('generation failed')) {
    return 'AI 暂时没有生成可用题目，已无缓存题可用，请稍后重试或切换 ICAP 层级。';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'AI 出题超时，请稍后重试或减少题目数量。';
  }

  if (message.includes('network') || message.includes('fetch failed') || message.includes('econnreset')) {
    return '网络连接不稳定，题目生成失败，请稍后重试。';
  }

  if (status >= 500) {
    return '服务器生成题目时出错，请稍后重试。';
  }

  return '题目生成失败，请检查 AI 配置或稍后重试。';
}

function formatPracticeHistoryTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

export default function PracticePage() {
  return (
    <DensityProvider>
      <Suspense fallback={<div className="max-w-6xl mx-auto px-6 py-8 text-sm text-slate-500">正在加载练习...</div>}>
        <PracticeContent />
      </Suspense>
    </DensityProvider>
  );
}

function PracticeContent() {
  const searchParams = useSearchParams();
  const [nodes, setNodes] = useState<PracticeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [activeIcap, setActiveIcap] = useState('Active');
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineNodeId, setPipelineNodeId] = useState<string | null>(null);
  const [pipelineNodeTitle, setPipelineNodeTitle] = useState('');
  const [practiceSteps, setPracticeSteps] = useState<ActionableStep[]>([]);
  const [reviewRecommendations, setReviewRecommendations] = useState<PracticeRecommendation[]>([]);
  const [practiceHistory, setPracticeHistory] = useState<PracticeHistoryItem[]>([]);
  const [recommendedNodeId, setRecommendedNodeId] = useState<string | null>(null);
  const [schemaPracticeNodeIds, setSchemaPracticeNodeIds] = useState<string[] | null>(null);

  const userId = useUserId() || '';
  const { densityLevel, infoChunkSize } = useDensity();

  // Hint level indicator based on overall review progress
  const hintLevel: HintLevel = useMemo(() => {
    if (!selectedNode || nodes.length === 0) return 1;
    const currentNode = nodes.find((n) => n.id === selectedNode);
    const reps = currentNode?.repetitions ?? 0;
    const mastery = currentNode?.masteryLevel ?? 0;
    return getHintLevel(reps, mastery);
  }, [selectedNode, nodes]);

  const hintLevelColors: Record<HintLevel, { bg: string; text: string; border: string }> = {
    1: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    2: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    3: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  };

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submittingAnswers, setSubmittingAnswers] = useState<Record<string, boolean>>({});
  const [submitResults, setSubmitResults] = useState<Record<string, PracticeSubmitResponse>>({});
  const deepLinkAppliedRef = useRef(false);
  // 出题请求序号：快速切换节点时，慢的旧响应不得覆盖新节点的题目，
  // 旧请求的 finally 也不得提前复位 generating
  const generateSeqRef = useRef(0);

  // In sparse mode, show questions one at a time (paginated).
  const [questionPage, setQuestionPage] = useState(0);
  const questionsPerPage = densityLevel === 'sparse' ? 1 : infoChunkSize;

  const visibleQuestions = useMemo(() => {
    if (densityLevel === 'compact' || densityLevel === 'comfortable') return questions;
    // Sparse: paginate one at a time.
    const start = questionPage * questionsPerPage;
    return questions.slice(start, start + questionsPerPage);
  }, [questions, densityLevel, questionPage, questionsPerPage]);

  const totalQuestionPages = Math.ceil(questions.length / questionsPerPage);
  const hasMoreQuestions = questionPage < totalQuestionPages - 1;
  const hasPrevQuestions = questionPage > 0;

  // Reset page when questions change.
  useEffect(() => {
    queueMicrotask(() => {
      setQuestionPage(0);
    });
  }, [questions]);

  useEffect(() => { document.title = '练习 - 知图复习'; }, []);

  useEffect(() => {
    authFetch('/api/knowledge?limit=100')
      .then(res => res.json())
      .then((data: KnowledgeResponse) => setNodes(data.nodes || []))
      .catch(console.error);
  }, [userId]);

  // Fetch learner profile for practice recommendations
  useEffect(() => {
    async function loadPracticeSteps() {
      if (!userId) return;
      try {
        const res = await authFetch(`/api/learner/profile?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return;
        const data = await res.json();
        const steps: ActionableStep[] = (data.actionableSteps as ActionableStep[]) || [];
        const icapSteps = steps.filter((s) => s.type === 'practice_icap');
        setPracticeSteps(icapSteps);
        if (icapSteps.length > 0) {
          setRecommendedNodeId(icapSteps[0].nodeId ?? null);
        }
      } catch {
        // silent
      }
    }
    queueMicrotask(() => {
      void loadPracticeSteps();
    });
  }, [userId]);

  useEffect(() => {
    async function loadReviewRecommendations() {
      if (!userId) return;
      try {
        const res = await authFetch('/api/practice?action=recommendations');
        if (!res.ok) return;
        const data = await res.json() as { recommendations?: PracticeRecommendation[] };
        const recommendations = data.recommendations || [];
        setReviewRecommendations(recommendations);
        // 函数式更新：不把 recommendedNodeId 列入依赖——否则 set 触发依赖变化、
        // 依赖变化又触发本 effect，造成重复拉取（effect 依赖循环）
        setRecommendedNodeId((prev) =>
          prev ?? (recommendations.length > 0 ? recommendations[0].nodeId : null),
        );
      } catch {
        // Recommendations are optional.
      }
    }
    queueMicrotask(() => {
      void loadReviewRecommendations();
    });
  }, [userId]);

  useEffect(() => {
    async function loadPracticeHistory() {
      if (!userId) return;
      try {
        const res = await authFetch('/api/practice?action=history');
        if (!res.ok) return;
        const data = await res.json() as { history?: PracticeHistoryItem[] };
        setPracticeHistory(data.history || []);
      } catch {
        // History is optional.
      }
    }
    queueMicrotask(() => {
      void loadPracticeHistory();
    });
  }, [userId]);

  const handleGenerateQuestions = useCallback(async (
    nodeId: string,
    icapLevel: string,
    forceGenerate = false,
  ) => {
    const seq = ++generateSeqRef.current;
    setSelectedNode(nodeId);
    setActiveIcap(icapLevel);
    setGenerating(true);
    setGenerationError(null);
    setQuestionPage(0);
    try {
      const params = new URLSearchParams({
        knowledgeNodeId: nodeId,
        icapLevel,
        count: '3',
      });
      if (forceGenerate) {
        params.set('forceGenerate', 'true');
      }
      const res = await authFetch(`/api/practice?${params.toString()}`);
      const data = await res.json().catch(() => ({})) as QuestionResponse;
      if (seq !== generateSeqRef.current) return; // 已有更新的请求，丢弃过期响应
      if (!res.ok) {
        setGenerationError(classifyGenerationError(res.status, data.error, data.detail));
        setQuestions([]);
        return;
      }
      const nextQuestions = data.questions || [];
      setQuestions(nextQuestions);
      setAnswers({});
      setChecked({});
      setSubmitResults({});
      setSubmittingAnswers({});
      if (nextQuestions.length === 0) {
        setGenerationError('暂时没有生成可用题目，请换一个 ICAP 层级或重新生成。');
      }
    } catch (err) {
      if (seq !== generateSeqRef.current) return;
      console.error(err);
      setQuestions([]);
      setGenerationError(classifyGenerationError(0, err instanceof Error ? err.message : String(err)));
    } finally {
      if (seq === generateSeqRef.current) setGenerating(false);
    }
  }, []);

  useEffect(() => {
    if (deepLinkAppliedRef.current) return;

    const schemaId = searchParams.get('schemaId');
    if (schemaId) {
      let cancelled = false;

      async function applySchemaDeepLink() {
        try {
          const res = await authFetch('/api/schema/list');
          if (!res.ok) {
            throw new Error(`Schema list failed: ${res.status}`);
          }

          const data = await res.json() as { schemas?: SchemaListItem[] };
          const schema = (data.schemas || []).find((item) => item.id === schemaId);
          if (!schema || cancelled || deepLinkAppliedRef.current) return;

          const schemaNode: PracticeNode = {
            id: schema.id,
            title: schema.name,
            masteryLevel: schema.avgMemberMastery ?? schema.masteryLevel ?? 0,
            subject: schema.subjectName ? { name: schema.subjectName } : null,
          };
          const memberNodes: PracticeNode[] = (schema.members || []).map((member) => ({
            id: member.id,
            title: member.title,
            masteryLevel: member.masteryLevel,
            subject: schema.subjectName ? { name: schema.subjectName } : null,
          }));
          const scopedNodes = [
            schemaNode,
            ...memberNodes.filter((member) => member.id !== schemaNode.id),
          ];

          deepLinkAppliedRef.current = true;
          setSchemaPracticeNodeIds(scopedNodes.map((node) => node.id));
          queueMicrotask(() => {
            setNodes((prev) => {
              const scopedIds = new Set(scopedNodes.map((node) => node.id));
              return [
                ...scopedNodes,
                ...prev.filter((node) => !scopedIds.has(node.id)),
              ];
            });
          });
          queueMicrotask(() => {
            void handleGenerateQuestions(schemaNode.id, 'Constructive', true);
          });
        } catch (error) {
          console.error(error);
          setGenerationError('图式练习加载失败，请返回图式库重新进入。');
        }
      }

      void applySchemaDeepLink();

      return () => {
        cancelled = true;
      };
    }

    const nodeId = searchParams.get('nodeId');
    if (!nodeId) return;

    const deepLinkNodeId = nodeId;
    const icapLevel = searchParams.get('icapLevel') || 'Active';
    const shouldOpenPipeline = searchParams.get('pipeline') === '1';
    let cancelled = false;

    async function applyDeepLink() {
      let matched = nodes.find((node) => node.id === deepLinkNodeId) || null;

      if (!matched) {
        try {
          const res = await authFetch(`/api/knowledge/${encodeURIComponent(deepLinkNodeId)}`);
          if (res.ok) {
            matched = await res.json() as PracticeNode;
          }
        } catch (error) {
          console.error(error);
        }
      }

      if (!matched || cancelled || deepLinkAppliedRef.current) return;
      deepLinkAppliedRef.current = true;

      queueMicrotask(() => {
        setNodes((prev) => (
          prev.some((node) => node.id === matched.id) ? prev : [matched, ...prev]
        ));
      });

      if (shouldOpenPipeline) {
        queueMicrotask(() => {
          setSelectedNode(matched.id);
          setActiveIcap(icapLevel);
          setPipelineNodeId(matched.id);
          setPipelineNodeTitle(matched.title);
          setShowPipeline(true);
        });
        return;
      }

      queueMicrotask(() => {
        void handleGenerateQuestions(matched.id, icapLevel);
      });
    }

    void applyDeepLink();

    return () => {
      cancelled = true;
    };
  }, [nodes, searchParams, handleGenerateQuestions]);

  // Auto-select recommended node when both nodes and recommendation are loaded
  useEffect(() => {
    if (searchParams.get('schemaId') || searchParams.get('nodeId')) return;
    if (!recommendedNodeId || nodes.length === 0 || selectedNode) return;
    const matched = nodes.find((n) => n.id === recommendedNodeId);
    if (matched) {
      const icapStep = practiceSteps.find((s) => s.nodeId === recommendedNodeId);
      const icapLevel = icapStep?.targetUrl?.match(/icapLevel=([^&]+)/)?.[1] || 'Active';
      queueMicrotask(() => {
        void handleGenerateQuestions(matched.id, icapLevel);
      });
    }
  }, [recommendedNodeId, nodes, selectedNode, practiceSteps, searchParams, handleGenerateQuestions]);

  const icapOptions = [
    { level: 'Passive', label: '被动', desc: '基础识记题', gradient: 'from-slate-400 to-slate-500' },
    { level: 'Active', label: '主动', desc: '填空判断选择', gradient: 'from-blue-400 to-blue-500' },
    { level: 'Constructive', label: '构建', desc: '综合简答题', gradient: 'from-emerald-400 to-emerald-500' },
    { level: 'Interactive', label: '互动', desc: '变式应用题', gradient: 'from-purple-400 to-purple-500' },
  ];

  const selectedPracticeNode = useMemo(
    () => nodes.find((node) => node.id === selectedNode) || null,
    [nodes, selectedNode],
  );
  const isSchemaPractice = !!selectedPracticeNode && searchParams.get('schemaId') === selectedPracticeNode.id;
  const hasDeepLinkedPractice = !!searchParams.get('schemaId') || !!searchParams.get('nodeId');
  const shouldShowRecommendationBar =
    !hasDeepLinkedPractice && (practiceSteps.length > 0 || reviewRecommendations.length > 0);
  const visiblePracticeNodes = useMemo(() => {
    if (!searchParams.get('schemaId') || !schemaPracticeNodeIds) return nodes;
    const scopedIds = new Set(schemaPracticeNodeIds);
    return nodes.filter((node) => scopedIds.has(node.id));
  }, [nodes, schemaPracticeNodeIds, searchParams]);

  const activeIcapOption = icapOptions.find((opt) => opt.level === activeIcap);

  const qKey = (q: PracticeQuestion, i: number) => `${questionPage}-${i}-${q.id || i}`;

  const handleSubmitPracticeAnswer = useCallback(async (
    question: PracticeQuestion,
    key: string,
    userAnswer: string,
  ) => {
    const trimmedAnswer = userAnswer.trim();
    if (!trimmedAnswer) return;

    setSubmittingAnswers((prev) => ({ ...prev, [key]: true }));
    try {
      if (!question.id) {
        setSubmitResults((prev) => ({
          ...prev,
          [key]: {
            isCorrect: trimmedAnswer === question.answer,
            correctAnswer: question.answer,
            explanation: question.explanation ?? null,
          },
        }));
        setChecked((prev) => ({ ...prev, [key]: true }));
        return;
      }

      const res = await authFetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          userAnswer: trimmedAnswer,
        }),
      });

      if (!res.ok) {
        throw new Error(`Practice submit failed: ${res.status}`);
      }

      const data = await res.json() as PracticeSubmitResponse;
      setSubmitResults((prev) => ({ ...prev, [key]: data }));
      setChecked((prev) => ({ ...prev, [key]: true }));
      const masteryChange = data.masteryChange;
      if (selectedNode && typeof masteryChange?.after === 'number') {
        setNodes((prev) => prev.map((node) => (
          node.id === selectedNode
            ? { ...node, masteryLevel: masteryChange.after }
            : node
        )));
        if (selectedPracticeNode) {
          setPracticeHistory((prev) => [{
            id: `local_${question.id || key}_${Date.now()}`,
            nodeId: selectedPracticeNode.id,
            nodeTitle: selectedPracticeNode.title,
            subjectName: selectedPracticeNode.subject?.name ?? null,
            action: data.isCorrect ? 'solved' : 'mistake',
            quality: data.quality ?? null,
            masteryBefore: masteryChange.before,
            masteryAfter: masteryChange.after,
            createdAt: new Date().toISOString(),
          }, ...prev].slice(0, 12));
        }
      }
    } catch (error) {
      console.error(error);
      setSubmitResults((prev) => ({
        ...prev,
        [key]: {
          isCorrect: trimmedAnswer === question.answer,
          correctAnswer: question.answer,
          explanation: question.explanation ?? null,
          feedback: '提交失败，已暂时使用本地答案进行校验。',
        },
      }));
      setChecked((prev) => ({ ...prev, [key]: true }));
    } finally {
      setSubmittingAnswers((prev) => ({ ...prev, [key]: false }));
    }
  }, [selectedNode, selectedPracticeNode]);

  const renderQuestion = (q: PracticeQuestion, i: number) => {
    const key = qKey(q, i);
    const selectedAnswer = answers[key] || '';
    const isChecked = checked[key] || false;
    const submitResult = submitResults[key];
    const isSubmitting = submittingAnswers[key] || false;
    const isCorrect = isChecked && (submitResult?.isCorrect ?? selectedAnswer === q.answer);
    const correctAnswer = submitResult?.correctAnswer ?? q.answer;
    const explanation = submitResult?.explanation ?? q.explanation;
    const feedback = submitResult?.feedback;
    const gradingSource = submitResult?.gradingSource;

    return (
      <Card key={key}>
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm shrink-0 mt-0.5">
            {questionPage * questionsPerPage + i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <LatexText
              text={q.stem || ''}
              className="text-slate-800 font-medium mb-4 leading-relaxed"
            />

            {q.options && Array.isArray(q.options) && q.options.length > 0 && (
              <div className="space-y-2 mb-4">
                {q.options.map((opt, j) => {
                  const isSelected = selectedAnswer === opt.label;
                  const showResult = isChecked;
                  let borderClass = 'border-slate-200/80 hover:bg-slate-50 hover:border-slate-300';
                  if (showResult) {
                    if (opt.label === q.answer) {
                      borderClass = 'border-emerald-300 bg-emerald-50/50';
                    } else if (isSelected && opt.label !== q.answer) {
                      borderClass = 'border-red-300 bg-red-50/50';
                    } else {
                      borderClass = 'border-slate-200/80 opacity-50';
                    }
                  } else if (isSelected) {
                    borderClass = 'border-indigo-300 bg-indigo-50/50';
                  }
                  return (
                    <label
                      key={j}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors duration-150 ${borderClass}`}
                    >
                      <input
                        type="radio"
                        name={`pq-${key}`}
                        value={opt.label}
                        checked={isSelected}
                        onChange={() => {
                          if (!isChecked) {
                            setAnswers(prev => ({ ...prev, [key]: opt.label }));
                          }
                        }}
                        disabled={isChecked}
                        className="text-indigo-600 w-4 h-4"
                      />
                      <span className="text-xs font-semibold text-slate-400 w-5">{opt.label}.</span>
                      <LatexText
                        text={opt.text || ''}
                        className="text-sm text-slate-700 leading-relaxed min-w-0"
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {(!q.options || !Array.isArray(q.options) || q.options.length === 0) && (
              <textarea
                value={selectedAnswer}
                onChange={(event) => {
                  if (!isChecked) {
                    setAnswers((prev) => ({ ...prev, [key]: event.target.value }));
                  }
                }}
                disabled={isChecked}
                placeholder="请用自己的话写下答案..."
                className="w-full min-h-[96px] rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-500 mb-4"
              />
            )}

            {/* Answer checking */}
            {!isChecked && (
              <button
                onClick={() => void handleSubmitPracticeAnswer(q, key, selectedAnswer)}
                disabled={!selectedAnswer.trim() || isSubmitting}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  selectedAnswer.trim() && !isSubmitting
                    ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? '正在提交...' : '检查答案'}
              </button>
            )}

            {isChecked && (
              <div className={`mt-3 p-4 rounded-xl border ${
                isCorrect
                  ? 'bg-gradient-to-br from-emerald-50/80 to-green-50/80 border-emerald-100/60'
                  : 'bg-gradient-to-br from-red-50/80 to-rose-50/80 border-red-100/60'
              }`}>
                <p className={`text-sm font-semibold ${isCorrect ? 'text-emerald-800' : 'text-red-800'}`}>
                  {isCorrect ? '✓ 回答正确！' : '✗ 回答错误，正确答案是：'}
                </p>
                {gradingSource && (
                  <div className="mt-1">
                    <Badge variant={gradingSource === 'ai' ? 'purple' : 'default'} size="sm">
                      {gradingSource === 'ai' ? 'AI 语义判分' : gradingSource === 'self' ? '自评参与判分' : '规则判分'}
                    </Badge>
                  </div>
                )}
                {!isCorrect && correctAnswer && (
                  <LatexText
                    text={correctAnswer}
                    className="text-sm mt-1.5 text-red-700/80 leading-relaxed"
                  />
                )}
                {feedback && feedback !== explanation && (
                  <div className={`text-sm mt-1.5 ${isCorrect ? 'text-emerald-700/80' : 'text-red-700/80'}`}>
                    <span className="font-medium">反馈：</span>
                    <LatexText text={feedback} className="mt-1 leading-relaxed" />
                  </div>
                )}
                {explanation && (
                  <div className={`text-sm mt-1.5 ${isCorrect ? 'text-emerald-700/80' : 'text-red-700/80'}`}>
                    <span className="font-medium">解析：</span>
                    <LatexText text={explanation} className="mt-1 leading-relaxed" />
                  </div>
                )}
                {submitResult?.masteryChange && (
                  <p className="text-xs text-slate-500 mt-2">
                    掌握度 {Math.round(submitResult.masteryChange.before)}% -&gt; {Math.round(submitResult.masteryChange.after)}%
                    {submitResult.nextReviewAt && `；下次复习 ${new Date(submitResult.nextReviewAt).toLocaleDateString('zh-CN')}`}
                  </p>
                )}
                <button
                  onClick={() => {
                    setChecked(prev => ({ ...prev, [key]: false }));
                    setAnswers(prev => ({ ...prev, [key]: '' }));
                    setSubmitResults(prev => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  }}
                  className="mt-2 text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
                >
                  重新作答
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 mt-3">
              <Badge variant="default" size="sm">
                {'★'.repeat(q.difficulty || 3)}
              </Badge>
              <Badge variant="purple" size="sm">{q.icapLevel}</Badge>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mb-8">主动回忆练习</h1>

      {/* Hint Level Indicator — 引导渐隐 */}
      {selectedNode && (
        <div className={`mb-6 rounded-xl border px-4 py-3 ${hintLevelColors[hintLevel].bg} ${hintLevelColors[hintLevel].border}`}>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${hintLevelColors[hintLevel].text} bg-white/60`}>
              {HINT_LEVEL_LABELS[hintLevel]}
            </span>
            <span className={`text-[13px] ${hintLevelColors[hintLevel].text}`}>
              {HINT_LEVEL_DESCRIPTIONS[hintLevel]}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            随着掌握度提升，提示会逐渐减少，帮助你独立解决问题
          </p>
        </div>
      )}

      {/* Practice recommendation bar */}
      {shouldShowRecommendationBar && (
        <div className="mb-6 text-[13px] text-indigo-700 bg-indigo-50/70 border border-indigo-200/60 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <div className="flex-1 min-w-0">
              <span className="font-medium">基于你的学习画像：</span>
              建议优先练习
              <div className="mt-1.5 flex flex-wrap gap-2">
                {reviewRecommendations.slice(0, 3).map((recommendation) => (
                  <button
                    key={recommendation.id}
                    onClick={() => void handleGenerateQuestions(recommendation.nodeId, 'Active')}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    低分补练：{recommendation.title}
                  </button>
                ))}
                {practiceSteps.slice(0, 2).map((step) => (
                  <button
                    key={step.id}
                    onClick={() => {
                      const icaLevel = step.targetUrl?.match(/icapLevel=([^&]+)/)?.[1] || 'Active';
                      if (step.nodeId) {
                        void handleGenerateQuestions(step.nodeId, icaLevel);
                      }
                    }}
                    className="rounded-lg border border-indigo-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    {step.title.replace(/^练习 "/, '').replace(/"$/, '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Knowledge node selector */}
        <div className="md:col-span-1">
          <Card>
            <h3 className="font-semibold text-slate-800 mb-4 text-[15px]">选择知识点</h3>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {visiblePracticeNodes.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-4 text-sm text-slate-500">
                  暂无知识点。请先添加或拆解课程内容，再回来进行 ICAP 练习。
                </div>
              )}
              {visiblePracticeNodes.map((node) => (
                <div key={node.id}>
                  <button
                    onClick={() => handleGenerateQuestions(node.id, activeIcap)}
                    className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${
                      selectedNode === node.id
                        ? 'bg-indigo-50/80 border border-indigo-200/60 shadow-sm'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                      {node.title}
                      {node.id === recommendedNodeId && (
                        <span className="text-[10px] font-medium text-indigo-500 bg-indigo-100/70 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          推荐
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="info" size="sm">{node.subject?.name}</Badge>
                      <MasteryBar level={node.masteryLevel} showLabel={false} />
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setPipelineNodeId(node.id);
                      setPipelineNodeTitle(node.title);
                      setShowPipeline(true);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-purple-500 hover:text-purple-600 hover:bg-purple-50/50 rounded-lg transition-colors mt-0.5"
                  >
                    完整ICAP训练 →
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {!hasDeepLinkedPractice && practiceHistory.length > 0 && (
            <Card className="mt-4">
              <h3 className="font-semibold text-slate-800 mb-3 text-[15px]">最近答题</h3>
              <div className="space-y-2">
                {practiceHistory.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => item.nodeId && void handleGenerateQuestions(item.nodeId, 'Active')}
                    className="w-full rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-left hover:bg-white hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-slate-700">{item.nodeTitle}</span>
                      <Badge variant={item.action === 'solved' ? 'success' : 'warning'} size="sm">
                        {item.action === 'solved' ? '正确' : '需巩固'}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      {typeof item.quality === 'number' && <span>质量 {item.quality}/5</span>}
                      {typeof item.masteryBefore === 'number' && typeof item.masteryAfter === 'number' && (
                        <span>掌握度 {Math.round(item.masteryBefore)}% → {Math.round(item.masteryAfter)}%</span>
                      )}
                      <span>{formatPracticeHistoryTime(item.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Practice area */}
        <div className="md:col-span-2">
          {!selectedNode && (
            <Card>
              <div className="text-center py-14">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
                  ✏️
                </div>
                <p className="text-slate-500 font-medium">请从左侧选择一个知识点开始练习</p>
                <p className="text-sm text-slate-400 mt-1.5">
                  选择不同的ICAP层级来获得不同难度的题目
                </p>

                <div className="mt-6 grid grid-cols-2 gap-2 max-w-xs mx-auto">
                  {icapOptions.map(opt => (
                    <div key={opt.level} className="text-left p-2.5 rounded-xl bg-slate-50">
                      <Badge variant="default" size="sm">{opt.label}</Badge>
                      <span className="block text-[11px] text-slate-400 mt-1">{opt.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {selectedNode && generating && (
            <Card>
              <div className="text-center py-14">
                <div className="animate-spin h-8 w-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full mx-auto mb-4" />
                <p className="text-slate-500 font-medium">AI正在出题...</p>
              </div>
            </Card>
          )}

          {selectedNode && !generating && generationError && (
            <Card>
              <div className="text-center py-10">
                <p className="text-slate-700 font-medium">题目暂时没有生成成功</p>
                <p className="text-sm text-slate-500 mt-1.5">{generationError}</p>
                <div className="mt-4 flex justify-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={() => void handleGenerateQuestions(selectedNode, activeIcap)}
                  >
                    重新生成
                  </Button>
                  {icapOptions.map((opt) => (
                    <Button
                      key={opt.level}
                      size="sm"
                      variant={activeIcap === opt.level ? 'primary' : 'secondary'}
                      onClick={() => void handleGenerateQuestions(selectedNode, opt.level)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {selectedNode && !generating && !generationError && questions.length > 0 && (
            <div className="space-y-4">
              {/* ICAP toggle */}
              <div className="flex gap-2 flex-wrap">
                {icapOptions.map(opt => (
                  <Button
                    key={opt.level}
                    size="sm"
                    variant={activeIcap === opt.level ? 'primary' : 'secondary'}
                    onClick={() => handleGenerateQuestions(selectedNode, opt.level)}
                  >
                    {opt.label}题
                  </Button>
                ))}
              </div>

              {/* Questions — paginated in sparse mode, all in compact/comfortable */}
              {selectedPracticeNode && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-indigo-800">
                      为什么练习这一项
                    </p>
                    <Badge variant="purple" size="sm">
                      {isSchemaPractice ? '图式练习' : activeIcapOption?.label || activeIcap}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    本轮为 <span className="font-medium text-slate-700">{selectedPracticeNode.title}</span> 安排{isSchemaPractice ? '图式迁移' : activeIcapOption?.label || activeIcap}任务，因为当前掌握度为 {Math.round(selectedPracticeNode.masteryLevel)}%，引导模式为{HINT_LEVEL_LABELS[hintLevel]}。
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                    <div className="rounded-lg bg-white/70 px-3 py-2">
                      <p className="text-[11px] text-slate-400">掌握度</p>
                      <p className="text-sm font-semibold text-slate-700">{Math.round(selectedPracticeNode.masteryLevel)}%</p>
                    </div>
                    <div className="rounded-lg bg-white/70 px-3 py-2">
                      <p className="text-[11px] text-slate-400">ICAP 重点</p>
                      <p className="text-sm font-semibold text-slate-700">{activeIcapOption?.desc || activeIcap}</p>
                    </div>
                    <div className="rounded-lg bg-white/70 px-3 py-2">
                      <p className="text-[11px] text-slate-400">引导方式</p>
                      <p className="text-sm font-semibold text-slate-700">{HINT_LEVEL_LABELS[hintLevel]}</p>
                    </div>
                  </div>
                </div>
              )}

              {visibleQuestions.map((q, i) => renderQuestion(q, i))}

              {/* Pagination controls for sparse mode */}
              {densityLevel === 'sparse' && totalQuestionPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!hasPrevQuestions}
                    onClick={() => setQuestionPage(prev => prev - 1)}
                  >
                    上一题
                  </Button>
                  <span className="text-sm text-slate-400">
                    {questionPage + 1} / {totalQuestionPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!hasMoreQuestions}
                    onClick={() => setQuestionPage(prev => prev + 1)}
                  >
                    下一题
                  </Button>
                </div>
              )}

              <div className="flex justify-center gap-2 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const text = questions.map((q) => q.stem || '').join('。');
                    await authFetch('/api/tts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text, contentType: 'question' }),
                    });
                  }}
                >
                  朗读题目
                </Button>
              </div>
            </div>
          )}

          {selectedNode && !generating && !generationError && questions.length === 0 && (
            <Card>
              <div className="text-center py-10 text-slate-400">
                <p>暂无题目，请点击上方ICAP按钮生成</p>
                <div className="mt-4 flex justify-center gap-2 flex-wrap">
                  {icapOptions.map((opt) => (
                    <Button
                      key={opt.level}
                      size="sm"
                      variant={activeIcap === opt.level ? 'primary' : 'secondary'}
                      onClick={() => handleGenerateQuestions(selectedNode, opt.level)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ICAP Pipeline Modal */}
      {showPipeline && pipelineNodeId && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <IcapPipeline
              knowledgeNodeId={pipelineNodeId}
              knowledgeNodeTitle={pipelineNodeTitle}
              onComplete={() => setShowPipeline(false)}
              onClose={() => setShowPipeline(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
