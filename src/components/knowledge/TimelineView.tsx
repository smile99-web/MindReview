'use client';

interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  importance?: number; // 1-3
}

interface TimelineViewData {
  events?: TimelineEvent[];
}

const importanceColors: Record<number, string> = {
  1: 'bg-slate-400',
  2: 'bg-amber-400',
  3: 'bg-red-500',
};

export function TimelineView({ data = {}, title }: { data: TimelineViewData; title: string }) {
  const events = data.events || [];

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-sm text-slate-400">暂无时间线数据</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50/50 to-orange-50/50 p-5">
      <h4 className="text-sm font-semibold text-amber-800 mb-5">{title}</h4>
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-amber-200" />

        <div className="space-y-5">
          {events.map((event, i) => (
            <div key={i} className="relative">
              {/* Dot */}
              <div
                className={`absolute left-[-22px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${
                  importanceColors[event.importance || 1]
                }`}
              />
              {/* Content */}
              <div className="bg-white rounded-lg border border-slate-200/60 p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {event.date}
                  </span>
                  {event.importance && event.importance >= 2 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${importanceColors[event.importance]}`}>
                      {event.importance === 3 ? '重要' : '较重要'}
                    </span>
                  )}
                </div>
                <h5 className="text-sm font-medium text-slate-800">{event.title}</h5>
                {event.description && (
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{event.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
