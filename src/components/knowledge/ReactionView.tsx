'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { LatexRenderer } from '@/components/ui/LatexRenderer';
import { LatexText } from '@/components/ui/LatexText';
import { BoundaryCallout } from './BoundaryCallout';

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
  /** Boundary/limitation: when this representation breaks down */
  boundary?: string;
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

// ========== Equation parsing helpers ==========

interface ChemTerm {
  coefficient: number;
  formula: string;
}

/** Parse a chemical equation string into reactants and products with coefficients */
function parseChemicalEquation(
  eq: string,
): { reactants: ChemTerm[]; products: ChemTerm[] } | null {
  // Find the arrow symbol (supports LaTeX and Unicode variants)
  const arrowMatch = eq.match(/\\rightarrow|\\longrightarrow|→|->|=>/);
  if (!arrowMatch || arrowMatch.index === undefined) return null;

  const arrowIdx = arrowMatch.index;
  const arrowLen = arrowMatch[0].length;
  const left = eq.slice(0, arrowIdx);
  const right = eq.slice(arrowIdx + arrowLen);

  function parseSide(s: string): ChemTerm[] {
    return s
      .split(/\+/)
      .map((part) => {
        const trimmed = part.trim();
        // Match optional leading coefficient
        const match = trimmed.match(/^(\d*)\s*(.+)/);
        const coef = match && match[1] ? parseInt(match[1], 10) : 1;
        const formula = (match ? match[2] : trimmed).trim();
        return { coefficient: coef, formula };
      })
      .filter((t) => t.formula.length > 0);
  }

  const reactants = parseSide(left);
  const products = parseSide(right);
  if (reactants.length === 0 && products.length === 0) return null;

  return { reactants, products };
}

/** Parse a chemical formula into element counts.
 *  Handles LaTeX subscripts (H_{2}O, C_6H_{12}O_6) and Unicode subscripts (H₂O). */
function parseAtoms(formula: string): Record<string, number> {
  const counts: Record<string, number> = {};

  // Normalize subscripts to plain digits
  let cleaned = formula
    // LaTeX grouped subscript: _{2}, _{10}
    .replace(/_{(\d+)}/g, '$1')
    // LaTeX inline subscript before a digit: _2, _3 (only when followed by a digit)
    .replace(/_(?=\d)/g, '')
    // Unicode subscripts: ₀₁₂₃₄₅₆₇₈₉
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => {
      const map: Record<string, string> = {
        '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
        '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
      };
      return map[c] || c;
    });

  // Match elements: uppercase letter + optional lowercase + optional digit count
  const regex = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(cleaned)) !== null) {
    const elem = m[1];
    const count = m[2] ? parseInt(m[2], 10) : 1;
    counts[elem] = (counts[elem] || 0) + count;
  }
  return counts;
}

/** Check whether the equation is balanced given current coefficient overrides */
function checkBalance(
  reactants: ChemTerm[],
  products: ChemTerm[],
  coeffs: Record<string, number>,
): boolean {
  const left: Record<string, number> = {};
  const right: Record<string, number> = {};

  for (let i = 0; i < reactants.length; i++) {
    const t = reactants[i];
    const coef = coeffs[`r-${i}`] ?? t.coefficient;
    if (coef <= 0) continue;
    const atoms = parseAtoms(t.formula);
    for (const [elem, count] of Object.entries(atoms)) {
      left[elem] = (left[elem] || 0) + count * coef;
    }
  }

  for (let i = 0; i < products.length; i++) {
    const t = products[i];
    const coef = coeffs[`p-${i}`] ?? t.coefficient;
    if (coef <= 0) continue;
    const atoms = parseAtoms(t.formula);
    for (const [elem, count] of Object.entries(atoms)) {
      right[elem] = (right[elem] || 0) + count * coef;
    }
  }

  const allElements = new Set([...Object.keys(left), ...Object.keys(right)]);
  if (allElements.size === 0) return false;
  for (const elem of allElements) {
    if ((left[elem] || 0) !== (right[elem] || 0)) return false;
  }
  return true;
}

// ========== Component ==========

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
    boundary,
  } = _data;
  const typeInfo = typeLabels[type] || typeLabels.other;

  // Normalize mechanism: string is split by newlines, array is used as-is
  const mechanismSteps: string[] = mechanism
    ? Array.isArray(mechanism)
      ? mechanism
      : mechanism.split('\n').filter(Boolean)
    : [];

  const hasData = !!(
    equation ||
    (reactants && reactants.length > 0) ||
    (products && products.length > 0) ||
    mechanismSteps.length > 0
  );

  // ---- Interactive state: coefficient adjustment ----
  const [coeffs, setCoeffs] = useState<Record<string, number>>({});

  // Parse the equation for interactive adjustment
  const parsedEq = useMemo(() => {
    return equation ? parseChemicalEquation(equation) : null;
  }, [equation]);

  // Reset coefficients when the equation changes
  useEffect(() => {
    setCoeffs({});
  }, [equation]);

  // Real-time balance check
  const isBalanced = useMemo(() => {
    if (!parsedEq) return null;
    return checkBalance(parsedEq.reactants, parsedEq.products, coeffs);
  }, [parsedEq, coeffs]);

  const adjustCoeff = useCallback(
    (type: 'r' | 'p', idx: number, delta: number) => {
      setCoeffs((prev) => {
        const key = `${type}-${idx}`;
        const base =
          type === 'r' && parsedEq
            ? parsedEq.reactants[idx]?.coefficient ?? 1
            : type === 'p' && parsedEq
              ? parsedEq.products[idx]?.coefficient ?? 1
              : 1;
        const current = prev[key] ?? base;
        const next = Math.max(0, Math.min(20, current + delta));
        if (next === base) {
          // Remove override so it resets to default
          const { [key]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [key]: next };
      });
    },
    [parsedEq],
  );

  const getCoeff = useCallback(
    (type: 'r' | 'p', idx: number): number => {
      const key = `${type}-${idx}`;
      const base =
        type === 'r' && parsedEq
          ? parsedEq.reactants[idx]?.coefficient ?? 1
          : type === 'p' && parsedEq
            ? parsedEq.products[idx]?.coefficient ?? 1
            : 1;
      return coeffs[key] ?? base;
    },
    [coeffs, parsedEq],
  );

  const hasAnyModification = Object.keys(coeffs).length > 0;

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
          <span
            className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}
          >
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

      {/* ---- Interactive coefficient adjustment ---- */}
      {parsedEq && (
        <div className="mb-4 bg-white rounded-lg border border-slate-200/60 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              调整系数
            </h5>
            {hasAnyModification && (
              <button
                onClick={() => setCoeffs({})}
                className="text-[10px] text-blue-600 hover:text-blue-800 underline underline-offset-2"
              >
                重置
              </button>
            )}
          </div>

          {/* Interactive equation with +/- buttons */}
          <div className="flex items-center flex-wrap gap-x-1 gap-y-2 justify-center">
            {parsedEq.reactants.map((t, i) => (
              <span key={`r-${i}`} className="inline-flex items-center gap-0.5 text-sm">
                <button
                  onClick={() => adjustCoeff('r', i, -1)}
                  disabled={getCoeff('r', i) <= 0}
                  className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-default text-slate-600 text-xs font-bold inline-flex items-center justify-center leading-none transition-colors"
                  aria-label={`减少 ${t.formula} 的系数`}
                >
                  −
                </button>
                <span
                  className={`font-bold min-w-[1.5ch] text-center ${
                    getCoeff('r', i) !== t.coefficient
                      ? 'text-blue-600'
                      : 'text-slate-700'
                  }`}
                >
                  {getCoeff('r', i)}
                </span>
                <button
                  onClick={() => adjustCoeff('r', i, 1)}
                  disabled={getCoeff('r', i) >= 20}
                  className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-default text-slate-600 text-xs font-bold inline-flex items-center justify-center leading-none transition-colors"
                  aria-label={`增加 ${t.formula} 的系数`}
                >
                  +
                </button>
                <span className="ml-0.5 font-medium text-slate-800">{t.formula}</span>
                {i < parsedEq.reactants.length - 1 && (
                  <span className="mx-0.5 text-slate-400 font-bold">+</span>
                )}
              </span>
            ))}
            <span className="mx-1.5 text-slate-500 font-bold text-base">→</span>
            {parsedEq.products.map((t, i) => (
              <span key={`p-${i}`} className="inline-flex items-center gap-0.5 text-sm">
                <button
                  onClick={() => adjustCoeff('p', i, -1)}
                  disabled={getCoeff('p', i) <= 0}
                  className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-default text-slate-600 text-xs font-bold inline-flex items-center justify-center leading-none transition-colors"
                  aria-label={`减少 ${t.formula} 的系数`}
                >
                  −
                </button>
                <span
                  className={`font-bold min-w-[1.5ch] text-center ${
                    getCoeff('p', i) !== t.coefficient
                      ? 'text-blue-600'
                      : 'text-slate-700'
                  }`}
                >
                  {getCoeff('p', i)}
                </span>
                <button
                  onClick={() => adjustCoeff('p', i, 1)}
                  disabled={getCoeff('p', i) >= 20}
                  className="w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-default text-slate-600 text-xs font-bold inline-flex items-center justify-center leading-none transition-colors"
                  aria-label={`增加 ${t.formula} 的系数`}
                >
                  +
                </button>
                <span className="ml-0.5 font-medium text-slate-800">{t.formula}</span>
                {i < parsedEq.products.length - 1 && (
                  <span className="mx-0.5 text-slate-400 font-bold">+</span>
                )}
              </span>
            ))}
          </div>

          {/* Balance indicator */}
          <div className="mt-3 pt-2 border-t border-slate-100 text-center">
            {isBalanced ? (
              <span className="text-xs text-green-600 font-medium">
                ✅ 化学方程式已配平
              </span>
            ) : (
              <span className="text-xs text-red-500 font-medium">
                ❌ 未配平 — 请调整系数
              </span>
            )}
          </div>
        </div>
      )}

      {/* Reactants and products grid */}
      <div className="grid grid-cols-2 gap-4">
        {reactants && reactants.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200/60 p-3">
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              反应物
            </h5>
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
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              生成物
            </h5>
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
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            反应机理
          </h5>
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

      {boundary && <BoundaryCallout boundary={boundary} />}

      {error && hasData && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
