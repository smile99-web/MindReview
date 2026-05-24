'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MindMap } from '@/components/mindmap/MindMap';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RELATION_LABELS } from '@/types';
import type { RelationType } from '@/types';

function MindMapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const subjectId = searchParams.get('subjectId');
  const chapterId = searchParams.get('chapterId');

  const [data, setData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('思维导图');

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams();
        if (subjectId) params.set('subjectId', subjectId);
        if (chapterId) params.set('chapterId', chapterId);

        const res = await fetch(`/api/mindmap?${params.toString()}`);
        const result = await res.json();
        setData({ nodes: result.nodes || [], edges: result.edges || [] });

        if (result.nodes?.length > 0) {
          setTitle(
            chapterId
              ? `${result.nodes[0].chapter?.title || '章节'} 思维导图`
              : `${result.nodes[0].subject?.name || '学科'} 思维导图`,
          );
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subjectId, chapterId]);

  const handleNodeClick = (nodeId: string) => {
    router.push(`/cards/${nodeId}`);
  };

  const legendItems = Object.entries(RELATION_LABELS).slice(0, 6);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">{title}</h1>
          <p className="text-slate-500 mt-1.5 text-[15px]">
            {data.nodes.length} 个知识点 · {data.edges.length} 条关系 · 点击节点查看详情
          </p>
        </div>
        <div className="flex gap-2">
          {subjectId && (
            <Button variant="secondary" size="sm" onClick={() => router.push(`/subjects/${subjectId}`)}>
              返回学科
            </Button>
          )}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {legendItems.map(([key, label]) => (
          <Badge key={key} variant="default" size="sm">
            {label}
          </Badge>
        ))}
      </div>

      {loading ? (
        <div className="h-[600px] bg-slate-100 rounded-2xl animate-pulse flex items-center justify-center">
          <p className="text-slate-400">加载中...</p>
        </div>
      ) : (
        <MindMap
          nodes={data.nodes}
          edges={data.edges}
          onNodeClick={handleNodeClick}
          className="w-full h-[600px] bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]"
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
