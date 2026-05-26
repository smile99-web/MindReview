'use client';

export function CardSkeleton() {
  return <div className="h-32 bg-slate-100 rounded-2xl animate-pulse" />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
      <div className="h-4 w-96 bg-slate-100 rounded animate-pulse" />
      <div className="space-y-2 mt-6">
        <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
        <div className="h-4 w-5/6 bg-slate-100 rounded animate-pulse" />
        <div className="h-4 w-4/6 bg-slate-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="h-8 w-40 bg-slate-200 rounded-lg animate-pulse mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
