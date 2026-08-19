'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LatexText } from '@/components/ui/LatexText';

interface MistakeItem {
  id: string;
  questionText: string;
  wrongAnswer?: string | null;
  correctAnswer: string;
  analysis?: string | null;
  mistakeType?: string | null;
  resolved: boolean;
  createdAt: string;
  knowledgeNode?: { title?: string | null } | null;
}

const TYPE_LABELS: Record<string, string> = {
  conceptual: '概念不清',
  calculation: '计算错误',
  careless: '粗心大意',
  application: '应用不足',
};

// 错题打印页：打印友好排版（A4 纵向，隐藏操作按钮），
// 浏览器打印对话框可直接"另存为 PDF"。
export default function MistakesPrintPage() {
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [includeResolved, setIncludeResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/mistakes?limit=200');
        if (!res.ok) throw new Error(`加载失败 (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        const list: MistakeItem[] = Array.isArray(data) ? data : data.mistakes || [];
        setMistakes(list.filter((m) => includeResolved || !m.resolved));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [includeResolved]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 print:px-0 print:py-0 print:max-w-none">
      {/* 屏幕操作栏（打印时隐藏） */}
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">错题打印</h1>
          <p className="text-sm text-slate-500 mt-1">
            共 {mistakes.length} 道 · 在打印对话框里选择"另存为 PDF"即可导出
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeResolved}
              onChange={(e) => setIncludeResolved(e.target.checked)}
              className="rounded"
            />
            含已掌握
          </label>
          <Button onClick={() => window.print()}>🖨 打印 / 导出 PDF</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 print:hidden">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700 print:hidden">
          {error}
        </div>
      ) : mistakes.length === 0 ? (
        <div className="text-center py-16 text-slate-400 print:hidden">
          <div className="text-4xl mb-2">🎉</div>
          没有需要打印的错题
        </div>
      ) : (
        <div className="space-y-4 print:space-y-3">
          {/* 打印页眉（仅打印可见） */}
          <div className="hidden print:block mb-4">
            <h1 className="text-xl font-bold">知图复习 · 错题集</h1>
            <p className="text-xs text-slate-500">
              共 {mistakes.length} 道 · 生成于 {new Date().toLocaleDateString('zh-CN')}
            </p>
          </div>
          {mistakes.map((m, i) => (
            <div
              key={m.id}
              className="bg-white rounded-xl border border-slate-200 p-4 print:rounded-none print:border-0 print:border-b print:border-slate-300 print:p-3 print:break-inside-avoid"
            >
              <div className="flex items-center gap-2 mb-1.5 text-[11px] text-slate-400">
                <span className="font-bold text-slate-500">第 {i + 1} 题</span>
                {m.knowledgeNode?.title && <span>知识点：{m.knowledgeNode.title}</span>}
                {m.mistakeType && <span>类型：{TYPE_LABELS[m.mistakeType] || m.mistakeType}</span>}
                {m.resolved && <span className="text-emerald-600">已掌握</span>}
              </div>
              <div className="text-sm text-slate-800 whitespace-pre-wrap mb-2">
                <LatexText text={m.questionText} />
              </div>
              {m.wrongAnswer && (
                <div className="text-xs text-rose-600 mb-1">
                  <span className="font-medium">我的错答：</span>
                  {m.wrongAnswer}
                </div>
              )}
              <div className="text-xs text-emerald-700 mb-1">
                <span className="font-medium">正确答案：</span>
                <LatexText text={m.correctAnswer} />
              </div>
              {m.analysis && (
                <div className="text-xs text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100">
                  <span className="font-medium">解析：</span>
                  <LatexText text={m.analysis} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
