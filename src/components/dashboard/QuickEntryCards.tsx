'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/auth';
import { Card, CardHeader } from '@/components/ui/Card';

interface ExamHistory {
  id: string;
  ocrText: string;
  subjectName: string | null;
  createdAt: string;
}
interface DocHistory {
  id: string;
  fileName: string;
  subjectName: string | null;
  createdAt: string;
}

function formatPreview(text: string, max = 60): string {
  const flat = text.replace(/\n+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function QuickEntryCards() {
  const [exams, setExams] = useState<ExamHistory[]>([]);
  const [docs, setDocs] = useState<DocHistory[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [eRes, dRes] = await Promise.all([
          authFetch('/api/exam/list'),
          authFetch('/api/doc/list'),
        ]);
        const [eData, dData] = await Promise.all([
          eRes.ok ? eRes.json() : Promise.resolve({ exams: [] }),
          dRes.ok ? dRes.json() : Promise.resolve({ docs: [] }),
        ]);
        setExams((eData as { exams?: ExamHistory[] }).exams || []);
        setDocs((dData as { docs?: DocHistory[] }).docs || []);
      } catch { /* silent */ }
    })();
  }, []);

  const recentExams = exams.slice(0, 3);
  const recentDocs = docs.slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {/* 拍照讲题 */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            📷 拍照讲题
          </h3>
        </CardHeader>
        <p className="text-xs text-slate-500 mb-3">
          上传题目照片，AI 识别 → 拆解基础知识点 → ICAP 训练或出类似题
        </p>
        <Link
          href="/exam/new"
          className="block w-full text-center px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
        >
          + 上传题目照片
        </Link>
        {recentExams.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              最近历史
            </div>
            <div className="space-y-1.5">
              {recentExams.map((e) => (
                <Link
                  key={e.id}
                  href={`/exam/${e.id}`}
                  className="block p-2 rounded-md hover:bg-slate-50 transition-colors"
                >
                  <div className="text-[10px] text-slate-400">
                    {e.subjectName || '未识别'} · {formatDate(e.createdAt)}
                  </div>
                  <div className="text-xs text-slate-700 truncate">
                    {formatPreview(e.ocrText, 50)}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 文件出题 */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            📄 文件出题
          </h3>
        </CardHeader>
        <p className="text-xs text-slate-500 mb-3">
          上传 .docx / .txt，AI 拆解 → 出选择/填空/问答题
        </p>
        <Link
          href="/doc/new"
          className="block w-full text-center px-4 py-2.5 rounded-xl bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors"
        >
          + 上传文件
        </Link>
        {recentDocs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
              最近历史
            </div>
            <div className="space-y-1.5">
              {recentDocs.map((d) => (
                <Link
                  key={d.id}
                  href={`/doc/${d.id}`}
                  className="block p-2 rounded-md hover:bg-slate-50 transition-colors"
                >
                  <div className="text-[10px] text-slate-400">
                    {d.subjectName || '未识别'} · {formatDate(d.createdAt)}
                  </div>
                  <div className="text-xs text-slate-700 truncate">
                    📎 {d.fileName}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
