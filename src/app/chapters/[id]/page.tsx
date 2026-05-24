'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { Button } from '@/components/ui/Button';

export default function ChapterDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [chapter, setChapter] = useState<any>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [chRes, nodeRes] = await Promise.all([
          fetch(`/api/chapters`),
          fetch(`/api/knowledge?chapterId=${id}&limit=100`),
        ]);

        const chapters = await chRes.json();
        const currentChapter = chapters.find((c: any) => c.id === id);
        setChapter(currentChapter || null);
        setNodes((await nodeRes.json()).nodes || []);
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
        {nodes.map((node: any) => (
          <Link key={node.id} href={`/cards/${node.id}`}>
            <Card hover padding="sm">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="font-medium text-slate-800">{node.title}</h4>
                    <Badge variant="purple" size="sm">{node.icapLevel}</Badge>
                    <span className="text-xs text-slate-400">
                      {'★'.repeat(node.difficulty)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1">{node.summary}</p>
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
                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
