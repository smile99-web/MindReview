'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SUBJECTS } from '@/types';
import type { SubjectName } from '@/types';

interface TextbookGenerateFormProps {
  initialSubject?: SubjectName;
  onGenerated?: (result: TextbookGenerateResult) => void;
}

const GRADES = ['初一', '初二', '初三', '高一', '高二', '高三'];
const VOLUMES = ['上册', '下册', '全册'];

interface TextbookGenerateResult {
  counts?: {
    chapters?: number;
    knowledgeNodes?: number;
    cards?: number;
  };
  editionNote?: string;
}

export function TextbookGenerateForm({ initialSubject, onGenerated }: TextbookGenerateFormProps) {
  const [subject, setSubject] = useState<SubjectName>(initialSubject || '数学');
  const [grade, setGrade] = useState('初二');
  const [volume, setVolume] = useState('上册');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TextbookGenerateResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/textbook/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, grade, volume }),
      });
      const data = await res.json() as TextbookGenerateResult & { error?: string };
      if (!res.ok) throw new Error(data.error || '生成失败');
      setResult(data);
      onGenerated?.(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-[15px]">人教版教材生成</h3>
          <p className="text-sm text-slate-500 mt-1">
            使用已配置的 DeepSeek API 自动生成最新人教版章节、知识点和教程卡片
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">学科</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectName)}
              disabled={Boolean(initialSubject)}
              className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-400"
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
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">册别</label>
            <select
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className="w-full rounded-xl border border-slate-200/80 px-3.5 py-2.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-colors"
            >
              {VOLUMES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50/80 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-emerald-50/80 border border-emerald-200/60 rounded-xl px-4 py-3 text-sm text-emerald-700">
            已生成 {result.counts?.chapters || 0} 个章节、{result.counts?.knowledgeNodes || 0} 个知识点、{result.counts?.cards || 0} 张教程卡片
            {result.editionNote ? `。${result.editionNote}` : ''}
          </div>
        )}

        <Button type="submit" loading={loading}>
          生成人教版内容
        </Button>
      </form>
    </Card>
  );
}
