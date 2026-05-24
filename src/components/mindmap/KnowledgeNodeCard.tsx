'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getDifficultyLabel, getMasteryColor } from '@/lib/utils';
import { ICAP_LABELS } from '@/types';
import type { IcapLevel } from '@/types';

interface KnowledgeNodeCardProps {
  data: {
    label: string;
    subject: string;
    difficulty: number;
    masteryLevel: number;
    icapLevel: string;
    summary?: string;
    onClick?: () => void;
  };
  selected?: boolean;
}

export const KnowledgeNodeCard = memo(({ data, selected }: KnowledgeNodeCardProps) => {
  const { label, subject, difficulty, masteryLevel, icapLevel, summary, onClick } = data;
  const masteryColor = getMasteryColor(masteryLevel);

  return (
    <div
      className={`
        bg-white rounded-2xl border px-4 py-3.5 min-w-[200px] max-w-[260px]
        cursor-pointer transition-all duration-200
        ${selected
          ? 'border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.1)] shadow-lg'
          : 'border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] hover:border-indigo-300 hover:shadow-md'
        }
      `}
      onClick={onClick}
    >
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-indigo-400 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-indigo-400 !border-2 !border-white" />

      {/* Mastery indicator */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${masteryColor} ring-2 ring-offset-1 ${masteryColor.replace('bg-', 'ring-')}/20`} />
        <span className="text-[11px] text-slate-500 font-medium">{subject}</span>
      </div>

      {/* Title */}
      <div className="font-semibold text-sm text-slate-800 mb-1.5 leading-tight tracking-tight">
        {label}
      </div>

      {/* Summary preview */}
      {summary && (
        <p className="text-[11px] text-slate-500 line-clamp-2 mb-2.5 leading-relaxed">
          {summary}
        </p>
      )}

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
          {getDifficultyLabel(difficulty)}
        </span>
        <span className="text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">
          {ICAP_LABELS[icapLevel as IcapLevel] || icapLevel}
        </span>
      </div>
    </div>
  );
});

KnowledgeNodeCard.displayName = 'KnowledgeNodeCard';
