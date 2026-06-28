'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';

interface MistakeItem {
  id: string;
  questionText: string;
  wrongAnswer: string | null;
  correctAnswer: string;
  mistakeType: string | null;
  analysis: string | null;
  resolved: boolean;
  state: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  nextReviewAt: string | null;
  isDue: boolean;
  daysUntilDue: number;
  knowledgeNode?: { id: string; title: string } | null;
  createdAt: string;
}

interface SubjectInfo {
  id: string;
  name: string;
  icon: string | null;
  colorClass: string | null;
}

export default function SubjectMistakesPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = use(params);
  const [subject, setSubject] = useState<SubjectInfo | null>(null);
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [filter, setFilter] = useState<'all' | 'due' | 'resolved'>('due');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch(
          `/api/mistakes/by-subject/${subjectId}${showResolved ? '?includeResolved=true' : ''}`,
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `加载失败 (${res.status})`);
        }
        const data = (await res.json()) as { subject: SubjectInfo; mistakes: MistakeItem[] };
        if (!cancelled) {
          setSubject(data.subject);
          setMistakes(data.mistakes);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectId, showResolved]);

  const filtered = mistakes.filter((m) => {
    if (filter === 'due') return m.isDue;
    if (filter === 'resolved') return m.resolved;
    return true;
  });

  const dueCount = mistakes.filter((m) => m.isDue).length;
  const resolvedCount = mistakes.filter((m) => m.resolved).length;

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-rose-600">{error}</p>
        <Link href="/mistakes" className="text-indigo-600 hover:text-indigo-700 text-sm">
          ← 返回错题本
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/mistakes"
          className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          ← 返回错题本
        </Link>
        <div className="flex items-center justify-between mt-1 mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            {subject?.icon || '📖'} {subject?.name || '错题'}
            <span className="text-sm font-normal text-slate-500">
              （{mistakes.length} 道）
            </span>
          </h1>
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="rounded border-slate-300"
            />
            显示已掌握
          </label>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-4">
          {[
            { key: 'due' as const, label: `⏰ 待复习 (${dueCount})` },
            { key: 'all' as const, label: `📋 全部 (${mistakes.length})` },
            { key: 'resolved' as const, label: `✓ 已掌握 (${resolvedCount})` },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                filter === t.key
                  ? 'bg-indigo-100 text-indigo-700 font-medium'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card>
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-3">🎉</div>
              <p className="text-sm">该分类下没有错题</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((m) => (
              <Link
                key={m.id}
                href={`/mistakes/${m.id}/review`}
                className="block"
              >
                <Card className={`hover:shadow-md transition-shadow ${
                  m.resolved
                    ? 'opacity-70'
                    : m.isDue
                      ? 'border-rose-200'
                      : ''
                }`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {m.resolved ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        ✓ 已掌握
                      </span>
                    ) : m.isDue ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">
                        ⏰ 待复习
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        复习于 {m.daysUntilDue} 天后
                      </span>
                    )}
                    {m.mistakeType && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {m.mistakeType === 'conceptual' ? '概念' :
                         m.mistakeType === 'calculation' ? '计算' :
                         m.mistakeType === 'careless' ? '粗心' :
                         m.mistakeType === 'application' ? '应用' : m.mistakeType}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-slate-400">
                      稳定性 {m.stability.toFixed(1)}d · 复习 {m.reps} 次
                    </span>
                  </div>
                  <div className="text-sm text-slate-800 line-clamp-2 whitespace-pre-wrap">
                    {m.questionText}
                  </div>
                  {m.knowledgeNode && (
                    <div className="text-[10px] text-slate-400 mt-1.5">
                      关联：{m.knowledgeNode.title}
                    </div>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
