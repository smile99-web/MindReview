'use client';

// ---------------------------------------------------------------------------
// /lab3d — 3D 实验室合集页：按学科分组、按年级排序的场景卡片
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SCENES } from '@/lib/lab3d/registry';

const SUBJECT_ORDER: Array<'数学' | '物理' | '化学'> = ['数学', '物理', '化学'];
const SUBJECT_COLOR: Record<string, string> = {
  数学: 'bg-blue-50 text-blue-700 border-blue-200',
  物理: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  化学: 'bg-violet-50 text-violet-700 border-violet-200',
};
const GRADE_ORDER: Record<string, number> = {
  '7上': 1,
  '7下': 2,
  '8上': 3,
  '8下': 4,
  '9上': 5,
  '9下': 6,
  '9全': 7,
  拓展: 8,
};
const GRADE_FILTERS = ['全部', '7上', '7下', '8上', '8下', '9上', '9下', '9全', '拓展'] as const;

export default function Lab3DPage() {
  const [gradeFilter, setGradeFilter] = useState<(typeof GRADE_FILTERS)[number]>('全部');

  useEffect(() => {
    document.title = '3D 实验室 - 知图复习';
  }, []);

  const bySubject = useMemo(() => {
    const filtered = SCENES.filter(
      (s) => gradeFilter === '全部' || (s.grade ?? '拓展') === gradeFilter,
    );
    return SUBJECT_ORDER.map((subject) => ({
      subject,
      scenes: filtered
        .filter((s) => s.subject === subject)
        .sort(
          (a, b) =>
            (GRADE_ORDER[a.grade ?? '拓展'] ?? 9) - (GRADE_ORDER[b.grade ?? '拓展'] ?? 9),
        ),
    }));
  }, [gradeFilter]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-800">🧊 3D 实验室</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">
          初中 7~9 年级数学、物理、化学知识点的 3D 互动演示：拖动旋转、调节参数、跟着语音讲解一步步学
        </p>
      </div>

      {/* 年级筛选 */}
      <div className="mb-8 flex flex-wrap gap-2">
        {GRADE_FILTERS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGradeFilter(g)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              gradeFilter === g
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {g === '全部' ? `全部（${SCENES.length}）` : g}
          </button>
        ))}
      </div>

      {bySubject.map(({ subject, scenes }) =>
        scenes.length === 0 ? null : (
          <section key={subject} className="mb-10">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-700">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm ${SUBJECT_COLOR[subject]}`}
              >
                {subject}
              </span>
              <span className="text-sm font-normal text-slate-400">{scenes.length} 个演示</span>
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scenes.map((s) => (
                <Link
                  key={s.id}
                  href={`/lab3d/${s.id}`}
                  className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="text-3xl">{s.icon}</div>
                    {s.grade && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        {s.grade}
                      </span>
                    )}
                  </div>
                  <h3 className="mb-1.5 font-semibold text-slate-800 group-hover:text-indigo-700">
                    {s.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-500">{s.tagline}</p>
                  <div className="mt-3 text-xs font-medium text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
                    进入演示 →
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
