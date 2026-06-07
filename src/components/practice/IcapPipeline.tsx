'use client';

import { authFetch } from '@/lib/auth';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserId } from '@/components/auth/AuthProvider';
import type {
  ConstructiveTask,
  InteractiveTask,
  ValidationResult,
} from '@/lib/icap-enhancer';
import type { DetectCognitiveGapsResult } from '@/lib/ai-tutor';

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
  subject?: { name: string } | null;
}

const STAGES = [
  { key: 'passive' as const, label: '阅读理解', description: '阅读知识点，建立初步印象', icon: '📖', color: 'from-slate-500 to-slate-600' },
  { key: 'active' as const, label: '主动回忆', description: '完成练习题，检验记忆', icon: '✏️', color: 'from-blue-500 to-blue-600' },
  { key: 'constructive' as const, label: '构建理解', description: '用自己的话总结规律', icon: '🏗️', color: 'from-emerald-500 to-emerald-600' },
  { key: 'interactive' as const, label: '互动深化', description: 'AI追问，变式练习', icon: '🤖', color: 'from-purple-500 to-purple-600' },
];

type StageKey = typeof STAGES[number]['key'];

const STAGE_GUIDANCE: Record<StageKey, { goal: string; action: string; done: string }> = {
  passive: {
    goal: '先建立初步心智模型，再进入答题。',
    action: '阅读摘要和关键词，然后用一句话说出核心意思。',
    done: '当主题、背景和主要术语已经能辨认时继续。',
  },
  active: {
    goal: '在不回看解释的情况下检查回忆效果。',
    action: '先独立回答每道题，再对照解析。',
    done: '提交现有题目，或明确自己缺什么后继续。',
  },
  constructive: {
    goal: '把记住的事实转化为自己的解释。',
    action: '用自己的话解释原因、例子、对比和联系。',
    done: '解释已经被检查，或已经知道需要补哪里时继续。',
  },
  interactive: {
    goal: '把知识迁移到变化后的条件中。',
    action: '通过 AI 追问、变式题和情境任务测试灵活理解。',
    done: '至少完成一次对话、变式或情境任务后结束。',
  },
};

async function postIcapAction<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await authFetch('/api/icap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `ICAP request failed: ${res.status}`);
  }

  return data as T;
}

interface IcapDraft {
  stage?: number;
  userSummary?: string;
  results?: IcapResults;
  activeAnswers?: Record<string, string>;
  submitted?: Record<string, boolean>;
  showAnswer?: Record<string, boolean>;
  aiFeedback?: string;
  feedbackSubmitted?: boolean;
  tutorChatMessages?: Array<{ role: string; content: string }>;
  constructiveResponses?: Record<string, string>;
  constructiveSubmitted?: Record<string, boolean>;
  constructiveFeedbacks?: Record<string, ValidationResult | null>;
  constructiveTask?: ConstructiveTask | null;
  variantAnswers?: Record<string, string>;
  variantSubmitted?: Record<string, boolean>;
  variantShowAnswer?: Record<string, boolean>;
  interactiveTask?: InteractiveTask | null;
  scenarioResponses?: Record<string, string>;
  scenarioSubmitted?: Record<string, boolean>;
  scenarioFeedbacks?: Record<string, string>;
}

export function IcapPipeline({ knowledgeNodeId, knowledgeNodeTitle, onComplete, onClose }: IcapPipelineProps) {
  const userId = useUserId() || '';
  const draftStorageKey = useMemo(
    () => `mindreview:icap-draft:${userId || 'anonymous'}:${knowledgeNodeId}`,
    [userId, knowledgeNodeId],
  );
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
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [tutorChatMessages, setTutorChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [tutorChatInput, setTutorChatInput] = useState('');
  const [tutorChatLoading, setTutorChatLoading] = useState(false);
  const [tutorSessionId, setTutorSessionId] = useState<string | null>(null);
  const [constructiveTask, setConstructiveTask] = useState<ConstructiveTask | null>(null);
  const [constructiveTaskLoading, setConstructiveTaskLoading] = useState(false);
  const [constructiveResponses, setConstructiveResponses] = useState<Record<string, string>>({});
  const [constructiveSubmitted, setConstructiveSubmitted] = useState<Record<string, boolean>>({});
  const [constructiveFeedbacks, setConstructiveFeedbacks] = useState<Record<string, ValidationResult | null>>({});
  const [constructiveFeedbackLoading, setConstructiveFeedbackLoading] = useState<Record<string, boolean>>({});
  const [interactiveTask, setInteractiveTask] = useState<InteractiveTask | null>(null);
  const [interactiveTaskLoading, setInteractiveTaskLoading] = useState(false);
  const [variantAnswers, setVariantAnswers] = useState<Record<string, string>>({});
  const [variantSubmitted, setVariantSubmitted] = useState<Record<string, boolean>>({});
  const [variantShowAnswer, setVariantShowAnswer] = useState<Record<string, boolean>>({});
  const [scenarioResponses, setScenarioResponses] = useState<Record<string, string>>({});
  const [scenarioSubmitted, setScenarioSubmitted] = useState<Record<string, boolean>>({});
  const [scenarioFeedbacks, setScenarioFeedbacks] = useState<Record<string, string>>({});
  const [scenarioFeedbackLoading, setScenarioFeedbackLoading] = useState<Record<string, boolean>>({});

  // Cognitive gap detection — triggered when advancing from Constructive stage
  const [cognitiveGaps, setCognitiveGaps] = useState<DetectCognitiveGapsResult | null>(null);
  const [gapCheckLoading, setGapCheckLoading] = useState(false);
  const [showGapWarning, setShowGapWarning] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(draftStorageKey);
        if (!raw) return;
        const draft = JSON.parse(raw) as IcapDraft;

        if (typeof draft.stage === 'number' && draft.stage >= 0 && draft.stage < STAGES.length) setStage(draft.stage);
        if (typeof draft.userSummary === 'string') setUserSummary(draft.userSummary);
        if (draft.results) setResults(draft.results);
        if (draft.activeAnswers) setActiveAnswers(draft.activeAnswers);
        if (draft.submitted) setSubmitted(draft.submitted);
        if (draft.showAnswer) setShowAnswer(draft.showAnswer);
        if (typeof draft.aiFeedback === 'string') setAiFeedback(draft.aiFeedback);
        if (typeof draft.feedbackSubmitted === 'boolean') setFeedbackSubmitted(draft.feedbackSubmitted);
        if (draft.tutorChatMessages) setTutorChatMessages(draft.tutorChatMessages);
        if (draft.constructiveResponses) setConstructiveResponses(draft.constructiveResponses);
        if (draft.constructiveSubmitted) setConstructiveSubmitted(draft.constructiveSubmitted);
        if (draft.constructiveFeedbacks) setConstructiveFeedbacks(draft.constructiveFeedbacks);
        if (draft.constructiveTask) setConstructiveTask(draft.constructiveTask);
        if (draft.variantAnswers) setVariantAnswers(draft.variantAnswers);
        if (draft.variantSubmitted) setVariantSubmitted(draft.variantSubmitted);
        if (draft.variantShowAnswer) setVariantShowAnswer(draft.variantShowAnswer);
        if (draft.interactiveTask) setInteractiveTask(draft.interactiveTask);
        if (draft.scenarioResponses) setScenarioResponses(draft.scenarioResponses);
        if (draft.scenarioSubmitted) setScenarioSubmitted(draft.scenarioSubmitted);
        if (draft.scenarioFeedbacks) setScenarioFeedbacks(draft.scenarioFeedbacks);
      } catch {
        window.localStorage.removeItem(draftStorageKey);
      }
    });
  }, [draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (results.interactive.completed) {
      queueMicrotask(() => {
        window.localStorage.removeItem(draftStorageKey);
      });
      return;
    }

    const draft: IcapDraft = {
      stage,
      userSummary,
      results,
      activeAnswers,
      submitted,
      showAnswer,
      aiFeedback,
      feedbackSubmitted,
      tutorChatMessages,
      constructiveResponses,
      constructiveSubmitted,
      constructiveFeedbacks,
      constructiveTask,
      variantAnswers,
      variantSubmitted,
      variantShowAnswer,
      interactiveTask,
      scenarioResponses,
      scenarioSubmitted,
      scenarioFeedbacks,
    };

    queueMicrotask(() => {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    });
  }, [
    draftStorageKey,
    stage,
    userSummary,
    results,
    activeAnswers,
    submitted,
    showAnswer,
    aiFeedback,
    feedbackSubmitted,
    tutorChatMessages,
    constructiveResponses,
    constructiveSubmitted,
    constructiveFeedbacks,
    constructiveTask,
    variantAnswers,
    variantSubmitted,
    variantShowAnswer,
    interactiveTask,
    scenarioResponses,
    scenarioSubmitted,
    scenarioFeedbacks,
  ]);

  useEffect(() => {
    authFetch(`/api/knowledge/${knowledgeNodeId}`)
      .then(r => r.json())
      .then(setNode)
      .catch(() => {});
  }, [knowledgeNodeId]);

  // Load persisted chat history when entering interactive stage
  useEffect(() => {
    if (stage === 3 && !tutorSessionId) {
      const sessionId = `icap_tutor_${knowledgeNodeId}`;
      queueMicrotask(() => {
        setTutorSessionId(sessionId);
        authFetch(`/api/tutor/history?sessionId=${encodeURIComponent(sessionId)}`)
          .then(r => r.json())
          .then(data => {
            if (data.messages && Array.isArray(data.messages)) {
              setTutorChatMessages(data.messages.map((m: { role: string; content: string }) =>
                ({ role: m.role, content: m.content })));
            }
          })
          .catch(() => {});
      });
    }
  }, [stage, knowledgeNodeId, tutorSessionId]);

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
        const res = await authFetch(`/api/practice?knowledgeNodeId=${knowledgeNodeId}&icapLevel=Active&count=3`);
        const data = await res.json();
        setQuestions(data.questions || []);
      } catch { /* ignore */ }
      setLoading(false);
    }

    if (idx === 2 && node && !constructiveTask) {
      // Constructive stage - load structured prompts
      setConstructiveTaskLoading(true);
      try {
        const data = await postIcapAction<{ constructiveTask: ConstructiveTask }>({
          action: 'designConstructiveTask',
          knowledgeNodeId,
        });
        setConstructiveTask(data.constructiveTask);
      } catch { /* ignore */ }
      setConstructiveTaskLoading(false);
    }

    if (idx === 3 && node && !interactiveTask) {
      // Interactive stage - load structured tasks
      setInteractiveTaskLoading(true);
      try {
        const data = await postIcapAction<{ interactiveTask: InteractiveTask }>({
          action: 'designInteractiveTask',
          knowledgeNodeId,
          difficulty: 'intermediate',
        });
        setInteractiveTask(data.interactiveTask);
      } catch { /* ignore */ }
      setInteractiveTaskLoading(false);
    }
  };

  const handleSubmitAnswer = async (questionId: string, userAnswer: string) => {
    try {
      const res = await authFetch('/api/practice', {
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

  const handleSubmitConstructivePrompt = async (promptId: string) => {
    const response = constructiveResponses[promptId];
    if (!response?.trim()) return;
    setConstructiveFeedbackLoading(prev => ({ ...prev, [promptId]: true }));
    try {
      const data = await postIcapAction<{ validation: ValidationResult }>({
        action: 'validateExplanation',
        knowledgeNodeId,
        response,
      });
      setConstructiveFeedbacks(prev => ({ ...prev, [promptId]: data.validation }));
    } catch {
      setConstructiveFeedbacks(prev => ({ ...prev, [promptId]: null }));
    } finally {
      setConstructiveFeedbackLoading(prev => ({ ...prev, [promptId]: false }));
      setConstructiveSubmitted(prev => ({ ...prev, [promptId]: true }));
    }
  };

  const handleSubmitVariantAnswer = (vqId: string) => {
    setVariantSubmitted(prev => ({ ...prev, [vqId]: true }));
    setVariantShowAnswer(prev => ({ ...prev, [vqId]: true }));
    setResults(prev => ({
      ...prev,
      interactive: { ...prev.interactive, responses: prev.interactive.responses + 1 },
    }));
  };

  const handleSubmitScenarioChallenge = async (scId: string) => {
    const response = scenarioResponses[scId];
    if (!response?.trim()) return;
    setScenarioFeedbackLoading(prev => ({ ...prev, [scId]: true }));
    try {
      const res = await authFetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeNodeId,
          message: `我在情境挑战中提交了以下回答，请评价并给出改进建议：${response}`,
          userId,
        }),
      });
      const data = await res.json();
      setScenarioFeedbacks(prev => ({ ...prev, [scId]: data.reply || '未收到反馈' }));
    } catch {
      setScenarioFeedbacks(prev => ({ ...prev, [scId]: '反馈请求失败' }));
    } finally {
      setScenarioFeedbackLoading(prev => ({ ...prev, [scId]: false }));
      setScenarioSubmitted(prev => ({ ...prev, [scId]: true }));
      setResults(prev => ({
        ...prev,
        interactive: { ...prev.interactive, responses: prev.interactive.responses + 1 },
      }));
    }
  };

  const handleSubmitSummary = async () => {
    recordStageTime('constructive');
    setResults(prev => ({
      ...prev,
      constructive: { ...prev.constructive, response: userSummary },
    }));
    setFeedbackSubmitted(true);
    setFeedbackLoading(true);
    try {
      const res = await authFetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeNodeId,
          message: `我刚才对这个知识点做了总结，请评价我的理解质量并指出可改进之处：${userSummary}`,
          userId,
        }),
      });
      const data = await res.json();
      setAiFeedback(data.reply || '未收到反馈');
    } catch {
      setAiFeedback('反馈请求失败，请重试');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleTutorChatSend = async () => {
    if (!tutorChatInput.trim()) return;
    setTutorChatLoading(true);
    const msg = tutorChatInput.trim();
    const newMessages = [...tutorChatMessages, { role: 'user', content: msg }];
    setTutorChatMessages(newMessages);
    setTutorChatInput('');
    try {
      const res = await authFetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: tutorSessionId,
          knowledgeNodeId,
          message: msg,
          userId,
          history: tutorChatMessages,
        }),
      });
      const data = await res.json();
      setTutorChatMessages([...newMessages, { role: 'assistant', content: data.reply || '' }]);
      setResults(prev => ({
        ...prev,
        interactive: { ...prev.interactive, responses: prev.interactive.responses + 1 },
      }));
    } catch { /* ignore */ }
    setTutorChatLoading(false);
  };

  /** Collect constructive responses and run cognitive gap detection before advancing. */
  const handleAdvanceFromConstructive = async () => {
    const parts: string[] = [];

    // Collect structured prompt responses
    if (constructiveTask) {
      for (const prompt of constructiveTask.selfExplanationPrompts) {
        const resp = constructiveResponses[prompt.id];
        if (resp?.trim()) {
          parts.push(`[${prompt.prompt}]: ${resp.trim()}`);
        }
      }
    }

    // Include the general summary if present
    if (userSummary.trim()) {
      parts.push(`[综合总结]: ${userSummary.trim()}`);
    }

    const combined = parts.join('\n\n');

    if (!combined) {
      // No responses to analyse — advance directly
      goToStage(3);
      return;
    }

    setGapCheckLoading(true);
    try {
      const data = await postIcapAction<{ gaps: DetectCognitiveGapsResult }>({
        action: 'detectCognitiveGaps',
        knowledgeNodeId,
        response: combined,
      });
      setCognitiveGaps(data.gaps);
      if (data.gaps.hasGaps && data.gaps.gaps.length > 0) {
        setShowGapWarning(true);
      } else {
        goToStage(3);
      }
    } catch {
      // On error, advance anyway
      goToStage(3);
    } finally {
      setGapCheckLoading(false);
    }
  };

  const allDone = stage === 3 && results.interactive.completed;
  const currentStage = STAGES[stage];
  const stageGuidance = STAGE_GUIDANCE[currentStage.key];

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

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase">目标</p>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">{stageGuidance.goal}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase">行动</p>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">{stageGuidance.action}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase">完成条件</p>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">{stageGuidance.done}</p>
          </div>
        </div>
      </div>

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
                                  value={opt.label}
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
          {/* Structured self-explanation prompt cards (NEW) */}
          {constructiveTaskLoading ? (
            <div className="flex items-center gap-2 text-sm text-emerald-500 py-4">
              <div className="animate-spin h-4 w-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full" />
              正在生成构建学习任务...
            </div>
          ) : constructiveTask ? (
            <>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100/60">
                <p className="text-sm text-amber-800 font-medium">结构化自我解释练习</p>
                <p className="text-xs text-amber-600/80 mt-1">
                  以下每个提示从不同维度引导你深入思考。逐题作答，AI会逐题评估。
                </p>
              </div>
              {constructiveTask.selfExplanationPrompts.map((prompt) => {
                const isSubmitted = constructiveSubmitted[prompt.id];
                const feedback = constructiveFeedbacks[prompt.id];
                const isLoading = constructiveFeedbackLoading[prompt.id];
                const categoryLabels: Record<string, string> = {
                  concept: '概念理解',
                  application: '应用举例',
                  connection: '知识联系',
                  contrast: '对比辨析',
                };
                const lengthLabels: Record<string, string> = {
                  short: '简短回答',
                  medium: '中等篇幅',
                  long: '详细阐述',
                };
                return (
                  <div key={prompt.id} className="bg-white border border-slate-200/80 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs rounded-full font-medium">
                        {categoryLabels[prompt.category] || prompt.category}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                        {lengthLabels[prompt.expectedLength] || prompt.expectedLength}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 font-medium mb-3">{prompt.prompt}</p>
                    {!isSubmitted ? (
                      <>
                        <textarea
                          className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                          placeholder="输入你的理解..."
                          value={constructiveResponses[prompt.id] || ''}
                          onChange={e => setConstructiveResponses(prev => ({ ...prev, [prompt.id]: e.target.value }))}
                        />
                        <div className="flex justify-end mt-2">
                          <Button
                            size="sm"
                            onClick={() => handleSubmitConstructivePrompt(prompt.id)}
                            disabled={!constructiveResponses[prompt.id]?.trim() || isLoading}
                            loading={isLoading}
                          >
                            提交审阅
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-400 mb-0.5">你的回答</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">
                            {constructiveResponses[prompt.id]}
                          </p>
                        </div>
                        {isLoading ? (
                          <div className="flex items-center gap-2 text-sm text-indigo-500 py-2">
                            <div className="animate-spin h-3 w-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
                            AI正在评估...
                          </div>
                        ) : feedback ? (
                          <div className="bg-gradient-to-br from-emerald-50/80 to-blue-50/80 rounded-xl p-3 border border-emerald-100/60">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-emerald-700">AI评估</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                feedback.comprehensionLevel === 'excellent' ? 'bg-emerald-100 text-emerald-700' :
                                feedback.comprehensionLevel === 'good' ? 'bg-blue-100 text-blue-700' :
                                feedback.comprehensionLevel === 'basic' ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                得分 {feedback.score}/100
                              </span>
                            </div>
                            {feedback.strengths.length > 0 && (
                              <div className="mb-2">
                                <p className="text-xs text-emerald-600 font-medium">做得好的方面：</p>
                                <ul className="text-xs text-slate-600 list-disc list-inside">
                                  {feedback.strengths.map((s, si) => <li key={si}>{s}</li>)}
                                </ul>
                              </div>
                            )}
                            {feedback.misconceptions.length > 0 && (
                              <div className="mb-2">
                                <p className="text-xs text-red-600 font-medium">需要纠正的误解：</p>
                                {feedback.misconceptions.map((m, mi) => (
                                  <div key={mi} className="text-xs mt-1">
                                    <span className="text-red-500 line-through">{m.studentSaid}</span>
                                    <span className="text-slate-500"> → </span>
                                    <span className="text-emerald-600">{m.correction}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {feedback.suggestions.length > 0 && (
                              <div>
                                <p className="text-xs text-indigo-600 font-medium">改进建议：</p>
                                <ul className="text-xs text-slate-600 list-disc list-inside">
                                  {feedback.suggestions.map((s, si) => <li key={si}>{s}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 py-2">评估失败，请重试</div>
                        )}
                        <button
                          onClick={() => {
                            setConstructiveSubmitted(prev => ({ ...prev, [prompt.id]: false }));
                            setConstructiveFeedbacks(prev => ({ ...prev, [prompt.id]: null }));
                          }}
                          className="text-xs text-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                          重新作答
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Evaluation criteria overview */}
              {constructiveTask.evaluationCriteria.length > 0 && (
                <div className="bg-white border border-slate-200/80 rounded-xl p-4">
                  <p className="text-sm text-slate-800 font-medium mb-2">评价标准参考</p>
                  <div className="space-y-2">
                    {constructiveTask.evaluationCriteria.map((ec) => (
                      <div key={ec.id} className="flex items-start gap-2">
                        <span className="text-xs text-indigo-500 font-mono mt-0.5">
                          {(ec.weight * 100).toFixed(0)}%
                        </span>
                        <div>
                          <p className="text-sm text-slate-700 font-medium">{ec.criterion}</p>
                          <p className="text-xs text-slate-500">{ec.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">结构化提示正在加载中...</p>
            </div>
          )}

          {/* Existing general summary section */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100/60">
            <p className="text-sm text-amber-800 font-medium">综合总结（可选）</p>
            <p className="text-xs text-amber-600/80 mt-1">完成上述结构化练习后，你也可以在此做一个整体总结。</p>
          </div>
          {!feedbackSubmitted ? (
            <>
              <textarea
                className="w-full min-h-[100px] px-4 py-3 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                placeholder="我理解的这个知识点是..."
                value={userSummary}
                onChange={e => setUserSummary(e.target.value)}
              />
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => goToStage(1)}>返回上一步</Button>
                <Button onClick={handleSubmitSummary} disabled={!userSummary.trim()}>提交总结</Button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-xl p-4 border border-slate-200/60">
                <p className="text-xs text-slate-400 mb-1">你的总结</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{userSummary}</p>
              </div>
              {feedbackLoading ? (
                <div className="flex items-center gap-2 text-sm text-indigo-500 py-4">
                  <div className="animate-spin h-4 w-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
                  AI正在评价你的总结...
                </div>
              ) : (
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-100/60">
                  <p className="text-xs text-emerald-600 font-medium mb-1">AI反馈</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{aiFeedback}</p>
                </div>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" disabled={feedbackLoading || gapCheckLoading} onClick={() => { setFeedbackSubmitted(false); setAiFeedback(''); setShowGapWarning(false); setCognitiveGaps(null); }}>
                  重新提交
                </Button>
                {!showGapWarning && (
                  <Button onClick={handleAdvanceFromConstructive} loading={gapCheckLoading} disabled={feedbackLoading || gapCheckLoading}>
                    下一步
                  </Button>
                )}
              </div>

              {/* Cognitive gap detection summary */}
              {showGapWarning && cognitiveGaps && (
                <div className="mt-4 bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-start gap-2 mb-3">
                    <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        AI 发现你在理解上存在以下缺口：
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        建议返回修改后再进入互动阶段，以获得更好的学习效果。
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2 mb-3">
                    {cognitiveGaps.gaps.map((gap, i) => {
                      const categoryLabels: Record<string, string> = {
                        missing_concept: '缺失概念',
                        superficial_understanding: '表层理解',
                        inability_to_transfer: '迁移困难',
                        misconception: '误解',
                      };
                      const categoryColors: Record<string, string> = {
                        missing_concept: 'bg-red-100 text-red-700',
                        superficial_understanding: 'bg-orange-100 text-orange-700',
                        inability_to_transfer: 'bg-amber-100 text-amber-700',
                        misconception: 'bg-pink-100 text-pink-700',
                      };
                      return (
                        <li key={i} className="bg-white rounded-lg p-3 border border-slate-100">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 text-xs rounded-full font-medium ${categoryColors[gap.category] || 'bg-slate-100 text-slate-600'}`}>
                              {categoryLabels[gap.category] || gap.category}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">{gap.description}</p>
                          <p className="text-xs text-indigo-600 mt-1">建议: {gap.suggestion}</p>
                        </li>
                      );
                    })}
                  </ul>

                  {cognitiveGaps.overallAssessment && (
                    <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                      {cognitiveGaps.overallAssessment}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowGapWarning(false);
                        setCognitiveGaps(null);
                      }}
                    >
                      返回修改
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowGapWarning(false);
                        goToStage(3);
                      }}
                    >
                      继续进入互动阶段
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Stage 3: Interactive */}
      {stage === 3 && (
        <div className="space-y-4">
          {/* Structured interactive tasks (NEW) */}
          {interactiveTaskLoading ? (
            <div className="flex items-center gap-2 text-sm text-purple-500 py-4">
              <div className="animate-spin h-4 w-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full" />
              正在生成互动深化任务...
            </div>
          ) : interactiveTask ? (
            <>
              {/* Socratic Questions — chat-like dialogue prompts */}
              {interactiveTask.socraticQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100/60">
                    <p className="text-sm text-purple-800 font-medium">苏格拉底式追问</p>
                    <p className="text-xs text-purple-600/80 mt-1">
                      点击问题即可在下方对话框中和AI展开讨论。
                    </p>
                  </div>
                  {interactiveTask.socraticQuestions.map((sq) => (
                    <div key={sq.id} className="bg-white border border-slate-200/80 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 text-xs font-bold flex items-center justify-center">
                          {sq.round}
                        </span>
                        <span className="text-xs text-slate-400">第{sq.round}轮 · 难度 {'★'.repeat(sq.difficulty)}</span>
                      </div>
                      <p className="text-sm text-slate-800 font-medium mb-3">{sq.question}</p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => {
                            setTutorChatInput(sq.question);
                            setTimeout(() => handleTutorChatSend(), 50);
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
                        >
                          在对话中回答
                        </button>
                        <details className="group text-xs">
                          <summary className="cursor-pointer text-slate-400 hover:text-slate-600 transition-colors">
                            查看提示
                          </summary>
                          <div className="mt-2 space-y-1.5">
                            {sq.followUpIfStuck && (
                              <div className="bg-amber-50 rounded-lg p-2">
                                <span className="text-amber-600 font-medium">卡住时：</span>
                                <span className="text-slate-600 ml-1">{sq.followUpIfStuck}</span>
                              </div>
                            )}
                            {sq.followUpIfCorrect && (
                              <div className="bg-emerald-50 rounded-lg p-2">
                                <span className="text-emerald-600 font-medium">答对后：</span>
                                <span className="text-slate-600 ml-1">{sq.followUpIfCorrect}</span>
                              </div>
                            )}
                            {sq.expectedConcepts.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {sq.expectedConcepts.map((c, ci) => (
                                  <span key={ci} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 text-xs rounded-full">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Variant Questions — challenge cards */}
              {interactiveTask.variantQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100/60">
                    <p className="text-sm text-indigo-800 font-medium">变式练习</p>
                    <p className="text-xs text-indigo-600/80 mt-1">
                      以下题目改变了原题条件，检验你是否真正理解而非机械记忆。
                    </p>
                  </div>
                  {interactiveTask.variantQuestions.map((vq) => {
                    const isSubmitted = variantSubmitted[vq.id];
                    const showAns = variantShowAnswer[vq.id];
                    const userAnswer = variantAnswers[vq.id] || '';
                    return (
                      <div key={vq.id} className="bg-white border border-slate-200/80 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full font-medium">
                            变式: {vq.variantOf}
                          </span>
                          <span className="text-xs text-slate-400">难度 {'★'.repeat(vq.difficulty)}</span>
                        </div>
                        <p className="text-sm text-slate-800 font-medium mb-3">{vq.stem}</p>
                        {!isSubmitted ? (
                          <>
                            {vq.options && vq.options.length > 0 ? (
                              <div className="space-y-1.5 mb-3">
                                {vq.options.map((opt, j) => (
                                  <label key={j} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                                    <input
                                      type="radio"
                                      name={`vq-${vq.id}`}
                                      value={opt.text}
                                      onChange={e => setVariantAnswers(prev => ({ ...prev, [vq.id]: e.target.value }))}
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
                                value={userAnswer}
                                onChange={e => setVariantAnswers(prev => ({ ...prev, [vq.id]: e.target.value }))}
                              />
                            )}
                            <Button
                              size="sm"
                              onClick={() => handleSubmitVariantAnswer(vq.id)}
                              disabled={!userAnswer.trim()}
                            >
                              提交答案
                            </Button>
                          </>
                        ) : (
                          <div className={`p-3 rounded-lg text-sm ${showAns ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50'}`}>
                            <p className="font-semibold text-emerald-800">答案: {vq.answer}</p>
                            {vq.explanation && <p className="text-emerald-700/80 mt-1 text-xs">{vq.explanation}</p>}
                            <button
                              onClick={() => {
                                setVariantSubmitted(prev => ({ ...prev, [vq.id]: false }));
                                setVariantShowAnswer(prev => ({ ...prev, [vq.id]: false }));
                                setVariantAnswers(prev => ({ ...prev, [vq.id]: '' }));
                              }}
                              className="mt-2 text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
                            >
                              重新作答
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Scenario Challenges — immersive task cards */}
              {interactiveTask.scenarioChallenges.length > 0 && (
                <div className="space-y-3">
                  <div className="bg-teal-50 rounded-xl p-4 border border-teal-100/60">
                    <p className="text-sm text-teal-800 font-medium">情境挑战</p>
                    <p className="text-xs text-teal-600/80 mt-1">
                      将所学知识应用于真实场景，检验迁移能力。
                    </p>
                  </div>
                  {interactiveTask.scenarioChallenges.map((sc) => {
                    const isSubmitted = scenarioSubmitted[sc.id];
                    const feedback = scenarioFeedbacks[sc.id];
                    const isLoading = scenarioFeedbackLoading[sc.id];
                    return (
                      <div key={sc.id} className="bg-white border border-slate-200/80 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-teal-50 text-teal-600 text-xs rounded-full font-medium">
                            情境模拟
                          </span>
                          <span className="text-xs text-slate-400">难度 {'★'.repeat(sc.difficulty)}</span>
                        </div>
                        <div className="bg-gradient-to-br from-slate-50 to-teal-50/50 rounded-xl p-3 mb-3">
                          <p className="text-xs text-slate-500 font-medium mb-1">场景描述</p>
                          <p className="text-sm text-slate-700">{sc.scenario}</p>
                        </div>
                        <p className="text-sm text-slate-800 font-medium mb-1">任务要求</p>
                        <p className="text-sm text-slate-600 mb-3">{sc.task}</p>
                        {sc.rubric.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {sc.rubric.map((r, ri) => (
                              <span key={ri} className="px-2 py-0.5 bg-teal-50 text-teal-600 text-xs rounded-full">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {!isSubmitted ? (
                          <>
                            <textarea
                              className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200"
                              placeholder="写下你的方案..."
                              value={scenarioResponses[sc.id] || ''}
                              onChange={e => setScenarioResponses(prev => ({ ...prev, [sc.id]: e.target.value }))}
                            />
                            <div className="flex justify-end mt-2">
                              <Button
                                size="sm"
                                onClick={() => handleSubmitScenarioChallenge(sc.id)}
                                disabled={!scenarioResponses[sc.id]?.trim() || isLoading}
                                loading={isLoading}
                              >
                                提交方案
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-2">
                            <div className="bg-slate-50 rounded-lg p-3">
                              <p className="text-xs text-slate-400 mb-0.5">你的方案</p>
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{scenarioResponses[sc.id]}</p>
                            </div>
                            {isLoading ? (
                              <div className="flex items-center gap-2 text-sm text-indigo-500 py-2">
                                <div className="animate-spin h-3 w-3 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full" />
                                AI正在评估...
                              </div>
                            ) : feedback ? (
                              <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-3 border border-emerald-100/60">
                                <p className="text-xs text-emerald-600 font-medium mb-1">AI反馈</p>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{feedback}</p>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400 py-2">提交失败，请重试</div>
                            )}
                            <button
                              onClick={() => {
                                setScenarioSubmitted(prev => ({ ...prev, [sc.id]: false }));
                                setScenarioFeedbacks(prev => ({ ...prev, [sc.id]: '' }));
                              }}
                              className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
                            >
                              重新作答
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">互动任务正在加载中...</p>
            </div>
          )}

          {/* Existing chat interface */}
          <div className="bg-purple-50 rounded-xl p-4 border border-purple-100/60">
            <p className="text-purple-800 font-medium text-sm">AI对话区</p>
            <p className="text-xs text-purple-600/80 mt-1">
              与AI自由对话，它会围绕{knowledgeNodeTitle}追问并帮助你深入理解。
            </p>
          </div>

          <div className="space-y-3 max-h-[280px] overflow-y-auto min-h-[120px]">
            {tutorChatMessages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-slate-400">开始与AI对话，探讨{knowledgeNodeTitle}</p>
              </div>
            )}
            {tutorChatMessages.map((msg, i) => (
              <div key={i} className={`p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-50 ml-6' : 'bg-slate-50 mr-6'}`}>
                <p className="text-xs text-slate-400 mb-0.5">{msg.role === 'user' ? '你' : 'AI'}</p>
                <p className="text-slate-700 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
            {tutorChatLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-400 p-2">
                <div className="animate-spin h-3 w-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full" />
                AI思考中...
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200"
              placeholder="输入你的回答或提问..."
              value={tutorChatInput}
              onChange={e => setTutorChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTutorChatSend()}
            />
            <Button size="sm" onClick={handleTutorChatSend} loading={tutorChatLoading} disabled={!tutorChatInput.trim()}>
              发送
            </Button>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => goToStage(2)}>返回上一步</Button>
            <Button onClick={() => {
              recordStageTime('interactive');
              setResults(prev => ({ ...prev, interactive: { ...prev.interactive, completed: true } }));
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem(draftStorageKey);
              }
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
