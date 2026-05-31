'use client';

import { useState, useMemo } from 'react';
import { FormulaView, type FormulaViewData } from './FormulaView';
import { TimelineView, type TimelineViewData } from './TimelineView';
import { ForceDiagram, type ForceDiagramData } from './ForceDiagram';
import { ReactionView, type ReactionViewData } from './ReactionView';
import { CausalChainView, type CausalChainData } from './CausalChainView';
import { Button } from '@/components/ui/Button';

type RepresentationData = Record<string, unknown>;

/** Canonical representation types that can be compared side by side */
type RType = 'formula' | 'force' | 'timeline' | 'reaction' | 'causal' | 'concept' | 'step' | 'viewpoint';

interface RepresentationViewProps {
  node: {
    id?: string;
    title: string;
    summary?: string;
    subject?: { name: string };
    representationType?: string | null;
    representationData?: RepresentationData | null;
  };
  className?: string;
  /** Whether to show generate button when no representation exists */
  autoDetect?: boolean;
  /** Whether generation is in progress (controlled by parent) */
  loading?: boolean;
  /** Error message if generation failed */
  error?: string | null;
  /** Callback when user clicks "generate" or auto-detect button */
  onDetect?: () => void;
  /** Callback when user clicks "regenerate" */
  onRegenerate?: () => void;
}

/** Determine which alternate representation types are meaningful for a given subject + current type */
function getAlternateTypes(subject: string, currentType: string): { value: RType; label: string }[] {
  const alternates: { value: RType; label: string }[] = [];
  if (subject === '数学') {
    if (currentType !== 'formula') alternates.push({ value: 'formula', label: '公式视图' });
    if (currentType !== 'step') alternates.push({ value: 'step', label: '步骤推导' });
  }
  if (subject === '物理') {
    if (currentType !== 'force') alternates.push({ value: 'force', label: '受力分析图' });
    if (currentType !== 'formula') alternates.push({ value: 'formula', label: '公式视图' });
    if (currentType !== 'concept') alternates.push({ value: 'concept', label: '概念视图' });
  }
  if (subject === '化学') {
    if (currentType !== 'reaction') alternates.push({ value: 'reaction', label: '化学反应式' });
    if (currentType !== 'formula') alternates.push({ value: 'formula', label: '公式/方程' });
  }
  if (subject === '历史') {
    if (currentType !== 'timeline') alternates.push({ value: 'timeline', label: '时间线' });
    if (currentType !== 'causal') alternates.push({ value: 'causal', label: '因果链' });
  }
  if (subject === '道法') {
    if (currentType !== 'causal') alternates.push({ value: 'causal', label: '因果链' });
    if (currentType !== 'viewpoint') alternates.push({ value: 'viewpoint', label: '观点分析' });
  }
  // Fallback: always offer formula as a generic alternate
  if (alternates.length === 0 && currentType !== 'formula') {
    alternates.push({ value: 'formula', label: '公式视图' });
  }
  return alternates;
}

export function RepresentationView({
  node,
  className = '',
  autoDetect = false,
  loading = false,
  error: externalError = null,
  onDetect,
  onRegenerate,
}: RepresentationViewProps) {
  const subject = node.subject?.name || '';
  const type = node.representationType || '';
  const data = (node.representationData || {}) as RepresentationData;
  const hasRepresentation = !!(type || Object.keys(data).length > 0);

  // --- Comparison view state ---
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareType, setCompareType] = useState<string>('');
  const alternates = useMemo(() => getAlternateTypes(subject, type), [subject, type]);

  const handleToggleCompare = () => {
    if (!compareOpen) {
      // Default to the first available alternate on open
      setCompareType(alternates[0]?.value || 'formula');
    }
    setCompareOpen(!compareOpen);
  };

  // Shared props passed to all sub-views for standalone generation support
  const subViewProps = {
    nodeId: node.id,
    loading,
    error: externalError,
  };

  // Auto-detect mode: no representation yet, show generate button
  if (autoDetect && !hasRepresentation && !loading) {
    return (
      <div
        className={`rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center ${className}`}
      >
        <p className="text-sm text-slate-500 mb-3">暂无表征可视化内容</p>
        <p className="text-xs text-slate-400 mb-4">
          AI 将根据知识点内容自动选择最佳表征形式并生成
        </p>
        <Button size="sm" onClick={onDetect} disabled={!node.id}>
          生成表征
        </Button>
      </div>
    );
  }

  // Loading state (top-level)
  if (loading) {
    return (
      <div
        className={`rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-6 text-center ${className}`}
      >
        <svg
          className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-500"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
        </svg>
        <p className="text-sm text-indigo-600 font-medium">AI 正在生成表征...</p>
        <p className="text-xs text-slate-400 mt-1">正在分析知识点并创建可视化内容</p>
      </div>
    );
  }

  // Error state (no data, top-level)
  if (externalError && !hasRepresentation) {
    return (
      <div
        className={`rounded-xl border border-dashed border-red-200 bg-red-50/30 p-6 text-center ${className}`}
      >
        <p className="text-sm text-red-600 mb-2">生成失败</p>
        <p className="text-xs text-red-400 mb-4">{externalError}</p>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" onClick={onDetect}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  // Route to the correct sub-view based on subject + type + data shape
  const renderView = () => {
    // --- Subject-specific routing ---

    // Math: formula / step
    if (subject === '数学' && (type === 'formula' || type === 'step')) {
      return (
        <FormulaView
          data={data as FormulaViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    // Physics: force diagram, formula, concept
    if (subject === '物理') {
      if (type === 'force') {
        return (
          <ForceDiagram
            data={data as ForceDiagramData}
            title={node.title}
            {...subViewProps}
            onGenerate={onRegenerate}
          />
        );
      }
      if (type === 'formula' || type === 'concept') {
        return (
          <FormulaView
            data={data as FormulaViewData}
            title={node.title}
            {...subViewProps}
            onGenerate={onRegenerate}
          />
        );
      }
    }

    // Chemistry: reaction, experiment
    if (subject === '化学' && (type === 'reaction' || type === 'experiment')) {
      return (
        <ReactionView
          data={data as ReactionViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    // History: timeline, causal
    if (subject === '历史') {
      if (type === 'timeline') {
        return (
          <TimelineView
            data={data as TimelineViewData}
            title={node.title}
            {...subViewProps}
            onGenerate={onRegenerate}
          />
        );
      }
      if (type === 'causal') {
        return (
          <CausalChainView
            data={data as CausalChainData}
            title={node.title}
            {...subViewProps}
            onGenerate={onRegenerate}
          />
        );
      }
    }

    // DaoFa (道法): causal, viewpoint
    if (subject === '道法' && (type === 'causal' || type === 'viewpoint')) {
      return (
        <CausalChainView
          data={data as CausalChainData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    // --- Type-based routing (generic) ---

    if (type === 'formula' || type === 'step' || (data as any).formula || (data as any).latex || (data as any).steps) {
      return (
        <FormulaView
          data={data as FormulaViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (type === 'force' || (data as any).forces || (data as any).body) {
      return (
        <ForceDiagram
          data={data as ForceDiagramData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (type === 'timeline' || (data as any).events) {
      return (
        <TimelineView
          data={data as TimelineViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (type === 'reaction' || (data as any).reactants || (data as any).equation) {
      return (
        <ReactionView
          data={data as ReactionViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (type === 'causal' || ((data as any).nodes && ((data as any).edges || (data as any).chains))) {
      return (
        <CausalChainView
          data={data as CausalChainData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    // --- concept_map / mindmap / template / comparison → adapt to existing views ---

    if (
      type === 'template' ||
      type === 'comparison' ||
      type === 'concept_map' ||
      type === 'mindmap'
    ) {
      const d = data as any;

      // concept_map / mindmap: has concepts + relations → adapt to CausalChainView
      if (d.concepts && d.relations) {
        const adapted: CausalChainData = {
          nodes: d.concepts.map((c: any) => ({
            event: c.name,
            description: c.description,
          })),
          edges: (d.relations || []).map((r: any) => ({
            from: r.from,
            to: r.to,
            label: r.label,
          })),
        };
        return (
          <CausalChainView
            data={adapted}
            title={node.title}
            {...subViewProps}
            onGenerate={onRegenerate}
          />
        );
      }

      // template: has template / slots → adapt to FormulaView
      if (d.template || d.slots) {
        const adapted: FormulaViewData = {
          formula: d.template,
          steps: d.steps || d.slots,
        };
        return (
          <FormulaView
            data={adapted}
            title={node.title}
            {...subViewProps}
            onGenerate={onRegenerate}
          />
        );
      }

      // comparison: has dimensions + items → adapt to CausalChainView
      if (d.dimensions && d.items) {
        const adapted: CausalChainData = {
          nodes: (d.items || []).map((item: any) => ({
            event: item.name,
            description: (d.dimensions || [])
              .map((dim: string, i: number) => `${dim}: ${item.values?.[i] ?? '-'}`)
              .join('; '),
          })),
          edges: [],
        };
        return (
          <CausalChainView
            data={adapted}
            title={node.title}
            {...subViewProps}
            onGenerate={onRegenerate}
          />
        );
      }
    }

    // --- Final fallback: inspect data shape ---
    if ((data as any).formula || (data as any).latex || (data as any).steps) {
      return (
        <FormulaView
          data={data as FormulaViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if ((data as any).events) {
      return (
        <TimelineView
          data={data as TimelineViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if ((data as any).reactants || (data as any).equation) {
      return (
        <ReactionView
          data={data as ReactionViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if ((data as any).nodes && ((data as any).edges || (data as any).chains)) {
      return (
        <CausalChainView
          data={data as CausalChainData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    // --- Ultimate fallback: unknown type, show regenerate ---
    return (
      <div
        className={`rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center ${className}`}
      >
        <p className="text-sm text-slate-400 mb-3">
          {type
            ? `表征类型「${type}」无法渲染，请重新生成`
            : '请选择表征类型后生成内容'}
        </p>
        {onRegenerate && (
          <Button size="sm" variant="secondary" onClick={onRegenerate}>
            重新生成
          </Button>
        )}
      </div>
    );
  };

  // Render the *alternate* representation type using the same data object.
  // This re-interprets the existing representationData through a different view component.
  const renderAlternateView = () => {
    const d = data as any;

    if (compareType === 'formula') {
      const adapted: FormulaViewData = {
        formula: d.formula || d.latex || d.equation || null,
        steps: d.steps || null,
        variables: d.variables || d.symbols || null,
      };
      return (
        <FormulaView
          data={adapted}
          title={`${node.title}（公式视角）`}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    if (compareType === 'step') {
      const adapted: FormulaViewData = {
        formula: d.result || d.conclusion || null,
        steps: d.steps || (d.solution ? [{ step: 1, content: d.solution }] : null),
        variables: d.variables || null,
      };
      return (
        <FormulaView
          data={adapted}
          title={`${node.title}（步骤视角）`}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    if (compareType === 'force') {
      const adapted: ForceDiagramData = {
        body: d.body || node.title,
        forces: d.forces || [],
        coordinateSystem: d.coordinateSystem,
        boundary: d.boundary,
        objects: d.objects,
      };
      return (
        <ForceDiagram
          data={adapted}
          title={`${node.title}（受力视角）`}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    if (compareType === 'timeline') {
      const adapted: TimelineViewData = {
        events: d.events || (d.nodes ? d.events : []),
      };
      return (
        <TimelineView
          data={adapted}
          title={`${node.title}（时序视角）`}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    if (compareType === 'reaction') {
      const adapted: ReactionViewData = {
        equation: d.equation || d.formula || null,
        reactants: d.reactants || [],
        products: d.products || [],
        conditions: d.conditions || null,
      };
      return (
        <ReactionView
          data={adapted}
          title={`${node.title}（反应视角）`}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    if (compareType === 'causal') {
      const adapted: CausalChainData = {
        nodes: d.nodes || (d.events ? d.events.map((e: any) => ({ event: e.name || e.title, description: e.description || e.date || '' })) : []),
        edges: d.edges || d.chains || [],
      };
      return (
        <CausalChainView
          data={adapted}
          title={`${node.title}（因果视角）`}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    if (compareType === 'concept') {
      const adapted: FormulaViewData = {
        formula: d.definition || d.concept || null,
        variables: d.properties || d.attributes || null,
        steps: d.applications || d.examples
          ? [String((Array.isArray(d.applications) ? d.applications : d.examples || []).join(' | '))]
          : undefined,
      };
      return (
        <FormulaView
          data={adapted}
          title={`${node.title}（概念视角）`}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    if (compareType === 'viewpoint') {
      const adapted: CausalChainData = {
        nodes: d.viewpoints
          ? d.viewpoints.map((v: any) => ({ event: v.name || v.stance, description: v.reason || v.content || '' }))
          : [{ event: node.title, description: d.summary || node.summary || '' }],
        edges: [],
      };
      return (
        <CausalChainView
          data={adapted}
          title={`${node.title}（观点视角）`}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }

    // Fallback: generic text-based summary
    return (
      <FormulaView
        data={{
          formula: d.summary || node.summary || '无可用数据',
          variables: Object.entries(d)
            .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
            .map(([k, v]) => ({ symbol: k, name: String(v) })),
        }}
        title={`${node.title}（${compareType}视角）`}
        {...subViewProps}
        onGenerate={onRegenerate}
      />
    );
  };

  return (
    <div className={className}>
      {/* --- Top bar with compare button --- */}
      {hasRepresentation && alternates.length > 0 && (
        <div className="flex items-center justify-end mb-2 gap-2">
          <span className="text-[11px] text-slate-400">
            {compareOpen ? `主: ${type || '默认'} / 对比: ${alternates.find(a => a.value === compareType)?.label || compareType}` : ''}
          </span>
          <Button
            size="sm"
            variant={compareOpen ? 'primary' : 'secondary'}
            onClick={handleToggleCompare}
          >
            {compareOpen ? '关闭比较' : '比较视图'}
          </Button>
        </div>
      )}

      {/* --- Comparison panel: side-by-side when compareOpen --- */}
      {compareOpen && hasRepresentation ? (
        <div className="space-y-3">
          {/* Alternate type selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">对比视角:</span>
            {alternates.map((alt) => (
              <button
                key={alt.value}
                onClick={() => setCompareType(alt.value)}
                className={`px-2.5 py-1 text-[11px] rounded-full font-medium transition-colors ${
                  compareType === alt.value
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {alt.label}
              </button>
            ))}
          </div>

          {/* Two-panel side-by-side layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: primary representation */}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                {type || '当前表征'}
              </div>
              {renderView()}
            </div>
            {/* Right: alternate representation */}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wide mb-1.5">
                {alternates.find(a => a.value === compareType)?.label || compareType} 视角
                {type === compareType && (
                  <span className="ml-1 text-amber-500">(相同类型)</span>
                )}
              </div>
              {renderAlternateView()}
            </div>
          </div>

          {/* Hint about comparison value */}
          <p className="text-[11px] text-slate-400 text-center">
            不同表征形式展示知识的不同侧面，切换视角有助于建立更全面的理解
          </p>
        </div>
      ) : (
        renderView()
      )}

      {externalError && hasRepresentation && (
        <p className="text-xs text-red-400 mt-2 text-center">{externalError}</p>
      )}
    </div>
  );
}
