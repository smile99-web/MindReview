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

function isRecord(value: unknown): value is RepresentationData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecordArray(value: unknown): RepresentationData[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => asString(item)).filter((item): item is string => !!item);
}

function hasValue(data: RepresentationData, key: string): boolean {
  return data[key] !== undefined && data[key] !== null;
}

function firstString(data: RepresentationData, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(data[key]);
    if (value) return value;
  }
  return undefined;
}

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

    if (type === 'formula' || type === 'step' || hasValue(data, 'formula') || hasValue(data, 'latex') || hasValue(data, 'steps')) {
      return (
        <FormulaView
          data={data as FormulaViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (type === 'force' || hasValue(data, 'forces') || hasValue(data, 'body')) {
      return (
        <ForceDiagram
          data={data as ForceDiagramData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (type === 'timeline' || hasValue(data, 'events')) {
      return (
        <TimelineView
          data={data as TimelineViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (type === 'reaction' || hasValue(data, 'reactants') || hasValue(data, 'equation')) {
      return (
        <ReactionView
          data={data as ReactionViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (type === 'causal' || (hasValue(data, 'nodes') && (hasValue(data, 'edges') || hasValue(data, 'chains')))) {
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
      const concepts = asRecordArray(data.concepts);
      const relations = asRecordArray(data.relations);
      const dimensions = asStringArray(data.dimensions) || [];
      const items = asRecordArray(data.items);

      // concept_map / mindmap: has concepts + relations → adapt to CausalChainView
      if (concepts.length > 0 && relations.length > 0) {
        const adapted: CausalChainData = {
          nodes: concepts.map((concept) => ({
            event: asString(concept.name) || '',
            description: asString(concept.description),
          })),
          edges: relations.map((relation) => ({
            from: asNumber(relation.from),
            to: asNumber(relation.to),
            label: asString(relation.label),
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
      if (hasValue(data, 'template') || hasValue(data, 'slots')) {
        const adapted: FormulaViewData = {
          formula: asString(data.template),
          steps: asStringArray(data.steps) || asStringArray(data.slots),
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
      if (dimensions.length > 0 && items.length > 0) {
        const adapted: CausalChainData = {
          nodes: items.map((item) => {
            const values = Array.isArray(item.values) ? item.values : [];
            return {
              event: asString(item.name) || '',
              description: dimensions
                .map((dim, i) => `${dim}: ${asString(values[i]) ?? '-'}`)
                .join('; '),
            };
          }),
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
    if (hasValue(data, 'formula') || hasValue(data, 'latex') || hasValue(data, 'steps')) {
      return (
        <FormulaView
          data={data as FormulaViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (hasValue(data, 'events')) {
      return (
        <TimelineView
          data={data as TimelineViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (hasValue(data, 'reactants') || hasValue(data, 'equation')) {
      return (
        <ReactionView
          data={data as ReactionViewData}
          title={node.title}
          {...subViewProps}
          onGenerate={onRegenerate}
        />
      );
    }
    if (hasValue(data, 'nodes') && (hasValue(data, 'edges') || hasValue(data, 'chains'))) {
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
    const d = data;

    if (compareType === 'formula') {
      const adapted: FormulaViewData = {
        formula: firstString(d, ['formula', 'latex', 'equation']),
        steps: asStringArray(d.steps),
        variables: Array.isArray(d.variables)
          ? d.variables as FormulaViewData['variables']
          : Array.isArray(d.symbols)
            ? d.symbols as FormulaViewData['variables']
            : undefined,
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
        formula: firstString(d, ['result', 'conclusion']),
        steps: asStringArray(d.steps) || (asString(d.solution) ? [asString(d.solution) as string] : undefined),
        variables: Array.isArray(d.variables) ? d.variables as FormulaViewData['variables'] : undefined,
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
        body: firstString(d, ['body']) || node.title,
        forces: Array.isArray(d.forces) ? d.forces as ForceDiagramData['forces'] : [],
        coordinateSystem: asString(d.coordinateSystem),
        boundary: asString(d.boundary),
        objects: Array.isArray(d.objects) ? d.objects as ForceDiagramData['objects'] : undefined,
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
        events: Array.isArray(d.events) ? d.events as TimelineViewData['events'] : [],
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
        equation: firstString(d, ['equation', 'formula']),
        reactants: asStringArray(d.reactants) || [],
        products: asStringArray(d.products) || [],
        conditions: asString(d.conditions),
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
      const eventNodes = asRecordArray(d.events).map((event) => ({
        event: firstString(event, ['name', 'title']) || '',
        description: firstString(event, ['description', 'date']) || '',
      }));
      const adapted: CausalChainData = {
        nodes: Array.isArray(d.nodes) ? d.nodes as CausalChainData['nodes'] : eventNodes,
        edges: Array.isArray(d.edges)
          ? d.edges as CausalChainData['edges']
          : Array.isArray(d.chains)
            ? d.chains as CausalChainData['edges']
            : [],
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
      const applications = asStringArray(d.applications);
      const examples = asStringArray(d.examples);
      const adapted: FormulaViewData = {
        formula: firstString(d, ['definition', 'concept']),
        variables: Array.isArray(d.properties)
          ? d.properties as FormulaViewData['variables']
          : Array.isArray(d.attributes)
            ? d.attributes as FormulaViewData['variables']
            : undefined,
        steps: applications || examples
          ? [(applications || examples || []).join(' | ')]
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
      const viewpoints = asRecordArray(d.viewpoints);
      const adapted: CausalChainData = {
        nodes: viewpoints.length > 0
          ? viewpoints.map((viewpoint) => ({
            event: firstString(viewpoint, ['name', 'stance']) || '',
            description: firstString(viewpoint, ['reason', 'content']) || '',
          }))
          : [{ event: node.title, description: asString(d.summary) || node.summary || '' }],
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
          formula: asString(d.summary) || node.summary || '无可用数据',
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
