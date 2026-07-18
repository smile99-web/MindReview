'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function NewTextbookPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<
    Array<{
      id: string;
      fileName: string;
      fileType: string;
      createdAt: string;
      subject?: { name: string; icon: string | null } | null;
    }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch('/api/textbook/list');
        if (!res.ok) return;
        const data = (await res.json()) as {
          textbooks: typeof history;
        };
        setHistory(data.textbooks || []);
      } catch { /* silent */ }
    })();
  }, []);

  const handleFile = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/textbook/upload', {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`);
      router.push(`/subjects/textbook/${data.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '上传失败'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/subjects"
          className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          ← 返回学科列表
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-1 mb-2">
          📘 上传教材
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          上传 .pdf / .docx / .txt 教材，AI 自动拆解章节并按学科导入知识图谱
        </p>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-800">选择文件</h2>
          </CardHeader>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              // 清空 value：否则再次选择同一个文件不会触发 change
              e.target.value = '';
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
          >
            <div className="text-4xl mb-3">📘</div>
            <p className="text-base text-slate-700 font-medium">
              点击或拖拽上传教材
            </p>
            <p className="text-xs text-slate-400 mt-2">
              支持 .pdf / .docx / .txt 格式，最大 20MB
            </p>
          </div>
          {uploading && (
            <div className="mt-3 text-center text-sm text-slate-500">
              上传并解析中（PDF 解析可能需要几秒）...
            </div>
          )}
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-slate-800">
                📚 历史上传的教材
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({history.length} 份)
                </span>
              </h2>
            </CardHeader>
            <div className="space-y-2">
              {history.map((tb) => (
                <Link
                  key={tb.id}
                  href={`/subjects/textbook/${tb.id}`}
                  className="block p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="text-xs text-slate-400 mb-0.5">
                    {tb.subject ? `${tb.subject.icon} ${tb.subject.name} · ` : '未识别学科 · '}
                    {tb.fileType.toUpperCase()} · {new Date(tb.createdAt).toLocaleString('zh-CN')}
                  </div>
                  <div className="text-sm text-slate-700 truncate">
                    📘 {tb.fileName}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
