'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import LearningPathView from '@/components/mindmap/LearningPathView';
import { RELATION_LABELS, RELATION_COLORS } from '@/types';
import type { RelationType } from '@/types';

// three.js 约 600KB，必须懒加载（Next 16：ssr:false 只能用于 Client Component）
const MindMap3D = dynamic(
  () => import('@/components/mindmap3d/MindMap3D').then((m) => m.MindMap3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[640px] rounded-2xl bg-[#0b1023] flex items-center justify-center text-slate-500 text-sm">
        🌌 正在加载 3D 引擎…
      </div>
    ),
  },
);

interface MindMapSubject {
  id: string;
  name: string;
  icon?: string | null;
  _count?: {
    knowledgeNodes?: number;
    chapters?: number;
  };
}

interface MindMapNode {
  id: string;
  title?: string;
  summary?: string | null;
  difficulty?: number | null;
  masteryLevel?: number | null;
  representationType?: string | null;
  chapterId?: string | null;
  subject?: { name?: string | null } | null;
  chapter?: { id?: string | null; title?: string | null } | null;
}

interface MindMapEdge {
  id: string;
  fromId?: string;
  toId?: string;
  relationType?: string;
  label?: string | null;
}

interface MindMapResponse {
  nodes?: MindMapNode[];
  edges?: MindMapEdge[];
}

function MindMapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const subjectId = searchParams.get('subjectId');
  const chapterId = searchParams.get('chapterId');

  const [data, setData] = useState<{ nodes: MindMapNode[]; edges: MindMapEdge[] }>({ nodes: [], edges: [] });
  // 学习路径=按年级推荐的串讲式学习（默认，解决"不知从哪开始"）；
  // 星空=进度仪表盘（看掌握度、导航）；命题视图=2D 关系列表（读命题）。
  // 学习科学研究：花哨 3D 无学习增益，命题（节点-连接词-节点）才是意义单元。
  const [viewMode, setViewMode] = useState<'path' | 'galaxy' | 'propositions'>('path');
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('思维导图');
  const [showSchemas, setShowSchemas] = useState(false);
  const [subjects, setSubjects] = useState<MindMapSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [relationGenerating, setRelationGenerating] = useState(false);
  const [relationMessage, setRelationMessage] = useState('');
  // "补全导图关系"是管理操作（写全站共享图谱）：非管理员隐藏按钮，
  // 而不是点了才收到 403
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (!cancelled && u?.isAdmin) setIsAdmin(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const loadData = useCallback(async (includeSchemas: boolean, isCancelled?: () => boolean) => {
    if (!subjectId && !chapterId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (subjectId) params.set('subjectId', subjectId);
      if (chapterId) params.set('chapterId', chapterId);
      if (includeSchemas) params.set('includeSchemas', 'true');

      const res = await authFetch(`/api/mindmap?${params.toString()}`);
      const result = await res.json() as MindMapResponse;
      // subjectId/chapterId/showSchemas 快速切换时，晚到的旧响应不得覆盖新数据
      if (isCancelled?.()) return;
      const nodes = result.nodes || [];
      const edges = result.edges || [];
      setData({ nodes, edges });

      if (nodes.length > 0) {
        setTitle(
          chapterId
            ? `${nodes[0].chapter?.title || '章节'} 思维导图`
            : `${nodes[0].subject?.name || '学科'} 思维导图`,
        );
      } else {
        // 切到空学科/章节时重置标题，避免残留上一个学科名
        setTitle('思维导图');
      }
    } catch (err) {
      if (!isCancelled?.()) console.error(err);
    } finally {
      if (!isCancelled?.()) setLoading(false);
    }
  }, [subjectId, chapterId]);

  useEffect(() => { document.title = '思维导图 - 知图复习'; }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void loadData(showSchemas, () => cancelled);
    });
    return () => {
      cancelled = true;
    };
  }, [loadData, showSchemas]);

  // 无参数时加载学科列表
  useEffect(() => {
    if (!subjectId && !chapterId) {
      let cancelled = false;
      queueMicrotask(() => {
        setSubjectsLoading(true);
        authFetch('/api/subjects')
          .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
          .then(data => { if (!cancelled) setSubjects(Array.isArray(data) ? data : data.subjects || []); })
          .catch(() => {})
          .finally(() => { if (!cancelled) setSubjectsLoading(false); });
      });
      return () => { cancelled = true; };
    }
  }, [subjectId, chapterId]);

  const [crossChapterEnabled, setCrossChapterEnabled] = useState(false);
  const [relationTypeFilter, setRelationTypeFilter] = useState('');

  const handleNodeClick = (nodeId: string) => {
    router.push(`/cards/${nodeId}`);
  };

  const handleGenerateRelations = async () => {
    if (!subjectId && !chapterId) return;
    setRelationGenerating(true);
    setRelationMessage('');
    try {
      const res = await authFetch('/api/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-relations',
          subjectId,
          chapterId,
        }),
      });
      const result = await res.json() as { created?: number; error?: string };
      if (!res.ok) {
        throw new Error(result.error || '导图关系生成失败');
      }
      setRelationMessage(
        result.created && result.created > 0
          ? `已补全 ${result.created} 条导图关系`
          : '当前知识点关系已经是最新',
      );
      await loadData(showSchemas);
    } catch (error) {
      setRelationMessage(error instanceof Error ? error.message : '导图关系生成失败');
    } finally {
      setRelationGenerating(false);
    }
  };

  const legendItems = Object.entries(RELATION_LABELS);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">{title}</h1>
          <p className="text-slate-500 mt-1.5 text-[15px]">
            按年级推荐学习路径 · 知识点关系串联 · 🧊 3D 演示助学 · 学完即练直到掌握
            {viewMode !== 'path' && ` · ${data.nodes.length} 个知识点 · ${data.edges.length} 条关系`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={crossChapterEnabled}
              onChange={(e) => setCrossChapterEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
            />
            <span className="text-sm text-slate-600 font-medium">跨章节</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSchemas}
              onChange={(e) => setShowSchemas(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
            />
            <span className="text-sm text-slate-600 font-medium">显示图式</span>
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/mindmap/find-bugs')}
          >
            🐛 找茬
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/mindmap/cloze')}
          >
            🕳️ 挖空
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/mindmap/rebuild')}
          >
            🧩 默画
          </Button>
          {/* 视图切换：路径（按年级学习）/ 星空（仪表盘）/ 命题（2D 关系列表） */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {([['path', '🧭 路径'], ['galaxy', '🌌 星空'], ['propositions', '📜 命题']] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`text-xs px-3 py-1.5 transition ${
                  viewMode === mode
                    ? 'bg-indigo-500 text-white font-medium'
                    : 'bg-white text-slate-500 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {subjectId && isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateRelations}
              loading={relationGenerating}
              disabled={data.nodes.length === 0}
            >
              补全导图关系
            </Button>
          )}
          {subjectId && (
            <Button variant="secondary" size="sm" onClick={() => router.push(`/subjects/${subjectId}`)}>
              返回学科
            </Button>
          )}
        </div>
      </div>

      {relationMessage && (
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-sm text-indigo-700">
          {relationMessage}
        </div>
      )}

      {/* 图例 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {legendItems.map(([key, label]) => {
          const isSchemaMember = key === 'schema_member';
          const color = RELATION_COLORS[key as RelationType];
          return (
            <Badge
              key={key}
              variant={isSchemaMember ? 'warning' : 'default'}
              size="sm"
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                style={{
                  backgroundColor: color,
                  border: isSchemaMember ? 'none' : undefined,
                }}
              />
              {label}
            </Badge>
          );
        })}
      </div>

      {/* 无参数时：显示学科选择器 */}
      {!subjectId && !chapterId && !loading ? (
        <div>
          {subjectsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : subjects.length > 0 ? (
            <div>
              <p className="text-slate-500 text-sm mb-4">选择一个学科查看思维导图：</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {subjects.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => router.push(`/mindmap?subjectId=${s.id}`)}
                    className="group p-6 bg-white rounded-2xl border border-slate-200/70 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/5 transition-all duration-200 text-left"
                  >
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200/50 text-2xl mb-3">
                      {s.icon || '📖'}
                    </div>
                    <h3 className="font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">
                      {s.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {s._count?.knowledgeNodes || 0} 知识点 · {s._count?.chapters || 0} 章节
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-14">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
                📭
              </div>
              <p className="text-slate-500 font-medium">暂无学科数据</p>
              <p className="text-sm text-slate-400 mt-1.5 mb-5">
                请先去学科页面拆解教材内容
              </p>
              <Button variant="secondary" onClick={() => router.push('/subjects')}>
                前往学科页面
              </Button>
            </div>
          )}
        </div>
      ) : viewMode === 'path' && subjectId ? (
        <LearningPathView subjectId={subjectId} />
      ) : loading ? (
        <div className="h-[600px] bg-slate-100 rounded-2xl animate-pulse flex items-center justify-center">
          <p className="text-slate-400">加载中...</p>
        </div>
      ) : data.nodes.length === 0 ? (
        <div className="h-[600px] bg-white rounded-2xl border border-dashed border-slate-200/80 flex items-center justify-center px-6 text-center">
          <div>
            <p className="text-slate-700 font-semibold">还没有可展示的导图内容</p>
            <p className="text-sm text-slate-500 mt-1.5 mb-5">
              思维导图会根据已生成的章节、知识点和知识关系自动绘制。
            </p>
            {subjectId ? (
              <Button onClick={() => router.push(`/subjects/${subjectId}?generate=textbook`)}>
                去生成学科内容
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => router.push('/subjects')}>
                前往学科页
              </Button>
            )}
          </div>
        </div>
      ) : viewMode === 'propositions' ? (
        <PropositionList nodes={data.nodes} edges={data.edges} />
      ) : (
        <MindMap3D
          nodes={data.nodes}
          edges={data.edges}
          onNodeClick={handleNodeClick}
          crossChapterEnabled={crossChapterEnabled}
          relationTypeFilter={relationTypeFilter}
          onRelationTypeFilterChange={setRelationTypeFilter}
          className="w-full h-[640px] rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]"
        />
      )}
    </div>
  );
}

/**
 * 2D 命题视图：把关系网展开成"命题列表"（《A》—关系→《B》+ 具体描述）。
 * 学习科学依据：命题才是概念图的意义单元（Novak）；空间/视觉特效不承载意义，
 * 花哨 3D 属于 seductive details。这里按章节分组、可搜索，掌握度用颜色表达。
 */
function PropositionList({ nodes, edges }: { nodes: MindMapNode[]; edges: MindMapEdge[] }) {
  const [query, setQuery] = useState('');

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // 掌握度文字色：与星空的亮度四档对应
  const masteryClass = (m?: number | null) => {
    const v = m ?? 0;
    if (v >= 80) return 'text-emerald-600 font-medium';
    if (v >= 60) return 'text-amber-600';
    if (v > 0) return 'text-slate-600';
    return 'text-slate-400';
  };

  type PropItem = { edge: MindMapEdge; from: MindMapNode; to: MindMapNode };

  const groups = useMemo((): Array<[string, PropItem[]]> => {
    const byChapter = new Map<string, PropItem[]>();
    for (const e of edges) {
      if (e.relationType === 'schema_member') continue;
      const from = e.fromId ? nodeById.get(e.fromId) : undefined;
      const to = e.toId ? nodeById.get(e.toId) : undefined;
      if (!from || !to) continue;
      const chapterTitle = from.chapter?.title || '未分章';
      const list = byChapter.get(chapterTitle) ?? [];
      list.push({ edge: e, from, to });
      byChapter.set(chapterTitle, list);
    }
    return [...byChapter.entries()];
  }, [nodes, edges, nodeById]);

  const q = query.trim().toLowerCase();
  const filtered: Array<[string, PropItem[]]> = q
    ? groups
        .map(([chapter, items]): [string, PropItem[]] => [
          chapter,
          items.filter(({ from, to, edge }) =>
            `${from.title}${to.title}${edge.label ?? ''}`.toLowerCase().includes(q),
          ),
        ])
        .filter(([, items]) => items.length > 0)
    : groups;

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 max-h-[720px] overflow-y-auto">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索知识点或关系描述…"
        className="w-full max-w-md mb-4 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
      />
      {filtered.map(([chapter, items]) => (
        <details key={chapter} open={groups.length <= 3 || Boolean(q)} className="mb-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 py-1.5 select-none">
            {chapter} <span className="text-slate-400 font-normal">（{items.length} 条命题）</span>
          </summary>
          <div className="mt-1 space-y-1 pl-2">
            {items.map(({ edge, from, to }) => {
              const color = RELATION_COLORS[(edge.relationType as RelationType) ?? 'prerequisite'] ?? '#64748b';
              const mechanical = edge.label === `${from.title} → ${to.title}`;
              return (
                <div key={edge.id} className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm border-b border-slate-50">
                  <span className={masteryClass(from.masteryLevel)}>{from.title}</span>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded-full text-white shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {RELATION_LABELS[(edge.relationType as RelationType) ?? 'prerequisite'] ?? edge.relationType}
                  </span>
                  <span className={masteryClass(to.masteryLevel)}>{to.title}</span>
                  {edge.label && !mechanical && (
                    <span className="text-xs text-slate-400 w-full pl-1">└ {edge.label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ))}
      {filtered.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">没有匹配的命题</p>
      )}
    </div>
  );
}

export default function MindMapPage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="h-[600px] bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    }>
      <MindMapContent />
    </Suspense>
  );
}
