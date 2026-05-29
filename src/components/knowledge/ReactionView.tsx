'use client';

import { Button } from '@/components/ui/Button';
import { LatexRenderer } from '@/components/ui/LatexRenderer';
import { LatexText } from '@/components/ui/LatexText';

export interface ReactionViewData {
  /** Chemical equation (e.g. "2H₂ + O₂ → 2H₂O") */
  equation?: string;
  /** Reactants list */
  reactants?: string[];
  /** Products list */
  products?: string[];
  /** Reaction conditions (e.g. "点燃", "加热", "催化剂") */
  conditions?: string;
  /** Catalyst name */
  catalyst?: string;
  /** Reaction type: synthesis/decomposition/displacement/double_displacement/redox/other */
  type?: string;
  /** Engine-generated: reaction mechanism (string or step array) */
  mechanism?: string | string[];
  /** Notes / safety warnings */
  notes?: string;
}

interface ReactionViewProps {
  data?: ReactionViewData | null;
  title: string;
  nodeId?: string;
  loading?: boolean;
  error?: string | null;
  onGenerate?: () => void;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  synthesis: { label: '化合反应', color: 'bg-blue-100 text-blue-700' },
  decomposition: { label: '分解反应', color: 'bg-red-100 text-red-700' },
  displacement: { label: '置换反应', color: 'bg-amber-100 text-amber-700' },
  double_displacement: { label: '复分解反应', color: 'bg-purple-100 text-purple-700' },
  redox: { label: '氧化还原', color: 'bg-orange-100 text-orange-700' },
  other: { label: '其他', color: 'bg-slate-100 text-slate-700' },
};

export function ReactionView({
  data,
  title,
  nodeId,
  loading = false,
  error = null,
  onGenerate,
}: ReactionViewProps) {
  const _data = data || {};
  const {
    reactants,
    products,
    conditions,
    equation,
    type = 'other',
    catalyst,
    mechanism,
    notes,
  } = _data;
  const typeInfo = typeLabels[type] || typeLabels.other;

  // Normalize mechanism: string is split by newlines, array is used as-is
  const mechanismSteps: string[] = mechanism
    ? (Array.isArray(mechanism) ? mechanism : mechanism.split('\n').filter(Boolean))
    : [];

  const hasData = !!(
    equation ||
    (reactants && reactants.length > 0) ||
    (products && products.length > 0) ||
    mechanismSteps.length > 0
  );

  // Loading state
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-6 text-center">
        <svg className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-500" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
        </svg>
        <p className="text-sm text-indigo-600 font-medium">AI 正在生成反应式...</p>
        <p className="text-xs text-slate-400 mt-1">正在分析反应物、生成物与机理</p>
      </div>
    );
  }

  // Error state (no data to show)
  if (error && !hasData) {
    return (
      <div className="rounded-xl border border-dashed border-red-200 bg-red-50/30 p-6 text-center">
        <p className="text-sm text-red-600 mb-2">反应式生成失败</p>
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
        <p className="text-sm text-slate-500 mb-3">暂无反应式数据</p>
        <p className="text-xs text-slate-400 mb-4">
          AI 将识别化学方程式、反应条件和反应机理
        </p>
        {onGenerate ? (
          <Button size="sm" onClick={onGenerate} disabled={!nodeId}>
            生成反应式
          </Button>
        ) : (
          <p className="text-xs text-slate-400">请先生成反应式</p>
        )}
      </div>
    );
  }

  // Data state: render the reaction view
  return (
    <div className="rounded-xl border border-green-200/60 bg-gradient-to-br from-green-50/50 to-emerald-50/50 p-5">
      <h4 className="text-sm font-semibold text-green-800 mb-4">{title}</h4>

      {/* Reaction type badge */}
      {type && (
        <div className="mb-4">
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        </div>
      )}

      {/* Chemical equation — prominent display */}
      {equation && (
        <div className="bg-white rounded-lg border border-green-200/40 p-4 mb-4 text-center">
          <LatexRenderer latex={equation} displayMode showRawOnError />
          {/* Conditions and catalyst */}
          {(conditions || catalyst) && (
            <div className="mt-2 flex items-center justify-center gap-3 flex-wrap">
              {conditions && (
                <span className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full">
                  条件: {conditions}
                </span>
              )}
              {catalyst && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  催化剂: {catalyst}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reactants and products grid */}
      <div className="grid grid-cols-2 gap-4">
        {reactants && reactants.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200/60 p-3">
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">反应物</h5>
            <div className="space-y-1">
              {reactants.map((r, i) => (
                <span
                  key={i}
                  className="inline-block px-2 py-0.5 bg-red-50 text-red-700 text-sm rounded mr-1 mb-1 font-medium"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {products && products.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200/60 p-3">
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">生成物</h5>
            <div className="space-y-1">
              {products.map((p, i) => (
                <span
                  key={i}
                  className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-sm rounded mr-1 mb-1 font-medium"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reaction mechanism (engine-generated): numbered steps */}
      {mechanismSteps.length > 0 && (
        <div className="mt-4">
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">反应机理</h5>
          <div className="bg-white rounded-lg border border-slate-200/60 p-3">
            <ol className="space-y-1.5">
              {mechanismSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600 text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <LatexText text={step} className="text-slate-700" />
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <p className="mt-4 text-xs text-slate-500 bg-amber-50/80 rounded-lg p-2.5 border border-amber-100/60">
          {notes}
        </p>
      )}

      {error && hasData && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
