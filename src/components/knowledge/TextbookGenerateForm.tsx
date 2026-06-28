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

interface ChapterCandidate {
  title: string;
  overview: string;
}

interface ChapterListResponse {
  candidates: ChapterCandidate[];
  editionNote?: string;
  // 候选的"软"标记 (可选): AI 自评每个单元名是否和最新人教版完全一致
  confidence?: 'high' | 'medium' | 'low';
}

/**
 * 人教版教材生成 — 3 步流程
 *  1. 选学科/年级/册别
 *  2. 列出 AI 给的"人教版"候选单元 + 用户可手动改单元名（按实物教材对照）
 *  3. 按用户最终确认的单元名生成知识点和教程卡片
 *
 * 解决"LLM 训练数据滞后 / 各地教材版本不同"问题：用户可手动覆盖单元名
 * 再传给 LLM 出题，确保生成内容与学生手里的教材一致。
 */
export function TextbookGenerateForm({ initialSubject, onGenerated }: TextbookGenerateFormProps) {
  // Step 1: 学科/年级/册别
  const [subject, setSubject] = useState<SubjectName>(initialSubject || '数学');
  const [grade, setGrade] = useState('初二');
  const [volume, setVolume] = useState('上册');

  // Step 2: 单元候选
  const [step, setStep] = useState<'select' | 'confirm' | 'done'>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<ChapterCandidate[]>([]);
  const [editionNote, setEditionNote] = useState('');
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low' | undefined>();
  // 用户可编辑的单元名 — 一一对应 candidates
  const [editableTitles, setEditableTitles] = useState<string[]>([]);

  // Step 3: 生成结果
  const [result, setResult] = useState<TextbookGenerateResult | null>(null);

  // Step 1 -> 2: 让 AI 列出单元候选
  const handleListChapters = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/textbook/chapter-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, grade, volume }),
      });
      let data: ChapterListResponse & { error?: string } = {} as ChapterListResponse;
      try {
        data = (await res.json()) as ChapterListResponse & { error?: string };
      } catch {
        throw new Error(
          `服务端返回了非 JSON 响应 (HTTP ${res.status})。可能原因：API 调用超时或 LLM 服务暂时不可用。`,
        );
      }
      if (!res.ok) throw new Error(data.error || '拉取单元列表失败');
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('AI 未返回单元列表，请重试');
      }
      setCandidates(data.candidates);
      setEditableTitles(data.candidates.map((c) => c.title));
      setEditionNote(data.editionNote || '');
      setConfidence(data.confidence);
      setStep('confirm');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '拉取单元列表失败');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 -> 3: 用用户最终确认的单元名生成知识点
  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    // 过滤掉用户清空的单元
    const finalChapters = editableTitles
      .map((title, i) => ({ title: title.trim(), overview: candidates[i]?.overview || '' }))
      .filter((c) => c.title.length > 0);
    if (finalChapters.length === 0) {
      setError('至少需要一个单元名称');
      setLoading(false);
      return;
    }
    try {
      const res = await authFetch('/api/textbook/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, grade, volume, chapters: finalChapters }),
      });
      let data: Partial<TextbookGenerateResult & { error: string }> = {};
      try {
        data = (await res.json()) as TextbookGenerateResult & { error?: string };
      } catch {
        throw new Error(
          `服务端返回了非 JSON 响应 (HTTP ${res.status})。可能原因：API 调用超时或 LLM 服务暂时不可用。` +
            (res.status >= 500 ? ' 请稍后重试。' : ''),
        );
      }
      if (!res.ok) throw new Error(data.error || '生成失败');
      setResult(data);
      onGenerated?.(data);
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('select');
    setCandidates([]);
    setEditableTitles([]);
    setEditionNote('');
    setConfidence(undefined);
    setResult(null);
    setError('');
  };

  const confidenceColor = {
    high: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-rose-100 text-rose-700',
  }[confidence || 'medium'];

  return (
    <Card>
      <h3 className="font-semibold text-slate-800 text-[15px]">人教版教材生成</h3>
      <p className="text-sm text-slate-500 mt-1 mb-4">
        第一步选学科/年级/册别 → 第二步 AI 列单元候选 + 你可手动覆盖 → 第三步按最终单元名生成知识点。
      </p>

      {step === 'select' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleListChapters();
          }}
          className="space-y-4"
        >
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

          <Button type="submit" loading={loading}>
            {loading ? '拉取人教版单元列表...' : '下一步：列出单元候选'}
          </Button>
        </form>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-slate-600">
              已为你列出 <span className="font-semibold text-slate-800">{candidates.length}</span> 个单元候选
              （{subject} {grade} {volume}）
              {confidence && (
                <span className={`ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded-full ${confidenceColor}`}>
                  AI 自评 {confidence === 'high' ? '高置信' : confidence === 'medium' ? '中置信' : '低置信'}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              重新选择
            </Button>
          </div>

          {editionNote && (
            <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl px-3 py-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">AI 说明：</span> {editionNote}
            </div>
          )}

          <div className="bg-amber-50/60 border border-amber-200/60 rounded-lg px-3 py-2 text-xs text-amber-800">
            ⚠️ 请对照手里的实体教材修正单元名称后再生成。AI 训练数据可能与最新版本有差异。
          </div>

          <div className="space-y-2">
            {editableTitles.map((title, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-8 text-right shrink-0">
                  {i + 1}.
                </span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    const next = [...editableTitles];
                    next[i] = e.target.value;
                    setEditableTitles(next);
                  }}
                  className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none"
                  placeholder={`单元 ${i + 1} 名称`}
                />
                {candidates[i]?.overview && title === candidates[i].title && (
                  <span className="text-[10px] text-slate-400 truncate max-w-[200px]" title={candidates[i].overview}>
                    {candidates[i].overview}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (editableTitles.length <= 1) return;
                    setEditableTitles(editableTitles.filter((_, j) => j !== i));
                    setCandidates(candidates.filter((_, j) => j !== i));
                  }}
                  disabled={editableTitles.length <= 1}
                  className="text-xs text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-30"
                  title="删除该单元"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditableTitles([...editableTitles, ''])}
              className="text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              + 添加一个单元
            </button>
          </div>

          {error && (
            <div className="bg-red-50/80 border border-red-200/60 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button type="button" onClick={() => void handleGenerate()} loading={loading}>
            {loading ? '正在按单元分批生成...' : '确认并生成知识点'}
          </Button>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-3">
          <div className="bg-emerald-50/80 border border-emerald-200/60 rounded-xl px-4 py-3 text-sm text-emerald-700">
            已生成 {result.counts?.chapters || 0} 个章节、{result.counts?.knowledgeNodes || 0} 个知识点、{result.counts?.cards || 0} 张教程卡片、{result.counts?.edges || 0} 条导图关系
            {result.editionNote ? `。${result.editionNote}` : ''}
            {result.failedChapters && result.failedChapters.length > 0 ? (
              <p className="mt-1.5 text-amber-700">
                部分章节生成较慢，已先导入章节概览：{result.failedChapters.join('、')}。可以再次点击生成补齐知识点。
              </p>
            ) : null}
          </div>
          <Button variant="ghost" onClick={handleReset}>
            再次生成其他年级/册别
          </Button>
        </div>
      )}

      {loading && step === 'confirm' && (
        <p className="text-xs text-slate-500 mt-2">
          正在按你确认的单元分批生成知识点，耗时会比拉取单元候选长，请不要重复点击或刷新页面。
        </p>
      )}
    </Card>
  );
}
