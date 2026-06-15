'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/utils';
import type { BadgeVariant } from '@/components/ui/Badge';

const PAGE_SIZE = 20;

// UI 类别 → DB 真实 generatorType 值（多选 IN 查询用）。
// 真实值随代码演进增减，这里集中维护，避免散落各处。
const FILTER_TYPE_MAP: Record<string, string> = {
  all: 'all',
  llm: [
    'llm',
    'chat',
    'tutor_chat',
    'textbook_chapter',
    'textbook_outline',
    'practice_answer_grading',
    'worked_example',
  ].join(','),
  practice_answer_grading: 'practice_answer_grading',
  tts: 'tts',
  image: 'image',
};

interface AiLog {
  id: string;
  generatorType: string;
  model: string;
  status: string;
  prompt?: string | null;
  createdAt: string | Date;
  durationMs?: number | null;
  tokensUsed?: number | null;
}

export default function AILogsPage() {
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLogs = useCallback(async (currentFilter: string, currentPage: number) => {
    setLoading(true);
    try {
      // UI 单选 → 后端 types 多值（AiGenerationLog.generatorType 实际是细粒度值，
      // 4 个 UI 类别各自映射到若干真实类型）
      const types = FILTER_TYPE_MAP[currentFilter] || currentFilter;
      const params = new URLSearchParams({
        action: 'list-logs',
        types,
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      });
      const res = await authFetch(`/api/ai?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } else {
        setLogs([]);
        setTotal(0);
      }
    } catch {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { document.title = 'AI生成记录 - 知图复习'; }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchLogs(filter, page);
    });
  }, [filter, page, fetchLogs]);

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setPage(1);
  };

  const statusColors: Record<string, BadgeVariant> = {
    success: 'success',
    failed: 'danger',
    pending: 'warning',
    processing: 'info',
  };

  // UI 4 类 → DB 真实 generatorType 值映射。
  // 真实值见 src/lib/llm-client.ts / tutor-persistence.ts / textbook/generate 等写入点。
  const filterOptions = [
    { key: 'all', label: '全部' },
    { key: 'llm', label: 'AI 调用' },
    { key: 'practice_answer_grading', label: '练习判分' },
    { key: 'tts', label: 'TTS' },
    { key: 'image', label: '图片' },
  ];

  const getTypeIcon = (type: string) => {
    if (type === 'tts') return '声';
    if (type === 'image') return '图';
    if (type === 'practice_answer_grading') return '判';
    if (type === 'chat' || type === 'tutor_chat') return '聊';
    if (type.startsWith('textbook')) return '教';
    if (type === 'worked_example') return '例';
    return 'AI';
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      llm: 'AI 通用',
      chat: 'AI 老师对话',
      tutor_chat: '旧版导师对话',
      textbook_chapter: '教材章节生成',
      textbook_outline: '教材大纲生成',
      practice_answer_grading: '练习判分',
      worked_example: '样例教学',
      tts: '语音合成',
      image: '图片生成',
    };
    return labels[type] || type;
  };

  if (loading && logs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="h-8 w-32 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">AI生成记录</h1>
        <p className="text-slate-500 mt-1.5 text-[15px]">查看所有AI生成任务的历史记录</p>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 mb-6">
        {filterOptions.map(f => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              filter === f.key
                ? 'bg-white text-indigo-600 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)] border border-indigo-200/60'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/60 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 日志列表 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon="📋"
          title="暂无AI生成记录"
          description="使用AI功能后，记录会在这里显示"
        />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} padding="sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                    {getTypeIcon(log.generatorType)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {getTypeLabel(log.generatorType)} · {log.model}
                      </span>
                      <Badge
                        variant={statusColors[log.status] || 'default'}
                        size="sm"
                      >
                        {log.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(log.prompt ?? '').slice(0, 80)}
                      {(log.prompt?.length ?? 0) > 80 ? '...' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>{formatDateTime(log.createdAt)}</div>
                  {log.durationMs && <div>{log.durationMs}ms</div>}
                  {log.tokensUsed && <div>{log.tokensUsed} tokens</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <span className="text-sm text-slate-500">
            {page} / {totalPages}
            <span className="text-slate-400 ml-1">({total} 条)</span>
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
