'use client';

// ---------------------------------------------------------------------------
// /lab3d — 3D 实验室合集页：按学科分组的场景卡片
// ---------------------------------------------------------------------------
import { useEffect } from 'react';
import Link from 'next/link';
import { SCENES } from '@/lib/lab3d/registry';

const SUBJECT_ORDER: Array<'数学' | '物理' | '化学'> = ['数学', '物理', '化学'];
const SUBJECT_COLOR: Record<string, string> = {
  数学: 'bg-blue-50 text-blue-700 border-blue-200',
  物理: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  化学: 'bg-violet-50 text-violet-700 border-violet-200',
};

export default function Lab3DPage() {
  useEffect(() => {
    document.title = '3D 实验室 - 知图复习';
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight text-slate-800">🧊 3D 实验室</h1>
        <p className="mt-1.5 text-[15px] text-slate-500">
          数学、物理、化学知识点的 3D 互动演示：拖动旋转、调节参数、跟着语音讲解一步步学
        </p>
      </div>

      {SUBJECT_ORDER.map((subject) => (
        <section key={subject} className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-700">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm ${SUBJECT_COLOR[subject]}`}
            >
              {subject}
            </span>
            <span className="text-sm font-normal text-slate-400">
              {SCENES.filter((s) => s.subject === subject).length} 个演示
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SCENES.filter((s) => s.subject === subject).map((s) => (
              <Link
                key={s.id}
                href={`/lab3d/${s.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                <div className="mb-2 text-3xl">{s.icon}</div>
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
      ))}
    </div>
  );
}
