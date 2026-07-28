'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { normalizeImageForUpload } from '@/lib/image-normalize';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function NewExamPage() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const albumInputRef = useRef<HTMLInputElement | null>(null);
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
    // 分阶段标记：WebKit 兼容问题定位用（错误信息里会带上失败阶段）
    let stage = '重编码';
    try {
      // iPad/iPhone 直拍 HEIC + WebKit multipart 序列化 bug 会导致
      // "The string did not match the expected pattern"（请求根本发不出去）。
      // 先客户端重编码为干净 JPEG；解码失败则把原字节重打包成干净文件名
      // 的新 File（绝不把相机原始 File 直接塞 FormData）。
      const normalized = await normalizeImageForUpload(file);
      stage = '打包';
      const fd = new FormData();
      if (normalized) {
        fd.append('image', normalized.blob, normalized.fileName);
      } else {
        const buf = await file.arrayBuffer();
        const isHeic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
        const safe = new File([buf], isHeic ? 'photo.heic' : 'photo.jpg', {
          type: file.type || 'image/jpeg',
        });
        fd.append('image', safe, safe.name);
      }
      stage = '上传';
      const res = await authFetch('/api/exam/upload', { method: 'POST', body: fd });
      stage = '解析响应';
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`);
      router.push(`/exam/${data.id}`);
    } catch (err: unknown) {
      console.error('[exam/new upload] 失败阶段:', stage, { name: file.name, type: file.type, size: file.size }, err);
      setError(`${getErrorMessage(err, '上传失败')}（失败阶段：${stage}）`);
    } finally {
      setUploading(false);
    }
  };

  // 关键：拿到 File 后不能立刻清空 input.value——iOS 相机文件是临时文件，
  // 清空后 WebKit 会回收它，之后 arrayBuffer/createImageBitmap 读取全部失败。
  // 等 handleFile 完成（文件已被读取/上传）再清，才能兼顾"同文件可重选"。
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    void handleFile(f).finally(() => {
      input.value = '';
    });
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
          {/* 拍照入口：capture 直接唤起相机；相册入口：不带 capture 打开系统选择器（照片图库/文件） */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleInputChange}
          />
          <input
            ref={albumInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleInputChange}
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
          >
            <div className="text-4xl mb-3">📸</div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                disabled={uploading}
                onClick={() => cameraInputRef.current?.click()}
              >
                📷 拍照上传
              </Button>
              <Button
                size="lg"
                variant="secondary"
                disabled={uploading}
                onClick={() => albumInputRef.current?.click()}
              >
                🖼️ 从相册选择
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              也可以把图片拖到这里 · 支持 iPhone/iPad 直接拍照（HEIC 自动转 JPEG）· JPG/PNG/WebP
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
