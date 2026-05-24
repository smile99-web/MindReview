'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/utils';

export default function AILogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/ai?action=list-logs');
        if (!res.ok) {
          setLogs([]);
        }
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statusColors: Record<string, string> = {
    success: 'success',
    failed: 'danger',
    pending: 'warning',
    processing: 'info',
  };

  const filterOptions = [
    { key: 'all', label: '全部', icon: '📋' },
    { key: 'llm', label: 'LLM', icon: '🤖' },
    { key: 'tts', label: 'TTS', icon: '🔊' },
    { key: 'image', label: '图片', icon: '🎨' },
  ];

  if (loading) {
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
            onClick={() => setFilter(f.key)}
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

      {logs.length === 0 ? (
        <Card>
          <div className="text-center py-14">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
              📋
            </div>
            <p className="text-slate-500 font-medium">暂无AI生成记录</p>
            <p className="text-sm text-slate-400 mt-1.5">使用AI功能后，记录会在这里显示</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs
            .filter((log: any) => filter === 'all' || log.generatorType === filter)
            .map((log: any) => (
              <Card key={log.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {log.generatorType === 'llm' ? '🤖' : log.generatorType === 'tts' ? '🔊' : '🎨'}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {log.generatorType.toUpperCase()} · {log.model}
                        </span>
                        <Badge
                          variant={(statusColors[log.status] || 'default') as any}
                          size="sm"
                        >
                          {log.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {log.prompt?.slice(0, 80)}
                        {log.prompt?.length > 80 ? '...' : ''}
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
    </div>
  );
}
