'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { readApiJson } from '@/lib/read-api-json';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function NewDocPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<
    Array<{ id: string; fileName: string; subjectName: string | null; createdAt: string }>
  >([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch('/api/doc/list');
        if (!res.ok) return;
        const data = (await res.json()) as {
          docs: Array<{ id: string; fileName: string; subjectName: string | null; createdAt: string }>;
        };
        setHistory(data.docs || []);
      } catch { /* silent */ }
    })();
  }, []);

  const handleFile = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/doc/upload', { method: 'POST', body: fd });
      const data = await readApiJson<{ id?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`);
      router.push(`/doc/${data.id}`);
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
          📄 文件出题
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          上传 .docx 或 .txt 文件，AI 自动提取知识点 + 出选择/填空/问答三种题型
        </p>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold text-slate-800">上传文件</h2>
          </CardHeader>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx"
            className="hidden"
            onChange={(e) => {
              const input = e.target;
              const f = input.files?.[0];
              if (!f) return;
              // 处理完再清空 value：iOS 上 input 持有的临时文件在
              // 清空后可能被 WebKit 回收，导致读取失败；清空是为了同文件可重选
              void handleFile(f).finally(() => {
                input.value = '';
              });
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
            <div className="text-4xl mb-3">📄</div>
            <p className="text-base text-slate-700 font-medium">
              点击或拖拽上传文件
            </p>
            <p className="text-xs text-slate-400 mt-2">
              支持 .docx 和 .txt 格式，最大 10MB
            </p>
          </div>
          {uploading && (
            <div className="mt-3 text-center text-sm text-slate-500">
              上传并解析中...
            </div>
          )}
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-slate-800">
                📚 历史文件
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({history.length} 条)
                </span>
              </h2>
            </CardHeader>
            <div className="space-y-2">
              {history.map((h) => (
                <Link
                  key={h.id}
                  href={`/doc/${h.id}`}
                  className="block p-3 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100"
                >
                  <div className="text-xs text-slate-400 mb-0.5">
                    {h.subjectName || '未识别学科'} ·{' '}
                    {new Date(h.createdAt).toLocaleString('zh-CN')}
                  </div>
                  <div className="text-sm text-slate-700 truncate">
                    📎 {h.fileName}
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
