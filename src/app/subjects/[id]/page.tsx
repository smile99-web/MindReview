'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { DecomposeForm } from '@/components/knowledge/DecomposeForm';
import { TextbookGenerateForm } from '@/components/knowledge/TextbookGenerateForm';
import { SUBJECT_CONFIG } from '@/types';
import type { SubjectName } from '@/types';

export default function SubjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [subject, setSubject] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDecompose, setShowDecompose] = useState(false);
  const [showTextbookGenerate, setShowTextbookGenerate] = useState(false);
  const [activeTab, setActiveTab] = useState<'chapters' | 'nodes'>('chapters');

  useEffect(() => {
    async function load() {
      try {
        const [subjRes, chRes, nodeRes] = await Promise.all([
          fetch(`/api/subjects`),
          fetch(`/api/chapters?subjectId=${id}`),
          fetch(`/api/knowledge?subjectId=${id}&limit=100`),
        ]);

        const subjects = await subjRes.json();
        const currentSubject = subjects.find((s: any) => s.id === id);
        setSubject(currentSubject || null);
        setChapters(await chRes.json());
        setNodes((await nodeRes.json()).nodes || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const config = subject ? SUBJECT_CONFIG[subject.name as SubjectName] : null;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 text-center">
        <p className="text-slate-500">学科不存在</p>
        <Link href="/subjects" className="text-indigo-500 hover:text-indigo-600 font-medium mt-2 inline-block transition-colors">
          返回学科列表
        </Link>
      </div>
    );
  }

  const tabs = [
    { key: 'chapters' as const, label: '章节', icon: '📂', count: chapters.length },
    { key: 'nodes' as const, label: '知识点', icon: '🧩', count: nodes.length },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/50 text-3xl">
            {subject.icon || config?.icon || '📖'}
          </div>
          <div>
            <Link href="/subjects" className="text-xs text-slate-400 hover:text-indigo-500 transition-colors font-medium">
              学科列表
            </Link>
            <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">{subject.name}</h1>
            <p className="text-sm text-slate-500">
              {chapters.length} 章节 · {nodes.length} 知识点
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/mindmap?subjectId=${id}`}>
            <Button variant="secondary">思维导图</Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setShowTextbookGenerate(!showTextbookGenerate);
              setShowDecompose(false);
            }}
          >
            {showTextbookGenerate ? '收起' : '人教版生成'}
          </Button>
          <Button
            onClick={() => {
              setShowDecompose(!showDecompose);
              setShowTextbookGenerate(false);
            }}
          >
            {showDecompose ? '收起' : 'AI拆解'}
          </Button>
        </div>
      </div>

      {showTextbookGenerate && (
        <div className="mb-8">
          <TextbookGenerateForm
            initialSubject={subject.name as SubjectName}
            onGenerated={() => {
              setShowTextbookGenerate(false);
              window.location.reload();
            }}
          />
        </div>
      )}

      {showDecompose && (
        <div className="mb-8">
          <DecomposeForm
            onDecomposed={(result) => {
              setShowDecompose(false);
              window.location.reload();
            }}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/60 backdrop-blur rounded-xl p-1 border border-slate-200/60 inline-flex shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
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
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {activeTab === 'chapters' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chapters.map((ch: any) => (
            <Link key={ch.id} href={`/chapters/${ch.id}`}>
              <Card hover>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📂</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{ch.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {ch._count?.knowledgeNodes || 0} 个知识点
                    </p>
                    {ch.children?.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        含 {ch.children.length} 个子章节
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {chapters.length === 0 && (
            <div className="col-span-full text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200/80">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-slate-400 font-medium">暂无章节，请先拆解教材内容</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {nodes.map((node: any) => (
            <Link key={node.id} href={`/cards/${node.id}`}>
              <Card hover padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-slate-800 truncate">{node.title}</h4>
                      <Badge variant="info" size="sm">{node.chapter?.title}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-1">{node.summary}</p>
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
          {nodes.length === 0 && (
            <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200/80">
              <p className="text-4xl mb-3">🧩</p>
              <p className="text-slate-400 font-medium">暂无知识点</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
