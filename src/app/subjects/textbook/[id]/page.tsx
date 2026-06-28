'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LatexText } from '@/components/ui/LatexText';

interface ChapterItem {
  title: string;
  overview?: string;
}
interface ChapterImport {
  chapterTitle: string;
  status: 'pending' | 'imported' | 'failed';
  chapterId?: string;
  nodeIds?: string[];
}
interface TextbookDetail {
  id: string;
  fileName: string;
  fileType: string;
  content: string;
  subjectId: string | null;
  decomposedChapters: ChapterItem[];
  chapterImports: ChapterImport[];
  createdAt: string;
  subject?: { id: string; name: string; icon: string | null } | null;
}

export default function TextbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [tb, setTb] = useState<TextbookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decomposing, setDecomposing] = useState(false);
  const [importingIdx, setImportingIdx] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTextbook = async () => {
    try {
      const res = await authFetch(`/api/textbook/${id}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `加载失败 (${res.status})`);
      }
      setTb((await res.json()) as TextbookDetail);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTextbook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDecompose = async () => {
    setError('');
    setDecomposing(true);
    try {
      const res = await authFetch('/api/textbook/decompose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textbookId: id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `拆解失败 (${res.status})`);
      await fetchTextbook();
    } catch (err: unknown) {
      setError(getErrorMessage(err, '拆解失败'));
    } finally {
      setDecomposing(false);
    }
  };

  const handleImport = async (chapterIdx: number) => {
    setError('');
    setImportingIdx(chapterIdx);
    try {
      const res = await authFetch('/api/textbook/import-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textbookId: id, chapterIdx }),
      });
      const data = (await res.json()) as {
        chapterId?: string;
        knowledgeNodeCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `导入失败 (${res.status})`);
      await fetchTextbook();
    } catch (err: unknown) {
      setError(getErrorMessage(err, '导入失败'));
    } finally {
      setImportingIdx(null);
    }
  };

  const handleDelete = async () => {
    if (!tb) return;
    if (!window.confirm('确定要删除这个教材记录吗？已导入的章节不会被删除（会保留在 Subject→Chapter→KnowledgeNode 树中）。')) {
      return;
    }
    setDeleting(true);
    try {
      const res = await authFetch(`/api/textbook/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `删除失败 (${res.status})`);
      }
      router.push('/subjects');
    } catch (err: unknown) {
      setError(getErrorMessage(err, '删除失败'));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-[3px] border-indigo-500/30 border-t-indigo-500 rounded-full" />
      </div>
    );
  }

  if (error && !tb) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-rose-600">{error}</p>
        <Link href="/subjects" className="text-indigo-600 hover:text-indigo-700 text-sm">
          ← 返回学科列表
        </Link>
      </div>
    );
  }

  if (!tb) return null;

  const chapters = tb.decomposedChapters || [];
  const imports = tb.chapterImports || [];

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link
              href="/subjects"
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              ← 返回学科列表
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 mt-1 flex items-center gap-2">
              📘 {tb.fileName}
              <span className="text-xs font-normal text-slate-500 px-2 py-0.5 rounded-full bg-slate-100">
                {tb.fileType.toUpperCase()}
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {tb.subject ? `${tb.subject.icon} ${tb.subject.name} · ` : ''}字符数：
              {tb.content.length} · 创建于{' '}
              {new Date(tb.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            loading={deleting}
            disabled={deleting}
            className="text-rose-600 hover:text-rose-700"
          >
            🗑️ 删除
          </Button>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Content preview */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-800">📄 教材原文（前 1500 字预览）</h2>
          </CardHeader>
          <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-3 border border-slate-200 max-h-72 overflow-y-auto">
            <LatexText text={tb.content.slice(0, 1500)} />
            {tb.content.length > 1500 && (
              <span className="text-slate-400"> …(剩余 {tb.content.length - 1500} 字未显示)</span>
            )}
          </div>
        </Card>

        {/* Chapter decomposition */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">
                🧩 章节拆解
                {chapters.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({chapters.length} 章)
                  </span>
                )}
              </h2>
              {chapters.length === 0 && (
                <Button
                  size="sm"
                  onClick={handleDecompose}
                  loading={decomposing}
                  disabled={decomposing}
                >
                  {decomposing ? '拆解中...' : '🔍 拆解章节'}
                </Button>
              )}
              {chapters.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDecompose}
                  loading={decomposing}
                  disabled={decomposing}
                >
                  {decomposing ? '重新拆解...' : '重新拆解'}
                </Button>
              )}
            </div>
          </CardHeader>

          {chapters.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">
              点击"拆解章节"开始（AI 会从教材中提取章节标题，每个章节可单独导入到对应学科的 Chapter→KnowledgeNode 树）。
            </p>
          ) : (
            <div className="space-y-2">
              {chapters.map((ch, i) => {
                const importState = imports[i]?.status;
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      importState === 'imported'
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">
                          {ch.title}
                        </div>
                        {ch.overview && (
                          <div className="text-xs text-slate-600 mt-0.5">
                            <LatexText text={ch.overview} />
                          </div>
                        )}
                        {importState === 'imported' && (
                          <div className="text-[10px] text-emerald-700 mt-1">
                            ✓ 已导入（{imports[i]?.nodeIds?.length || 0} 个知识点）
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={importState === 'imported' ? 'ghost' : 'primary'}
                        onClick={() => void handleImport(i)}
                        loading={importingIdx === i}
                        disabled={importingIdx !== null}
                      >
                        {importingIdx === i
                          ? '导入中...'
                          : importState === 'imported'
                            ? '重新导入'
                            : '导入到学科'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {chapters.length > 0 && tb.subjectId && (
          <div className="text-xs text-slate-500 text-center">
            章节导入后会保存到 {tb.subject?.icon} {tb.subject?.name} 学科的
            Subject → Chapter → KnowledgeNode 层级中，可以在{' '}
            <Link href={`/subjects/${tb.subjectId}`} className="text-indigo-600 hover:text-indigo-700">
              学科详情
            </Link>{' '}
            中查看。
          </div>
        )}
      </div>
    </div>
  );
}
