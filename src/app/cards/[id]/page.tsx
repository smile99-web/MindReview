'use client';

import { authFetch } from '@/lib/auth';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { KnowledgeCardView } from '@/components/knowledge/KnowledgeCardView';
import { MindMap } from '@/components/mindmap/MindMap';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LatexText } from '@/components/ui/LatexText';

interface RelatedKnowledgeNode {
  id: string;
  title: string;
  summary?: string | null;
  subject?: { name: string };
  chapter?: { id?: string; title: string };
  chapterId?: string | null;
}

interface KnowledgeEdge {
  id?: string;
  fromId?: string;
  toId?: string;
  relationType?: string;
  label?: string | null;
  from: RelatedKnowledgeNode;
  to: RelatedKnowledgeNode;
}

interface KnowledgeCardNode extends RelatedKnowledgeNode {
  subjectId: string;
  chapterId?: string | null;
  summary: string;
  keywords: string[];
  difficulty: number;
  cognitiveLoad: number;
  icapLevel: string;
  masteryLevel: number;
  commonMistakes: string[];
  typicalQuestions: string[];
  prerequisites: string[];
  knowledgeCards: unknown[];
  questions?: PracticeQuestion[];
  outgoingEdges?: KnowledgeEdge[];
  incomingEdges?: KnowledgeEdge[];
  representationType?: string | null;
  representationData?: unknown;
  navigation?: CardNavigation;
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
}

interface SchemaSuggestion {
  id: string;
  title?: string;
  name?: string;
  summary?: string | null;
  nodesCount?: number;
}

interface UnmetPrerequisite {
  nodeId: string;
  title: string;
  masteryLevel: number;
  requiredLevel: number;
}

interface CardNavigationItem {
  id: string;
  title: string;
}

interface CardNavigation {
  previous: CardNavigationItem | null;
  next: CardNavigationItem | null;
  index: number;
  total: number;
  scopeLabel: string;
}

export default function KnowledgeCardPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [node, setNode] = useState<KnowledgeCardNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'card' | 'mindmap' | 'practice'>('card');
  const [practiceAnswers, setPracticeAnswers] = useState<Record<string, string>>({});
  const [practiceChecked, setPracticeChecked] = useState<Record<string, boolean>>({});
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<SchemaSuggestion[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [selectedSchemaIds, setSelectedSchemaIds] = useState<Set<string>>(new Set());
  const [buildingSchema, setBuildingSchema] = useState(false);
  const [unmetPrerequisites, setUnmetPrerequisites] = useState<UnmetPrerequisite[]>([]);

  const navigateToCard = useCallback((targetId?: string | null) => {
    if (!targetId || targetId === id) return;
    router.push(`/cards/${targetId}`);
  }, [id, router]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setNode(null);
        setQuestions([]);
        setPracticeAnswers({});
        setPracticeChecked({});
        setUnmetPrerequisites([]);
        const res = await authFetch(`/api/knowledge/${id}`);
        if (!res.ok) throw new Error('知识点不存在');
        const data = await res.json();
        setNode(data);
        setQuestions(data.questions || []);

        // Check prerequisites for this node
        try {
          const prereqRes = await authFetch('/api/path/prerequisites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeIds: [id] }),
          });
          const prereqData = await prereqRes.json();
          if (prereqData.results?.[id] && !prereqData.results[id].canAccess) {
            setUnmetPrerequisites(prereqData.results[id].blockedBy || []);
          }
        } catch { /* ignore */ }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    async function loadImage() {
      try {
        const res = await authFetch(`/api/image?contentRefId=${id}&status=success&limit=1`);
        const images = await res.json();
        if (Array.isArray(images) && images.length > 0 && images[0].imageUrl) {
          setImageUrl(images[0].imageUrl);
        }
      } catch {
        // no existing image
      }
    }

    async function loadAudio() {
      try {
        const res = await authFetch(`/api/tts?contentType=card&contentRefId=${id}&limit=1`);
        const assets = await res.json();
        if (Array.isArray(assets) && assets.length > 0 && assets[0].audioUrl) {
          setAudioUrl(assets[0].audioUrl);
        }
      } catch {
        // no existing audio
      }
    }

    load();
    loadImage();
    loadAudio();
  }, [id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditing =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable;

      if (isEditing || !node?.navigation) return;

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
        if (node.navigation.previous) {
          event.preventDefault();
          navigateToCard(node.navigation.previous.id);
        }
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
        if (node.navigation.next) {
          event.preventDefault();
          navigateToCard(node.navigation.next.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateToCard, node?.navigation]);

  useEffect(() => {
    async function loadSchemas() {
      setSchemasLoading(true);
      try {
        const res = await authFetch(`/api/schema/suggest?knowledgeNodeId=${id}`);
        const data = await res.json();
        setSchemas(data.suggestions || []);
      } catch { /* ignore */ }
      setSchemasLoading(false);
    }
    loadSchemas();
  }, [id]);

  const handleGenerateQuestions = async () => {
    setGeneratingQuestions(true);
    try {
      const res = await authFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-questions',
          knowledgeNodeId: id,
          questionType: 'multiple_choice',
          icapLevel: 'Active',
          count: 3,
        }),
      });
      const data = await res.json();
      if (data.questions) {
        setQuestions(data.questions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleGenerateImage = async (prompt: string) => {
    setGeneratingImage(true);
    setImageError(null);
    try {
      const res = await authFetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          imageType: 'knowledge',
          contentRefId: id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.imageUrl) {
        setImageUrl(data.imageUrl);
      } else if (data.error || data.errorMessage) {
        const rawMessage = data.error || data.errorMessage;
        setImageError(
          String(rawMessage).includes('SEEDREAM_API_KEY')
            ? '配图生成失败：请先在设置页配置图片生成 API Key。'
            : `配图生成失败：${rawMessage}`,
        );
      } else {
        setImageError(`配图生成失败：服务返回 ${res.status}`);
      }
    } catch (err) {
      setImageError('图片生成失败，请重试');
      console.error('Image generation failed:', err);
    } finally {
      setGeneratingImage(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8 text-center">
        <p className="text-slate-500">知识点不存在</p>
        <Link href="/subjects" className="text-indigo-500 hover:text-indigo-600 font-medium mt-2 inline-block transition-colors">
          返回学科列表
        </Link>
      </div>
    );
  }

  const tabs = [
    { key: 'card' as const, label: '知识卡', icon: '📖' },
    { key: 'practice' as const, label: '练习', icon: '✏️' },
    { key: 'mindmap' as const, label: '关联图', icon: '🗺️' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <Link href="/subjects" className="hover:text-indigo-500 transition-colors font-medium">学科</Link>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        {node.subject && (
          <>
            <Link href={`/subjects/${node.subjectId}`} className="hover:text-indigo-500 transition-colors font-medium">
              {node.subject.name}
            </Link>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </>
        )}
        {node.chapter && (
          <>
            <Link href={`/chapters/${node.chapterId}`} className="hover:text-indigo-500 transition-colors font-medium">
              {node.chapter.title}
            </Link>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </>
        )}
        <span className="text-slate-600 truncate font-medium">{node.title}</span>
      </div>

      {node.navigation && node.navigation.total > 1 && (
        <div className="mb-6 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-400">连续浏览</p>
              <p className="mt-0.5 truncate text-sm text-slate-600">
                {node.navigation.scopeLabel} · 第 {node.navigation.index} / {node.navigation.total} 个知识点
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!node.navigation.previous}
                onClick={() => navigateToCard(node.navigation?.previous?.id)}
                title={node.navigation.previous ? `上一页：${node.navigation.previous.title}` : '已经是第一个知识点'}
              >
                ↑ 上一页
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!node.navigation.next}
                onClick={() => navigateToCard(node.navigation?.next?.id)}
                title={node.navigation.next ? `下一页：${node.navigation.next.title}` : '已经是最后一个知识点'}
              >
                下一页 ↓
              </Button>
            </div>
          </div>
          <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <span className="truncate">
              上一页：{node.navigation.previous?.title || '无'}
            </span>
            <span className="truncate sm:text-right">
              下一页：{node.navigation.next?.title || '无'}
            </span>
          </div>
        </div>
      )}

      {/* Prerequisite warning banner */}
      {unmetPrerequisites.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/80 to-yellow-50/80">
          <div className="flex items-start gap-3">
            <span className="text-lg shrink-0 mt-0.5">🔒</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">建议先复习以下前置知识点：</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {unmetPrerequisites.map((p) => (
                  <Link
                    key={p.nodeId}
                    href={`/cards/${p.nodeId}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-medium hover:bg-amber-200 transition-colors"
                  >
                    {p.title}
                    <span className="text-amber-500">({p.masteryLevel}/{p.requiredLevel})</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-white/60 backdrop-blur rounded-xl p-1 border border-slate-200/60 inline-flex shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-white text-indigo-600 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.02)]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'card' && (
        <div>
          <KnowledgeCardView
            node={node}
            onGenerateImage={handleGenerateImage}
            generatingImage={generatingImage}
            initialAudioUrl={audioUrl}
          />
          {imageUrl && (
            <Card className="mt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800 text-[15px]">AI生成配图</h3>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={generatingImage}
                  disabled={generatingImage}
                  onClick={() => handleGenerateImage(
                    `中学${node.subject?.name || ''}知识点：${node.title}，${node.summary}`
                  )}
                >
                  重新生成
                </Button>
              </div>
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- AI providers return temporary external URLs that are not known at build time. */}
                <img
                  src={imageUrl}
                  alt={node.title}
                  className="h-full w-full object-contain"
                />
              </div>
            </Card>
          )}
          {imageError && (
            <Card className="mt-4 border-red-200 bg-red-50/50">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {imageError}
              </div>
            </Card>
          )}

          {/* 相关图式 */}
          <div className="mt-6">
            <h3 className="font-semibold text-slate-800 mb-3 text-[15px]">相关图式</h3>
            {schemasLoading ? (
              <div className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
            ) : schemas.length === 0 ? (
              <p className="text-sm text-slate-400">暂无推荐的图式关联</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {schemas.map((s) => {
                    const isSelected = selectedSchemaIds.has(s.id);
                    return (
                      <Card
                        key={s.id}
                        hover
                        padding="sm"
                        className={isSelected ? 'ring-2 ring-indigo-300 border-indigo-300' : ''}
                        onClick={() => {
                          const next = new Set(selectedSchemaIds);
                          if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                          setSelectedSchemaIds(next);
                        }}
                      >
                        <h4 className="font-medium text-slate-800 text-sm truncate">{s.title || s.name}</h4>
                        {s.summary && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{s.summary}</p>}
                        {s.nodesCount !== undefined && (
                          <div className="flex items-center gap-1 mt-2">
                            <Badge variant="info" size="sm">{s.nodesCount} 节点</Badge>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
                <Button
                  className="mt-3"
                  size="sm"
                  disabled={selectedSchemaIds.size === 0}
                  loading={buildingSchema}
                  onClick={async () => {
                    setBuildingSchema(true);
                    try {
                      await authFetch('/api/schema/build', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          nodeIds: Array.from(selectedSchemaIds),
                        }),
                      });
                      setSelectedSchemaIds(new Set());
                      // reload schemas
                      const res = await authFetch(`/api/schema/suggest?knowledgeNodeId=${id}`);
                      const data = await res.json();
                      setSchemas(data.suggestions || []);
                    } catch { /* ignore */ }
                    setBuildingSchema(false);
                  }}
                >
                  构建图式
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'mindmap' && (
        <div>
          <MindMap
            nodes={[node, ...(node.outgoingEdges?.map((e) => e.to) || []), ...(node.incomingEdges?.map((e) => e.from) || [])]}
            edges={[...(node.outgoingEdges || []), ...(node.incomingEdges || [])]}
            onNodeClick={(nid) => router.push(`/cards/${nid}`)}
          />
        </div>
      )}

      {activeTab === 'practice' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-[15px]">练习题</h3>
            <Button size="sm" onClick={handleGenerateQuestions} loading={generatingQuestions}>
              AI生成题目
            </Button>
          </div>

          {questions.length === 0 ? (
            <Card>
              <div className="text-center py-14">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
                  📝
                </div>
                <p className="text-slate-500 font-medium">暂无练习题</p>
                <p className="text-sm text-slate-400 mt-1.5">点击上方按钮让AI出题</p>
              </div>
            </Card>
          ) : (
            questions.map((q, i) => {
              const key = `${q.id || i}`;
              const selectedAnswer = practiceAnswers[key] || '';
              const isChecked = practiceChecked[key] || false;
              const isCorrect = isChecked && selectedAnswer === q.answer;

              return (
              <Card key={q.id || i}>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-800 font-medium mb-4">
                      <LatexText text={q.stem || ''} />
                    </div>

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
                              name={`card-q-${key}`}
                              value={opt.label}
                              checked={isSelected}
                              onChange={() => {
                                if (!isChecked) {
                                  setPracticeAnswers(prev => ({ ...prev, [key]: opt.label }));
                                }
                              }}
                              disabled={isChecked}
                              className="text-indigo-600 w-4 h-4"
                            />
                            <span className="text-xs font-semibold text-slate-400 w-5">{opt.label}.</span>
                            <span className="text-sm text-slate-700">
                              <LatexText text={opt.text || ''} />
                            </span>
                          </label>
                        );
                        })}
                      </div>
                    )}

                    {!isChecked && q.options && q.options.length > 0 && (
                      <button
                        onClick={() => setPracticeChecked(prev => ({ ...prev, [key]: true }))}
                        disabled={!selectedAnswer}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                          selectedAnswer
                            ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        检查答案
                      </button>
                    )}

                    {isChecked && (
                      <div className={`mt-3 p-4 rounded-xl border ${
                        isCorrect
                          ? 'bg-gradient-to-br from-emerald-50/80 to-green-50/80 border-emerald-100/60'
                          : 'bg-gradient-to-br from-red-50/80 to-rose-50/80 border-red-100/60'
                      }`}>
                        <div className={`text-sm font-semibold ${isCorrect ? 'text-emerald-800' : 'text-red-800'}`}>
                          {isCorrect ? '✓ 回答正确！' : `✗ 回答错误，正确答案是: `}
                          {!isCorrect && <LatexText text={q.answer || ''} />}
                        </div>
                        {q.explanation && (
                          <div className={`text-sm mt-1.5 ${isCorrect ? 'text-emerald-700/80' : 'text-red-700/80'}`}>
                            解析: <LatexText text={q.explanation} />
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setPracticeChecked(prev => ({ ...prev, [key]: false }));
                            setPracticeAnswers(prev => ({ ...prev, [key]: '' }));
                          }}
                          className="mt-2 text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                          重新作答
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
            })
          )}
        </div>
      )}
    </div>
  );
}
