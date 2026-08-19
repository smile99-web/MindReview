'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ShareReport {
  studentName: string;
  grade: string | null;
  week: {
    reviewCount: number;
    avgQuality: number | null;
    studyMinutes: number;
    dailyReviews: Array<{ date: string; count: number }>;
  };
  mistakes: { total: number; resolved: number };
  mastery: { avgLevel: number; nodesStudied: number };
  generatedAt: string;
}

// 家长周报分享页（公开只读，无需登录）
export default function SharePage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<ShareReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/rm/api/share?token=${encodeURIComponent(params.token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `加载失败 (${res.status})`);
        }
        return res.json();
      })
      .then((data) => { if (!cancelled) setReport(data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 px-4 py-10">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white text-lg font-bold shadow-md mb-3">
            知
          </div>
          <h1 className="text-xl font-bold text-slate-800">学习周报</h1>
          <p className="text-xs text-slate-400 mt-1">知图复习 · 家长分享视图（只读）</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white/70 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-8 text-center">
            <div className="text-3xl mb-2">🔗</div>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        ) : report ? (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-slate-200/60 p-5">
              <div className="text-sm text-slate-400">学生</div>
              <div className="text-lg font-bold text-slate-800">
                {report.studentName}
                {report.grade && <span className="text-sm font-normal text-slate-400 ml-2">{report.grade}</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
                <div className="text-[11px] text-slate-400">本周复习</div>
                <div className="text-2xl font-bold text-indigo-600 tabular-nums">{report.week.reviewCount}<span className="text-sm font-normal text-slate-400 ml-1">次</span></div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
                <div className="text-[11px] text-slate-400">本周学习时长</div>
                <div className="text-2xl font-bold text-indigo-600 tabular-nums">{report.week.studyMinutes}<span className="text-sm font-normal text-slate-400 ml-1">分钟</span></div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
                <div className="text-[11px] text-slate-400">平均掌握度</div>
                <div className="text-2xl font-bold text-emerald-600 tabular-nums">{report.mastery.avgLevel}%</div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
                <div className="text-[11px] text-slate-400">错题攻克</div>
                <div className="text-2xl font-bold text-emerald-600 tabular-nums">
                  {report.mistakes.resolved}<span className="text-sm font-normal text-slate-400">/{report.mistakes.total}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/60 p-5">
              <div className="text-xs text-slate-400 mb-3">近 7 天复习次数</div>
              <div className="flex items-end gap-1.5 h-16">
                {report.week.dailyReviews.map((d) => {
                  const max = Math.max(...report.week.dailyReviews.map((x) => x.count), 1);
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-indigo-400/80 rounded-sm min-h-[2px]"
                        style={{ height: `${Math.max(4, (d.count / max) * 56)}px` }}
                        title={`${d.date}: ${d.count} 次`}
                      />
                      <span className="text-[9px] text-slate-400">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-center text-[10px] text-slate-300 pt-2">
              报告生成于 {new Date(report.generatedAt).toLocaleString('zh-CN')} · 链接 7 天内有效
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
