'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export default function MistakesPage() {
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    subjectId: '',
    questionText: '',
    wrongAnswer: '',
    correctAnswer: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/mistakes').then(r => r.json()),
      fetch('/api/subjects').then(r => r.json()),
    ])
      .then(([mistakesData, subjectsData]) => {
        setMistakes(Array.isArray(mistakesData) ? mistakesData : []);
        setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.questionText || !form.correctAnswer) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/mistakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMistakes(prev => [data.mistake, ...prev]);
        setShowForm(false);
        setForm({ subjectId: '', questionText: '', wrongAnswer: '', correctAnswer: '' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const mistakeTypeLabels: Record<string, string> = {
    conceptual: '概念错误',
    calculation: '计算错误',
    careless: '粗心大意',
    application: '应用问题',
  };

  const mistakeTypeColors: Record<string, string> = {
    conceptual: 'danger',
    calculation: 'warning',
    careless: 'default',
    application: 'info',
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="h-8 w-32 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">错题本</h1>
          <p className="text-slate-500 mt-1.5 text-[15px]">{mistakes.length} 道错题 · AI辅助分析错因</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? '收起' : '录入错题'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="font-semibold text-slate-800">录入新错题</h3>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">学科</label>
              <select
                value={form.subjectId}
                onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
              >
                <option value="">选择学科</option>
                {subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">题目内容 *</label>
              <textarea
                value={form.questionText}
                onChange={e => setForm(f => ({ ...f, questionText: e.target.value }))}
                placeholder="粘贴题目文本..."
                rows={3}
                required
                className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm resize-y bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">你的错误答案</label>
                <input
                  type="text"
                  value={form.wrongAnswer}
                  onChange={e => setForm(f => ({ ...f, wrongAnswer: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">正确答案 *</label>
                <input
                  type="text"
                  value={form.correctAnswer}
                  onChange={e => setForm(f => ({ ...f, correctAnswer: e.target.value }))}
                  required
                  className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" loading={submitting}>
                AI分析并保存
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                取消
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-4">
        {mistakes.map((m: any) => (
          <Card key={m.id}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant={(mistakeTypeColors[m.mistakeType] || 'default') as any}
                >
                  {mistakeTypeLabels[m.mistakeType] || m.mistakeType || '未分类'}
                </Badge>
                {m.resolved && <Badge variant="success">已解决</Badge>}
                {m.knowledgeNode && (
                  <Link href={`/cards/${m.knowledgeNode.id}`}>
                    <Badge variant="info">{m.knowledgeNode.title}</Badge>
                  </Link>
                )}
              </div>
              <span className="text-xs text-slate-400">
                {new Date(m.createdAt).toLocaleDateString('zh-CN')}
              </span>
            </div>

            <div className="bg-slate-50/80 rounded-xl p-4 mb-3">
              <p className="text-sm font-medium text-slate-800 mb-3">{m.questionText}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {m.wrongAnswer && (
                  <div className="flex items-start gap-1.5">
                    <span className="text-red-500 shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                    <span className="text-red-700">{m.wrongAnswer}</span>
                  </div>
                )}
                <div className="flex items-start gap-1.5">
                  <span className="text-emerald-500 shrink-0 mt-0.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span className="text-emerald-700">{m.correctAnswer}</span>
                </div>
              </div>
            </div>

            {m.analysis && (
              <div className="p-4 bg-gradient-to-br from-indigo-50/80 to-blue-50/80 rounded-xl border border-indigo-100/60">
                <p className="text-sm font-medium text-indigo-800 mb-1">AI错因分析</p>
                <p className="text-sm text-indigo-700/80">{m.analysis}</p>
              </div>
            )}
          </Card>
        ))}

        {mistakes.length === 0 && (
          <Card>
            <div className="text-center py-14">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
                📝
              </div>
              <p className="text-slate-500 font-medium">还没有错题记录</p>
              <p className="text-sm text-slate-400 mt-1.5">点击上方按钮录入错题，AI会帮你分析错因</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
