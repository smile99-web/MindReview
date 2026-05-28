'use client';

import { Button } from '@/components/ui/Button';

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  importance?: number; // 1-3 (engine uses number, view expects 1-3)
  significance?: string; // engine-generated alternative to description for historical significance
}

export interface TimelineViewData {
  /** Engine-generated: period name (e.g. "春秋战国时期") */
  period?: string;
  /** Engine-generated: list of events */
  events?: TimelineEvent[];
}

interface TimelineViewProps {
  data?: TimelineViewData | null;
  title: string;
  nodeId?: string;
  loading?: boolean;
  error?: string | null;
  onGenerate?: () => void;
}

const importanceColors: Record<number, string> = {
  1: 'bg-slate-400',
  2: 'bg-amber-400',
  3: 'bg-red-500',
};

export function TimelineView({
  data,
  title,
  nodeId,
  loading = false,
  error = null,
  onGenerate,
}: TimelineViewProps) {
  const _data = data || {};
  const events = _data.events || [];
  const period = _data.period;
  const hasData = events.length > 0;

  // Loading state
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-6 text-center">
        <svg className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-500" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
        </svg>
        <p className="text-sm text-indigo-600 font-medium">AI 正在生成时间线...</p>
        <p className="text-xs text-slate-400 mt-1">正在梳理时间节点与历史事件</p>
      </div>
    );
  }

  // Error state (no data to show)
  if (error && !hasData) {
    return (
      <div className="rounded-xl border border-dashed border-red-200 bg-red-50/30 p-6 text-center">
        <p className="text-sm text-red-600 mb-2">时间线生成失败</p>
        <p className="text-xs text-red-400 mb-4">{error}</p>
        {onGenerate && (
          <Button size="sm" variant="secondary" onClick={onGenerate}>
            重试
          </Button>
        )}
      </div>
    );
  }

  // Empty state
  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-sm text-slate-500 mb-3">暂无时间线数据</p>
        <p className="text-xs text-slate-400 mb-4">
          AI 将提取关键时间节点并生成时间轴
        </p>
        {onGenerate ? (
          <Button size="sm" onClick={onGenerate} disabled={!nodeId}>
            生成时间线
          </Button>
        ) : (
          <p className="text-xs text-slate-400">请先生成时间线</p>
        )}
      </div>
    );
  }

  // Data state: render the vertical timeline
  return (
    <div className="rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50/50 to-orange-50/50 p-5">
      <h4 className="text-sm font-semibold text-amber-800 mb-2">{title}</h4>

      {/* Period header (engine-generated) */}
      {period && (
        <div className="mb-4 inline-block px-3 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
          {period}
        </div>
      )}

      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-amber-200" />

        <div className="space-y-5">
          {events.map((event, i) => (
            <div key={i} className="relative">
              {/* Dot marker */}
              <div
                className={`absolute left-[-22px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${
                  importanceColors[event.importance || 1]
                }`}
              />
              {/* Event card */}
              <div className="bg-white rounded-lg border border-slate-200/60 p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {event.date}
                  </span>
                  {event.importance && event.importance >= 2 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${importanceColors[event.importance]}`}
                    >
                      {event.importance === 3 ? '重要' : '较重要'}
                    </span>
                  )}
                </div>
                <h5 className="text-sm font-medium text-slate-800">{event.title}</h5>
                {/* Description from engine (description field) or significance */}
                {(event.description || event.significance) && (
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {event.description || event.significance}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && hasData && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
