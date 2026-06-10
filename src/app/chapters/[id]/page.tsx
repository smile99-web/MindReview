'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { Button } from '@/components/ui/Button';
import { LatexText } from '@/components/ui/LatexText';

interface ChapterDetail {
  id: string;
  subjectId: string;
  title: string;
}

interface KnowledgeNodeListItem {
  id: string;
  title: string;
  summary?: string | null;
  keywords: string[];
  icapLevel: string;
  difficulty: number;
  masteryLevel: number;
}

interface BlockedPrerequisite {
  nodeId: string;
  title: string;
}

interface PrerequisiteCheck {
  canAccess: boolean;
  blockedBy?: BlockedPrerequisite[];
}

export default function ChapterDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [nodes, setNodes] = useState<KnowledgeNodeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockedMap, setBlockedMap] = useState<Map<string, BlockedPrerequisite[]>>(new Map());

  useEffect(() => {
    async function load() {
      try {
        const [chRes, nodeRes] = await Promise.all([
          authFetch(`/api/chapters/${id}`),
          authFetch(`/api/knowledge?chapterId=${id}&limit=100`),
        ]);

        if (chRes.ok) {
          setChapter(await chRes.json());
        }

        const nodeData = ((await nodeRes.json()).nodes || []) as KnowledgeNodeListItem[];
        setNodes(nodeData);

        // Batch prerequisite check for all nodes in this chapter
        if (nodeData.length > 0) {
          const nodeIds = nodeData.map((n) => n.id);
          try {
            const prereqRes = await authFetch('/api/path/prerequisites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nodeIds }),
            });
            const prereqData = await prereqRes.json();
            const map = new Map<string, BlockedPrerequisite[]>();
            if (prereqData.results) {
              for (const [nid, check] of Object.entries(prereqData.results) as [string, PrerequisiteCheck][]) {
                if (!check.canAccess) {
                  map.set(nid, check.blockedBy || []);
                }
              }
            }
            setBlockedMap(map);
          } catch { /* ignore prerequisite check errors */ }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 text-center">
        <p className="text-slate-500">章节不存在</p>
        <Link href="/subjects" className="text-indigo-500 hover:text-indigo-600 font-medium mt-2 inline-block transition-colors">
          返回学科列表
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href={`/subjects/${chapter.subjectId}`} className="text-xs text-slate-400 hover:text-indigo-500 transition-colors font-medium">
            返回学科
          </Link>
          <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mt-1">{chapter.title}</h1>
          <p className="text-slate-500 mt-1.5 text-[15px]">{nodes.length} 个知识点</p>
        </div>
        <Link href={`/mindmap?chapterId=${id}`}>
          <Button variant="secondary">查看思维导图</Button>
        </Link>
      </div>

      <div className="space-y-2">
        {nodes.map((node) => {
          const blockedBy = blockedMap.get(node.id);
          const isLocked = blockedBy && blockedBy.length > 0;
          const lockTooltip = isLocked
            ? `需要先掌握: ${blockedBy.map((b) => b.title).join('、')}`
            : '';

          const cardContent = (
            <Card hover={!isLocked} padding="sm" className={isLocked ? 'opacity-60' : ''}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {isLocked && <span className="text-sm cursor-default" title={lockTooltip}>🔒</span>}
                    <h4 className={`font-medium ${isLocked ? 'text-slate-400' : 'text-slate-800'}`}>{node.title}</h4>
                    <Badge variant="purple" size="sm">{node.icapLevel}</Badge>
                    <span className="text-xs text-slate-400">
                      {'★'.repeat(node.difficulty)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1"><LatexText text={node.summary || ''} /></p>
                  {node.keywords?.length > 0 && (
                    <div className="flex gap-1.5 mt-1.5">
                      {node.keywords.slice(0, 3).map((kw: string, i: number) => (
                        <span key={i} className="text-[11px] text-indigo-500 font-medium">#{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="ml-4 flex items-center gap-3">
                  <div className="w-24">
                    <MasteryBar level={node.masteryLevel} />
                  </div>
                  {!isLocked && (
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                </div>
              </div>
            </Card>
          );

          return isLocked ? (
            <div key={node.id} title={lockTooltip}>{cardContent}</div>
          ) : (
            <Link key={node.id} href={`/cards/${node.id}`}>{cardContent}</Link>
          );
        })}
      </div>
    </div>
  );
}
