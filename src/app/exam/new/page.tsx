'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function NewExamPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<
    Array<{ id: string; ocrText: string; subjectName: string | null; createdAt: string }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch('/api/exam/list');
        if (!res.ok) return;
        const data = (await res.json()) as {
          exams: Array<{ id: string; ocrText: string; subjectName: string | null; createdAt: string }>;
        };
        setHistory(data.exams || []);
      } catch { /* silent */ }
    })();
  }, []);

  const handleFile = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await authFetch('/api/exam/upload', { method: 'POST', body: fd });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`);
      router.push(`/exam/${data.id}`);
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
          href="/dashboard"
          className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          ← 返回仪表盘
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-1 mb-2">
          📷 拍照讲题
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          上传一张题目照片，AI 自动识别 → 拆解基础知识点 → ICAP 训练或出类似题
        </p>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-800">上传题目照片</h2>
          </CardHeader>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
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
            <div className="text-4xl mb-3">📸</div>
            <p className="text-base text-slate-700 font-medium">
              点击或拖拽上传题目照片
            </p>
            <p className="text-xs text-slate-400 mt-2">
              支持 JPG/PNG/WebP，最大 5MB · 可在手机端用相机直接拍
            </p>
          </div>
          {uploading && (
            <div className="mt-3 text-center text-sm text-slate-500">
              上传并识别中...
            </div>
          )}
        </Card>

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-slate-800">
                📚 历史拍照讲题
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({history.length} 条)
                </span>
              </h2>
            </CardHeader>
            <div className="space-y-2">
              {history.map((h) => (
                <Link
                  key={h.id}
                  href={`/exam/${h.id}`}
                  className="block p-3 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100"
                >
                  <div className="text-xs text-slate-400 mb-0.5">
                    {h.subjectName || '未识别学科'} ·{' '}
                    {new Date(h.createdAt).toLocaleString('zh-CN')}
                  </div>
                  <div className="text-sm text-slate-700 line-clamp-2">
                    {h.ocrText.replace(/\n/g, ' ').slice(0, 120)}
                    {h.ocrText.length > 120 ? '...' : ''}
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
