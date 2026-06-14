'use client';

import { authFetch } from '@/lib/auth';
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
    edges?: number;
  };
  editionNote?: string;
  failedChapters?: string[];
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
      const res = await authFetch('/api/textbook/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, grade, volume }),
      });
      // 偶发 LLM 或 Nginx 超时返回 HTML，res.json() 会抛出 "Unexpected token '<'"。
      // 此时正文已经是 HTML，包一层 try 给用户更友好的提示。
      let data: Partial<TextbookGenerateResult & { error: string }> = {};
      try {
        data = await res.json() as TextbookGenerateResult & { error?: string };
      } catch {
        throw new Error(
          `服务端返回了非 JSON 响应 (HTTP ${res.status})。可能原因：API 调用超时或 DeepSeek 服务暂时不可用。` +
            (res.status >= 500 ? ' 请稍后重试，或检查 DEEPSEEK_API_KEY 是否有效。' : ''),
        );
      }
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
            已生成 {result.counts?.chapters || 0} 个章节、{result.counts?.knowledgeNodes || 0} 个知识点、{result.counts?.cards || 0} 张教程卡片、{result.counts?.edges || 0} 条导图关系
            {result.editionNote ? `。${result.editionNote}` : ''}
            {result.failedChapters && result.failedChapters.length > 0 ? (
              <p className="mt-1.5 text-amber-700">
                部分章节生成较慢，已先导入章节概览：{result.failedChapters.join('、')}。可以再次点击生成补齐知识点。
              </p>
            ) : null}
          </div>
        )}

        {loading && (
          <p className="text-xs text-slate-500">
            正在按章节分批生成，耗时会比连接测试更长，请不要重复点击或刷新页面。
          </p>
        )}

        <Button type="submit" loading={loading}>
          {loading ? '正在分章生成...' : '生成人教版内容'}
        </Button>
      </form>
    </Card>
  );
}
