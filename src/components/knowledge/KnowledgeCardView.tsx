'use client';

import { authFetch } from '@/lib/auth';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getDifficultyLabel } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import { ICAP_LABELS, SUBJECT_CONFIG } from '@/types';
import type { IcapLevel, SubjectName, WorkedExample } from '@/types';
import { RepresentationView } from './RepresentationView';
import { LatexText } from '@/components/ui/LatexText';
import { BoundaryCallout } from './BoundaryCallout';
import { progressiveDisclosure } from '@/lib/ui-density';

type RepresentationData = Record<string, unknown>;

interface KnowledgeCard {
  id: string;
  cardType: string;
  title: string;
  content: string;
}

interface KnowledgeCardNode {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  difficulty: number;
  cognitiveLoad: number;
  icapLevel: string;
  masteryLevel: number;
  subject?: { name: string };
  chapter?: { title: string };
  commonMistakes: string[];
  typicalQuestions: string[];
  prerequisites: string[];
  prerequisiteNodes?: { id: string; title: string }[];
  knowledgeCards: unknown[];
  representationType?: string | null;
  representationData?: unknown;
}

interface WorkedExampleResponse {
  error?: string;
  workedExample?: WorkedExample;
  knowledgeCard?: KnowledgeCard;
}

interface RepresentationResponse {
  error?: string;
  representationType?: string | null;
  representationData?: RepresentationData | null;
}

interface TtsResponse {
  audioUrl?: string;
}

function isKnowledgeCard(value: unknown): value is KnowledgeCard {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'cardType' in value &&
    'title' in value &&
    'content' in value &&
    typeof value.id === 'string' &&
    typeof value.cardType === 'string' &&
    typeof value.title === 'string' &&
    typeof value.content === 'string'
  );
}

function isRepresentationData(value: unknown): value is RepresentationData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 所有可用的表征类型（用于下拉选择）
const ALL_REPRESENTATION_TYPES = [
  { value: '', label: '自动检测' },
  { value: 'formula', label: '📐 公式' },
  { value: 'force', label: '⚡ 受力分析' },
  { value: 'reaction', label: '🧪 化学反应' },
  { value: 'timeline', label: '📅 时间线' },
  { value: 'causal', label: '🔗 因果链' },
  { value: 'step', label: '📋 步骤流程' },
  { value: 'template', label: '📝 答题模板' },
  { value: 'comparison', label: '📊 对比表' },
  { value: 'mindmap', label: '🗺️ 思维导图' },
  { value: 'concept_map', label: '🧠 概念图' },
  // Subject-specific types (matches the engine allowlist)
  { value: 'concept', label: '💡 概念' },
  { value: 'experiment', label: '🔬 实验' },
  { value: 'classification', label: '🗂️ 分类' },
  { value: 'diagram', label: '📈 图示' },
  { value: 'process', label: '🔄 流程' },
  { value: 'figure', label: '👤 人物' },
  { value: 'event', label: '📌 事件' },
  { value: 'map', label: '🗺️ 地图' },
  { value: 'climate', label: '🌤️ 气候' },
  { value: 'keyword', label: '🔑 关键词' },
  { value: 'text', label: '📄 文本' },
  { value: 'poem', label: '📜 诗词' },
  { value: 'essay', label: '✍️ 文章' },
  { value: 'viewpoint', label: '💬 观点' },
];

interface KnowledgeCardViewProps {
  node: KnowledgeCardNode;
  onTTS?: (text: string) => void;
  onGenerateImage?: (prompt: string) => void;
  generatingImage?: boolean;
  initialAudioUrl?: string | null;
}

export function KnowledgeCardView({
  node,
  onTTS,
  onGenerateImage,
  generatingImage = false,
  initialAudioUrl = null,
}: KnowledgeCardViewProps) {
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(initialAudioUrl);
  const [savedKnowledgeCards, setSavedKnowledgeCards] = useState<KnowledgeCard[]>(
    () => (node.knowledgeCards || []).filter(isKnowledgeCard),
  );

  useEffect(() => {
    queueMicrotask(() => {
      setAudioUrl(initialAudioUrl);
    });
  }, [initialAudioUrl, node.id]);

  useEffect(() => {
    queueMicrotask(() => {
      setSavedKnowledgeCards((node.knowledgeCards || []).filter(isKnowledgeCard));
    });
  }, [node.id, node.knowledgeCards]);

  // Progressive disclosure: chunk summary by cognitive load, show expand/collapse
  const summaryChunked = progressiveDisclosure(node.summary || '', node.cognitiveLoad);
  const hasHiddenContent = summaryChunked.hidden.length > 0;
  const [showFullSummary, setShowFullSummary] = useState(false);

  // 表征状态 — 父组件统一管理
  const [repType, setRepType] = useState<string>(node.representationType || '');
  const initialRepresentationData = isRepresentationData(node.representationData)
    ? node.representationData
    : null;
  const [repData, setRepData] = useState<RepresentationData | null>(initialRepresentationData);
  const [repLoading, setRepLoading] = useState(false);
  const [repError, setRepError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setRepType(node.representationType || '');
      setRepData(initialRepresentationData);
    });
  }, [initialRepresentationData, node.id, node.representationType]);

  // 合并表征数据到 node 形对象
  const repNode = {
    id: node.id,
    title: node.title,
    summary: node.summary,
    subject: node.subject,
    representationType: repType || node.representationType || null,
    representationData: repData ?? initialRepresentationData,
  };

  const subjectRepTypes =
    SUBJECT_CONFIG[node.subject?.name as SubjectName]?.representationTypes ?? [];

  // ========== Worked Example interaction state ==========
  const [weSolutionVisible, setWeSolutionVisible] = useState<Record<string, boolean>>({});
  const [weStepsExpanded, setWeStepsExpanded] = useState<Record<string, boolean>>({});
  const [weSimilarVisible, setWeSimilarVisible] = useState<Record<string, boolean>>({});
  const [weAnswerRevealed, setWeAnswerRevealed] = useState<Record<string, boolean>>({});
  const [weGenerating, setWeGenerating] = useState(false);
  const [weError, setWeError] = useState<string | null>(null);
  const [weResult, setWeResult] = useState<WorkedExample | null>(null);

  // 当前播放的 TTS 音频句柄：组件卸载时必须暂停，否则页面切走后声音还在播
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const playAudio = (url: string) => {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    void audio.play();
  };

  const handleTTS = async () => {
    if (onTTS) {
      onTTS(`${node.title}。${node.summary}`);
      return;
    }

    if (audioUrl) {
      playAudio(audioUrl);
      return;
    }

    setTtsPlaying(true);
    try {
      const res = await authFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${node.title}。${node.summary}`,
          contentType: 'card',
          contentRefId: node.id,
        }),
      });
      const data = await res.json() as TtsResponse;
      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
        playAudio(data.audioUrl);
      }
    } catch (err) {
      console.error('TTS failed:', err);
    } finally {
      setTtsPlaying(false);
    }
  };

  const handleGenerateImage = () => {
    onGenerateImage?.(
      `中学${node.subject?.name || ''}知识点：${node.title}，${node.summary}`,
    );
  };

  /** Generate a worked example for this knowledge node */
  const handleGenerateWorkedExample = async () => {
    setWeGenerating(true);
    setWeError(null);

    try {
      const res = await authFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-worked-example',
          knowledgeNodeId: node.id,
          subject: node.subject?.name,
          difficulty: node.difficulty,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const data = await res.json() as WorkedExampleResponse;
      if (data.knowledgeCard && isKnowledgeCard(data.knowledgeCard)) {
        setSavedKnowledgeCards(prev => [
          data.knowledgeCard as KnowledgeCard,
          ...prev.filter(card => card.id !== data.knowledgeCard?.id),
        ]);
        setWeResult(null);
      } else if (data.workedExample) {
        setWeResult(data.workedExample);
      }
    } catch (err: unknown) {
      setWeError(getErrorMessage(err, 'Generate worked example failed'));
      console.error('[KnowledgeCardView] Generate worked example failed:', err);
    } finally {
      setWeGenerating(false);
    }
  };

  /** Parse a knowledge card's content as a WorkedExample */
  const parseWorkedExample = (content: string): WorkedExample | null => {
    try {
      return JSON.parse(content) as WorkedExample;
    } catch {
      return null;
    }
  };

  // Collect worked examples from existing cards + newly generated
  const knowledgeCards = savedKnowledgeCards;
  const workedExampleCards = knowledgeCards.filter(
    (c) => c.cardType === 'worked_example',
  );
  const otherCards = knowledgeCards.filter(
    (c) => c.cardType !== 'worked_example',
  );

  /** 自动检测 + 生成表征（RepresentationView 的 onDetect 回调） */
  const handleDetect = async () => {
    setRepLoading(true);
    setRepError(null);

    try {
      const res = await authFetch('/api/representation/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeNodeId: node.id }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const result = await res.json() as RepresentationResponse;
      setRepType(result.representationType || '');
      setRepData(result.representationData || null);
    } catch (err: unknown) {
      setRepError(getErrorMessage(err, 'Generate representation failed'));
      console.error('[KnowledgeCardView] Detect failed:', err);
    } finally {
      setRepLoading(false);
    }
  };

  /** 重新生成表征（使用当前选定的类型） */
  const handleRegenerate = async () => {
    setRepLoading(true);
    setRepError(null);

    try {
      const res = await authFetch('/api/representation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeNodeId: node.id,
          representationType: repType || undefined,
          // 显式"重新生成"必须绕过服务端缓存（缓存只挡无意识的重复调用）
          force: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      const result = await res.json() as RepresentationResponse;
      setRepType(result.representationType || '');
      setRepData(result.representationData || null);
    } catch (err: unknown) {
      setRepError(getErrorMessage(err, 'Regenerate representation failed'));
      console.error('[KnowledgeCardView] Regenerate failed:', err);
    } finally {
      setRepLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 主知识卡 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            {node.subject && <Badge variant="info">{node.subject.name}</Badge>}
            {node.chapter && (
              <Badge variant="default">{node.chapter.title}</Badge>
            )}
            <Badge variant="purple">
              {ICAP_LABELS[node.icapLevel as IcapLevel]}
            </Badge>
            <span className="text-xs text-slate-400">
              {getDifficultyLabel(node.difficulty)} · 认知负荷:{' '}
              {/* repeat 必须钳制：LLM 脏数据（负数/超大）会 RangeError 崩渲染 */}
              {'★'.repeat(Math.max(0, Math.min(5, Math.round(node.cognitiveLoad || 0))))}
            </span>
          </div>
        </CardHeader>

        <h2 className="text-xl font-bold text-slate-800 tracking-tight mb-3">
          {node.title}
        </h2>
        <div className="text-slate-600 leading-relaxed text-[15px] mb-4">
          <LatexText text={showFullSummary ? (node.summary || '') : summaryChunked.visible} />
          {hasHiddenContent && (
            <button
              onClick={() => setShowFullSummary(prev => !prev)}
              className="block mt-1 text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              {showFullSummary ? '收起' : '展开更多'}
            </button>
          )}
        </div>

        {/* 关键词 */}
        {node.keywords && node.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {node.keywords.map((kw, i) => (
              <span
                key={i}
                className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium"
              >
                #{kw}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleTTS}
              loading={ttsPlaying}
            >
              朗读
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGenerateImage}
              loading={generatingImage}
              disabled={generatingImage}
            >
              生成配图
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleGenerateWorkedExample}
              loading={weGenerating}
              disabled={weGenerating}
            >
              生成样例
            </Button>
          </div>
          {generatingImage && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-indigo-600">
                <svg
                  className="w-3.5 h-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    fill="currentColor"
                    className="opacity-75"
                  />
                </svg>
                AI 正在生成配图...
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 rounded-full animate-progress" />
              </div>
            </div>
          )}
          {weGenerating && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <svg
                  className="w-3.5 h-3.5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    fill="currentColor"
                    className="opacity-75"
                  />
                </svg>
                AI 正在生成样例教学...
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 rounded-full animate-progress" />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ========== Worked Example 样例教学 ========== */}
      {/* Error message */}
      {weError && !weGenerating && (
        <Card padding="sm">
          <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
            {weError}
          </p>
        </Card>
      )}

      {/* Newly generated worked example */}
      {weResult && (
        <WorkedExampleDisplay
          example={weResult}
          solutionVisible={weSolutionVisible['new'] || false}
          stepsExpanded={weStepsExpanded['new'] || false}
          similarVisible={weSimilarVisible['new'] || false}
          answerRevealed={weAnswerRevealed['new'] || false}
          onToggleSolution={() =>
            setWeSolutionVisible(prev => {
              const next = { ...prev, new: !prev['new'] };
              if (!prev['new']) {
                // When solution is first revealed, show similar problem section
                setWeSimilarVisible(s => ({ ...s, new: true }));
              }
              return next;
            })
          }
          onToggleSteps={() =>
            setWeStepsExpanded(prev => ({ ...prev, new: !prev['new'] }))
          }
          onRevealAnswer={() =>
            setWeAnswerRevealed(prev => ({ ...prev, new: !prev['new'] }))
          }
        />
      )}

      {/* Existing saved worked example cards */}
      {workedExampleCards.map((card) => {
        const we = parseWorkedExample(card.content);
        if (!we) return null;
        return (
          <WorkedExampleDisplay
            key={card.id}
            example={we}
            solutionVisible={weSolutionVisible[card.id] || false}
            stepsExpanded={weStepsExpanded[card.id] || false}
            similarVisible={weSimilarVisible[card.id] || false}
            answerRevealed={weAnswerRevealed[card.id] || false}
            onToggleSolution={() =>
              setWeSolutionVisible(prev => {
                const next = { ...prev, [card.id]: !prev[card.id] };
                if (!prev[card.id]) {
                  setWeSimilarVisible(s => ({ ...s, [card.id]: true }));
                }
                return next;
              })
            }
            onToggleSteps={() =>
              setWeStepsExpanded(prev => ({ ...prev, [card.id]: !prev[card.id] }))
            }
            onRevealAnswer={() =>
              setWeAnswerRevealed(prev => ({ ...prev, [card.id]: !prev[card.id] }))
            }
          />
        );
      })}

      {/* 表征视图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[15px]">表征视图</CardTitle>
        </CardHeader>

        {/* 表征类型选择器 + 操作按钮 */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 font-medium">类型:</label>
            <select
              value={repType}
              onChange={(e) => setRepType(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
            >
              {ALL_REPRESENTATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleRegenerate}
            loading={repLoading}
            disabled={repLoading}
          >
            重新生成
          </Button>

          {subjectRepTypes.length > 0 && (
            <span className="text-[11px] text-slate-400">
              学科推荐: {subjectRepTypes.join(' / ')}
            </span>
          )}
        </div>

        {repError && !repLoading && (
          <p className="text-xs text-red-500 mb-3 bg-red-50 rounded-lg px-3 py-1.5">
            {repError}
          </p>
        )}

        {/* 表征视图组件 — 由 KnowledgeCardView 管理所有状态 */}
        <RepresentationView
          node={repNode}
          autoDetect
          loading={repLoading}
          error={repError}
          onDetect={handleDetect}
          onRegenerate={handleRegenerate}
        />

        {typeof repData?.boundary === 'string' && <BoundaryCallout boundary={repData.boundary} />}
      </Card>

      {/* 前置知识 */}
      {node.prerequisites && node.prerequisites.length > 0 && (
        <Card>
          <CardTitle className="text-[15px]">前置知识</CardTitle>
          <ul className="mt-3 space-y-1.5">
            {node.prerequisites.map((pre, i) => {
              // Exact node match (from prerequisiteNodes in the API
              // response) — direct link to the card page for full
              // ICAP training + practice.
              const pnode = (node.prerequisiteNodes || []).find(
                (n) => n.title === pre || n.title.includes(pre) || pre.includes(n.title),
              );
              if (pnode) {
                return (
                  <li key={i} className="text-sm flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                    <Link
                      href={`/cards/${pnode.id}`}
                      className="text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                    >
                      <LatexText text={pre} />
                    </Link>
                  </li>
                );
              }
              // Fallback: no exact node match — inline button that calls
              // the AI to generate a friendly explanation + examples,
              // creates a KnowledgeNode, and redirects to /cards/[id].
              return (
                <li key={i} className="text-sm flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await authFetch('/api/knowledge/explain-concept', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            concept: pre,
                            subject: node.subject?.name || '通用',
                            contextTitle: node.title,
                          }),
                        });
                        const data = (await res.json()) as { nodeId?: string; error?: string };
                        if (!res.ok || !data.nodeId) throw new Error(data.error || '解释生成失败');
                        window.location.href = `/cards/${data.nodeId}`;
                      } catch {
                        // fallback to search on failure
                        window.location.href = `/search?q=${encodeURIComponent(pre)}`;
                      }
                    }}
                    className="text-amber-600 hover:text-amber-800 hover:underline transition-colors text-left"
                  >
                    <LatexText text={pre} />
                    <span className="ml-1 text-[10px] text-amber-500">🤖 AI解释+举例</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* 常见错误 */}
      {node.commonMistakes && node.commonMistakes.length > 0 && (
        <Card>
          <CardTitle className="text-[15px]">常见错误</CardTitle>
          <ul className="mt-3 space-y-1.5">
            {node.commonMistakes.map((m, i) => (
              <li
                key={i}
                className="text-sm text-red-600 flex items-start gap-2.5"
              >
                <svg
                  className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                <LatexText text={m} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 典型题型 */}
      {node.typicalQuestions && node.typicalQuestions.length > 0 && (
        <Card>
          <CardTitle className="text-[15px]">典型题型</CardTitle>
          <ul className="mt-3 space-y-1.5">
            {node.typicalQuestions.map((q, i) => (
              <li
                key={i}
                className="text-sm text-slate-600 flex items-start gap-2.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <LatexText text={q} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 关联知识卡片 */}
      {otherCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {otherCards.map((card) => (
            <Card key={card.id} padding="sm" hover>
              <div className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">
                {card.cardType}
              </div>
              <div className="font-medium text-sm text-slate-800">
                {card.title}
              </div>
              <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                <LatexText text={card.content || ''} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== Worked Example Display (sub-component) ==========
function WorkedExampleDisplay({
  example,
  solutionVisible,
  stepsExpanded,
  similarVisible,
  answerRevealed,
  onToggleSolution,
  onToggleSteps,
  onRevealAnswer,
}: {
  example: WorkedExample;
  solutionVisible: boolean;
  stepsExpanded: boolean;
  similarVisible: boolean;
  answerRevealed: boolean;
  onToggleSolution: () => void;
  onToggleSteps: () => void;
  onRevealAnswer: () => void;
}) {
  return (
    <Card>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="success">样例教学</Badge>
        <span className="text-[11px] text-slate-400">
          认知负荷理论 · 样例→练习
        </span>
      </div>

      {/* Problem Statement — always visible, prominent */}
      <div className="mb-4 p-4 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border border-amber-200/60">
        <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">
          例题
        </div>
        <p className="text-[15px] text-slate-800 font-medium leading-relaxed">
          {example.problem}
        </p>
      </div>

      {/* Solution Section — initially collapsed per CLT */}
      {!solutionVisible ? (
        <div className="text-center py-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleSolution}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            查看解答
          </Button>
          <p className="text-[11px] text-slate-400 mt-1.5">
            先尝试自己思考，再查看解答
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Full Solution */}
          <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/60">
            <div className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide mb-2">
              完整解答
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {example.solution}
            </p>
          </div>

          {/* Reasoning Steps — expandable accordion */}
          {example.reasoningSteps && example.reasoningSteps.length > 0 && (
            <div>
              <button
                onClick={onToggleSteps}
                className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors w-full text-left py-1"
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${stepsExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                逐步推理
                <span className="text-slate-400">
                  ({example.reasoningSteps.length} 步)
                </span>
                <span className="text-[11px] text-slate-400 ml-1">
                  {stepsExpanded ? '收起' : '展开'}
                </span>
              </button>

              {stepsExpanded && (
                <div className="mt-3 space-y-3 pl-6 border-l-2 border-indigo-200">
                  {example.reasoningSteps.map((rs, i) => (
                    <div key={i} className="relative">
                      {/* Step number badge */}
                      <div className="absolute -left-[2.15rem] top-0.5 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center">
                        {rs.step}
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {rs.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Similar Problem Section — shown after solution is viewed */}
          {similarVisible && example.similarProblem && (
            <div className="mt-4 p-4 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl border border-teal-200/60">
              <div className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide mb-1.5">
                尝试类似题目
              </div>
              <p className="text-[15px] text-slate-800 font-medium leading-relaxed mb-3">
                {example.similarProblem}
              </p>

              {!answerRevealed ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRevealAnswer}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 10.5v5.25m0 2.25h.008v.008H12v-.008zM12 2.25c-5.385 0-10 4.615-10 10s4.615 10 10 10 10-4.615 10-10S17.385 2.25 12 2.25z"
                    />
                  </svg>
                  显示答案
                </Button>
              ) : (
                <div className="bg-white/70 rounded-lg p-3 border border-emerald-200/60">
                  <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">
                    参考答案
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {example.similarProblemSolution}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Collapse solution button */}
          <div className="text-center pt-1">
            <button
              onClick={onToggleSolution}
              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              收起解答
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
