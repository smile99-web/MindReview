'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SUBJECTS } from '@/types';
import type { SubjectName } from '@/types';

interface DecomposeFormProps {
  onDecomposed?: (result: any) => void;
}

export function DecomposeForm({ onDecomposed }: DecomposeFormProps) {
  const [subject, setSubject] = useState<SubjectName>('数学');
  const [grade, setGrade] = useState('初二');
  const [chapter, setChapter] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('请输入教材内容或知识点文本');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/knowledge/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, grade, chapter, content }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '拆解失败');

      onDecomposed?.(data);
      setContent('');
      setChapter('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-[15px]">AI知识点拆解</h3>
          <p className="text-sm text-slate-500 mt-1">
            输入教材内容、章节标题或考试范围，AI会自动拆解为最小可复习知识点
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">学科</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectName)}
              className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
            >
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">年级</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
            >
              {['初一', '初二', '初三', '高一', '高二', '高三'].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">章节</label>
            <input
              type="text"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              placeholder="如：一元二次方程"
              className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-300"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">教材内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="粘贴教材段落、笔记、或考试大纲内容..."
            rows={6}
            className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm resize-y bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors placeholder:text-slate-300"
          />
        </div>

        {error && (
          <div className="bg-red-50/80 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button type="submit" loading={loading} disabled={!content.trim()}>
          开始拆解
        </Button>
      </form>
    </Card>
  );
}
