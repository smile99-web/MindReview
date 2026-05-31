'use client';

import { useState } from 'react';

interface BoundaryCalloutProps {
  boundary: string;
}

export function BoundaryCallout({ boundary }: BoundaryCalloutProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-4 border-t border-slate-200/60 pt-3">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors w-full text-left"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium">适用范围与局限</span>
        <span className="text-[11px] ml-1">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div className="mt-2 text-xs text-slate-500 bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/60 leading-relaxed">
          当{boundary}
        </div>
      )}
    </div>
  );
}
