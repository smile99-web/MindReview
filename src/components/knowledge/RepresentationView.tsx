'use client';

import { FormulaView, type FormulaViewData } from './FormulaView';
import { TimelineView, type TimelineViewData } from './TimelineView';
import { ForceDiagram, type ForceDiagramData } from './ForceDiagram';
import { ReactionView, type ReactionViewData } from './ReactionView';
import { CausalChainView, type CausalChainData } from './CausalChainView';
import { Button } from '@/components/ui/Button';

type RepresentationData = Record<string, unknown>;

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

  return (
    <div className={className}>
      {renderView()}
      {externalError && hasRepresentation && (
        <p className="text-xs text-red-400 mt-2 text-center">{externalError}</p>
      )}
    </div>
  );
}
