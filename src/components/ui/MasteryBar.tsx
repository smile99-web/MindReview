import { getMasteryColor, getMasteryLabel } from '@/lib/utils';

interface MasteryBarProps {
  level: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function MasteryBar({ level, showLabel = true, size = 'sm' }: MasteryBarProps) {
  const height = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-slate-200/70 rounded-full ${height} overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getMasteryColor(level)}`}
          style={{ width: `${Math.max(4, level)}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-[11px] text-slate-500 w-12 text-right tabular-nums">
          {level}% <span className="text-slate-400">{getMasteryLabel(level)}</span>
        </span>
      )}
    </div>
  );
}
