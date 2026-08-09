'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
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
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('思维导图');
  const [showSchemas, setShowSchemas] = useState(false);
  const [subjects, setSubjects] = useState<MindMapSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [relationGenerating, setRelationGenerating] = useState(false);
  const [relationMessage, setRelationMessage] = useState('');

  const loadData = useCallback(async (includeSchemas: boolean) => {
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
      const nodes = result.nodes || [];
      const edges = result.edges || [];
      setData({ nodes, edges });

      if (nodes.length > 0) {
        setTitle(
          chapterId
            ? `${nodes[0].chapter?.title || '章节'} 思维导图`
            : `${nodes[0].subject?.name || '学科'} 思维导图`,
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [subjectId, chapterId]);

  useEffect(() => { document.title = '思维导图 - 知图复习'; }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData(showSchemas);
    });
  }, [loadData, showSchemas]);

  // 无参数时加载学科列表
  useEffect(() => {
    if (!subjectId && !chapterId) {
      queueMicrotask(() => {
        setSubjectsLoading(true);
        authFetch('/api/subjects')
          .then(res => res.json())
          .then(data => setSubjects(Array.isArray(data) ? data : data.subjects || []))
          .catch(() => {})
          .finally(() => setSubjectsLoading(false));
      });
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
            {data.nodes.length} 个知识点 · {data.edges.length} 条关系 · 点击星球聚焦，沿知识连接探索整个体系
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
          {subjectId && (
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
