'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { KnowledgeCardView } from '@/components/knowledge/KnowledgeCardView';
import { MindMap } from '@/components/mindmap/MindMap';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function KnowledgeCardPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [node, setNode] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'card' | 'mindmap' | 'practice'>('card');
  const [questions, setQuestions] = useState<any[]>([]);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/knowledge/${id}`);
        if (!res.ok) throw new Error('知识点不存在');
        const data = await res.json();
        setNode(data);
        setQuestions(data.questions || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleGenerateQuestions = async () => {
    setGeneratingQuestions(true);
    try {
      const res = await fetch('/api/ai', {
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
    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          imageType: 'knowledge',
          contentRefId: id,
        }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        setImageUrl(data.imageUrl);
      }
    } catch (err) {
      console.error('Image generation failed:', err);
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
          />
          {imageUrl && (
            <Card className="mt-4">
              <h3 className="font-semibold text-slate-800 mb-4 text-[15px]">AI生成配图</h3>
              <img src={imageUrl} alt={node.title} className="w-full rounded-xl" />
            </Card>
          )}
        </div>
      )}

      {activeTab === 'mindmap' && (
        <div>
          <MindMap
            nodes={[node, ...(node.outgoingEdges?.map((e: any) => e.to) || []), ...(node.incomingEdges?.map((e: any) => e.from) || [])]}
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
            questions.map((q: any, i: number) => (
              <Card key={q.id || i}>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 font-semibold text-sm shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 font-medium mb-4">{q.stem}</p>

                    {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="space-y-2 mb-4">
                        {q.options.map((opt: any, j: number) => (
                          <label
                            key={j}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200/80 hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-colors"
                          >
                            <input type="radio" name={`q-${i}`} className="text-indigo-600 w-4 h-4" />
                            <span className="text-xs font-semibold text-slate-400 w-5">{opt.label}.</span>
                            <span className="text-sm text-slate-700">{opt.text}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    <details className="group">
                      <summary className="text-sm text-indigo-500 cursor-pointer hover:text-indigo-600 font-medium transition-colors">
                        查看答案与解析
                      </summary>
                      <div className="mt-3 p-4 bg-gradient-to-br from-emerald-50/80 to-green-50/80 rounded-xl border border-emerald-100/60">
                        <p className="text-sm font-semibold text-emerald-800">
                          答案: {q.answer}
                        </p>
                        {q.explanation && (
                          <p className="text-sm text-emerald-700/80 mt-1.5">
                            解析: {q.explanation}
                          </p>
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
