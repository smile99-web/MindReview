'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { Card, CardHeader } from '@/components/ui/Card';

interface SubjectSummary {
  id: string;
  name: string;
  icon: string | null;
  colorClass: string | null;
  total: number;
  unresolved: number;
  due: number;
}

interface DueItem {
  id: string;
  state: string;
  stability: number;
  nextReviewAt: string | null;
  subject: { id: string; name: string; icon: string | null } | null;
  knowledgeNode?: { id: string; title: string } | null;
  questionText: string;
}

const SUBJECT_COLOR: Record<string, string> = {
  '数学': 'bg-blue-50 text-blue-700 border-blue-200',
  '物理': 'bg-purple-50 text-purple-700 border-purple-200',
  '化学': 'bg-green-50 text-green-700 border-green-200',
  '历史': 'bg-amber-50 text-amber-700 border-amber-200',
  '道法': 'bg-red-50 text-red-700 border-red-200',
  '语文': 'bg-orange-50 text-orange-700 border-orange-200',
  '地理': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '生物': 'bg-teal-50 text-teal-700 border-teal-200',
};

function subjectClass(name: string, custom?: string | null): string {
  return custom || SUBJECT_COLOR[name] || 'bg-slate-50 text-slate-700 border-slate-200';
}

export default function MistakesLanding() {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [due, setDue] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [sRes, dRes] = await Promise.all([
          authFetch('/api/mistakes/subjects'),
          authFetch('/api/mistakes/due?limit=10'),
        ]);
        const [sData, dData] = await Promise.all([
          sRes.ok ? sRes.json() : Promise.resolve({ subjects: [] }),
          dRes.ok ? dRes.json() : Promise.resolve({ due: [] }),
        ]);
        if (!cancelled) {
          setSubjects((sData as { subjects?: SubjectSummary[] }).subjects || []);
          setDue((dData as { due?: DueItem[] }).due || []);
        }
      } catch { /* silent */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalUnresolved = subjects.reduce((s, x) => s + x.unresolved, 0);
  const totalDue = subjects.reduce((s, x) => s + x.due, 0);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">❌ 错题本</h1>
            <p className="text-sm text-slate-500 mb-6">
              按学科分类错题。重做时按艾宾浩斯曲线 + FSRS 重新调度 — 答对时暂时隐藏，下次到期时自动浮现。
            </p>
          </div>
          <Link
            href="/mistakes/print"
            className="shrink-0 text-xs px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            🖨 打印 / 导出
          </Link>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <SummaryTile
            icon="📚"
            label="未复习错题"
            value={totalUnresolved}
            subtitle="按学科分类"
            loading={loading}
          />
          <SummaryTile
            icon="⏰"
            label="今日待复习"
            value={totalDue}
            subtitle="已到 FSRS 复习点"
            loading={loading}
            highlight={totalDue > 0}
          />
          <SummaryTile
            icon="📊"
            label="学科数"
            value={subjects.length}
            subtitle="已建立错题档案"
            loading={loading}
          />
        </div>

        {/* 今日待复习 quick-access list */}
        {due.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800">⏰ 今日待复习</h2>
                <span className="text-xs text-slate-500">
                  {due.length} 道
                </span>
              </div>
            </CardHeader>
            <div className="space-y-2">
              {due.map((d) => (
                <Link
                  key={d.id}
                  href={`/mistakes/${d.id}/review`}
                  className="block p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${subjectClass(
                        d.subject?.name || '通用',
                        d.subject?.icon ? undefined : undefined,
                      )}`}
                    >
                      {d.subject?.icon} {d.subject?.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {d.state === 'new' ? '新错题' : `稳定性 ${d.stability.toFixed(1)}d`}
                    </span>
                  </div>
                  <div className="text-sm text-slate-700 line-clamp-2">
                    {/* 截断判断与截断对象必须同口径（都按压平换行后的文本） */}
                    {(() => {
                      const flat = d.questionText.replace(/\n/g, ' ');
                      return flat.length > 120 ? `${flat.slice(0, 120)}...` : flat;
                    })()}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* Subject grid */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">加载中…</div>
        ) : subjects.length === 0 ? (
          <Card>
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-sm">还没有错题记录</p>
              <p className="text-xs text-slate-300 mt-1">
                在练习中答错题目后会自动收录
              </p>
            </div>
          </Card>
        ) : (
          <div>
            <h2 className="text-base font-semibold text-slate-800 mb-3">📂 按学科分类</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {subjects.map((s) => (
                <Link key={s.id} href={`/mistakes/subject/${s.id}`}>
                  <Card className="hover:shadow-md transition-shadow h-full">
                    <div className="flex flex-col items-center text-center p-3">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-2 border ${subjectClass(
                          s.name,
                          s.colorClass,
                        )}`}
                      >
                        {s.icon || '📖'}
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        {s.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {s.unresolved} 道未复习
                      </div>
                      {s.due > 0 && (
                        <span className="mt-2 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">
                          {s.due} 道待复习
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  subtitle,
  loading,
  highlight,
}: {
  icon: string;
  label: string;
  value: number;
  subtitle: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-500">{label}</div>
          <div
            className={`text-2xl font-bold ${
              highlight && value > 0 ? 'text-rose-600' : 'text-slate-800'
            }`}
          >
            {loading ? '—' : value}
          </div>
          <div className="text-[10px] text-slate-400">{subtitle}</div>
        </div>
      </div>
    </Card>
  );
}
