'use client';

import { Button } from '@/components/ui/Button';
import { LatexRenderer } from '@/components/ui/LatexRenderer';
import { LatexText } from '@/components/ui/LatexText';
import { BoundaryCallout } from './BoundaryCallout';

interface FormulaVariable {
  symbol: string;
  name: string;
  unit?: string;
}

export interface FormulaViewData {
  /** Engine-generated: LaTeX representation of the formula */
  latex?: string;
  /** Legacy/alternative: plain-text formula */
  formula?: string;
  /** Variables table — engine format and legacy format */
  variables?: FormulaVariable[];
  /** Derivation steps — engine uses "steps", task uses "derivation" */
  steps?: string[];
  derivation?: string[];
  /** Usage notes */
  notes?: string;
  /** Boundary/limitation: when this representation breaks down */
  boundary?: string;
}

interface FormulaViewProps {
  data?: FormulaViewData | null;
  title: string;
  /** Node ID for on-demand generation */
  nodeId?: string;
  /** Whether generation is in progress */
  loading?: boolean;
  /** Error message if generation failed */
  error?: string | null;
  /** Callback to trigger generation */
  onGenerate?: () => void;
}

export function FormulaView({
  data,
  title,
  nodeId,
  loading = false,
  error = null,
  onGenerate,
}: FormulaViewProps) {
  // Normalize: accept both engine format (latex) and legacy format (formula)
  const _data = data || {};
  const formula = _data.latex || _data.formula;
  const steps = _data.steps || _data.derivation;
  const variables = _data.variables;
  const notes = _data.notes;
  const boundary = _data.boundary;

  const hasData = !!(
    formula ||
    (steps && steps.length > 0) ||
    (variables && variables.length > 0)
  );

  // Loading state
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-6 text-center">
        <svg
          className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-500"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
        </svg>
        <p className="text-sm text-indigo-600 font-medium">AI 正在生成公式表征...</p>
        <p className="text-xs text-slate-400 mt-1">正在分析知识点并创建公式内容</p>
      </div>
    );
  }

  // Error state (no data to show)
  if (error && !hasData) {
    return (
      <div className="rounded-xl border border-dashed border-red-200 bg-red-50/30 p-6 text-center">
        <p className="text-sm text-red-600 mb-2">公式生成失败</p>
        <p className="text-xs text-red-400 mb-4">{error}</p>
        {onGenerate && (
          <Button size="sm" variant="secondary" onClick={onGenerate}>
            重试
          </Button>
        )}
      </div>
    );
  }

  // Empty state: no data, show generate button
  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-sm text-slate-500 mb-3">暂无公式表征数据</p>
        <p className="text-xs text-slate-400 mb-4">
          AI 将为知识点识别公式并提取变量关系
        </p>
        {onGenerate ? (
          <Button size="sm" onClick={onGenerate} disabled={!nodeId}>
            生成公式表征
          </Button>
        ) : (
          <p className="text-xs text-slate-400">请先生成公式表征</p>
        )}
      </div>
    );
  }

  // Data state: render the formula view
  return (
    <div className="rounded-xl border border-blue-200/60 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 p-5">
      <h4 className="text-sm font-semibold text-blue-800 mb-4">{title}</h4>

      {formula && (
        <div className="bg-white rounded-lg border border-blue-200/40 p-4 mb-4 text-center">
          <LatexRenderer
            latex={formula}
            displayMode
            showRawOnError
          />
        </div>
      )}

      {variables && variables.length > 0 && (
        <div className="mb-4">
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            变量说明
          </h5>
          <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/60">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">符号</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">名称</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">单位</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((v, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-2 font-mono text-blue-700 font-medium">{v.symbol}</td>
                    <td className="px-3 py-2 text-slate-700">{v.name}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{v.unit || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {steps && steps.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            推导步骤
          </h5>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <LatexText text={step} className="text-slate-700" />
              </li>
            ))}
          </ol>
        </div>
      )}

      {notes && (
        <p className="mt-4 text-xs text-slate-500 bg-amber-50/80 rounded-lg p-2.5 border border-amber-100/60">
          {notes}
        </p>
      )}

      {boundary && <BoundaryCallout boundary={boundary} />}

      {/* Error banner when there IS data but also an error */}
      {error && hasData && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
