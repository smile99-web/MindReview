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
    representationType?: string;
    isHighlighted?: boolean;
    onClick?: () => void;
  };
  selected?: boolean;
}

export const KnowledgeNodeCard = memo(({ data, selected }: KnowledgeNodeCardProps) => {
  const { label, subject, difficulty, masteryLevel, icapLevel, summary, representationType, isHighlighted, onClick } = data;
  const masteryColor = getMasteryColor(masteryLevel);
  const isSchema = representationType === 'schema';

  return (
    <div
      className={`
        bg-white rounded-2xl border px-4 py-3.5
        cursor-pointer transition-all duration-200
        ${isSchema
          ? 'min-w-[260px] max-w-[320px] border-amber-400 shadow-[0_0_14px_rgba(245,158,11,0.25)] hover:shadow-[0_0_20px_rgba(245,158,11,0.35)]'
          : selected
            ? 'min-w-[200px] max-w-[260px] border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.1)] shadow-lg'
            : `min-w-[200px] max-w-[260px] border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] hover:border-indigo-300 hover:shadow-md ${isHighlighted ? 'border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.2)]' : ''}`
        }
      `}
      onClick={onClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={`w-2.5 h-2.5 !border-2 !border-white ${isSchema ? '!bg-amber-500' : '!bg-indigo-400'}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={`w-2.5 h-2.5 !border-2 !border-white ${isSchema ? '!bg-amber-500' : '!bg-indigo-400'}`}
      />

      {/* Mastery indicator / Schema badge */}
      <div className="flex items-center gap-2 mb-2">
        {isSchema ? (
          <span className="text-base leading-none" role="img" aria-label="schema">🧠</span>
        ) : (
          <div className={`w-2 h-2 rounded-full ${masteryColor} ring-2 ring-offset-1 ${masteryColor.replace('bg-', 'ring-')}/20`} />
        )}
        <span className={`text-[11px] font-medium ${isSchema ? 'text-amber-600' : 'text-slate-500'}`}>
          {isSchema ? '图式' : subject}
        </span>
      </div>

      {/* Title */}
      <div className={`font-semibold mb-1.5 leading-tight tracking-tight ${isSchema ? 'text-base text-amber-800' : 'text-sm text-slate-800'}`}>
        {isSchema && <span className="mr-1">🔗</span>}
        {label}
      </div>

      {/* Summary preview */}
      {summary && (
        <p className="text-[11px] text-slate-500 line-clamp-2 mb-2.5 leading-relaxed">
          {summary}
        </p>
      )}

      {/* Mastery bar (only for non-schema nodes) */}
      {!isSchema && (
        <div className="mb-2">
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${masteryLevel}%`,
                backgroundColor: masteryLevel >= 70 ? '#10b981' : masteryLevel >= 40 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {isSchema ? (
          <span className="text-[11px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
            图式结构
          </span>
        ) : (
          <>
            <span className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
              {getDifficultyLabel(difficulty)}
            </span>
            <span className="text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">
              {ICAP_LABELS[icapLevel as IcapLevel] || icapLevel}
            </span>
          </>
        )}
      </div>
    </div>
  );
});

KnowledgeNodeCard.displayName = 'KnowledgeNodeCard';
