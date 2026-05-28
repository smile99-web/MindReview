'use client';

import { Button } from '@/components/ui/Button';

interface CausalNode {
  id?: string;
  event: string;
  label?: string;
  description?: string;
}

interface CausalEdge {
  from: number; // node index
  to: number;   // node index
  label?: string;
  relation?: string;
}

export interface CausalChainData {
  /** Engine-generated: nodes representing causes and effects */
  nodes?: CausalNode[];
  /** Engine-generated: edges connecting nodes (from index -> to index) */
  edges?: CausalEdge[];
  /** Alternative name for edges (task uses "chains") */
  chains?: CausalEdge[];
}

interface CausalChainViewProps {
  data?: CausalChainData | null;
  title: string;
  nodeId?: string;
  loading?: boolean;
  error?: string | null;
  onGenerate?: () => void;
}

export function CausalChainView({
  data,
  title,
  nodeId,
  loading = false,
  error = null,
  onGenerate,
}: CausalChainViewProps) {
  const _data = data || {};
  const nodes = _data.nodes || [];
  const edges = _data.edges || _data.chains || [];
  const hasData = nodes.length > 0;

  // Build adjacency map for display ordering
  const childrenOf: Record<number, number[]> = {};
  for (const edge of edges) {
    if (!childrenOf[edge.from]) childrenOf[edge.from] = [];
    childrenOf[edge.from].push(edge.to);
  }

  // Loading state
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-6 text-center">
        <svg className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-500" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
        </svg>
        <p className="text-sm text-indigo-600 font-medium">AI 正在生成因果链...</p>
        <p className="text-xs text-slate-400 mt-1">正在分析因果关系与逻辑路径</p>
      </div>
    );
  }

  // Error state (no data to show)
  if (error && !hasData) {
    return (
      <div className="rounded-xl border border-dashed border-red-200 bg-red-50/30 p-6 text-center">
        <p className="text-sm text-red-600 mb-2">因果链生成失败</p>
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
        <p className="text-sm text-slate-500 mb-3">暂无因果链数据</p>
        <p className="text-xs text-slate-400 mb-4">
          AI 将分析因果逻辑并构建推理链条
        </p>
        {onGenerate ? (
          <Button size="sm" onClick={onGenerate} disabled={!nodeId}>
            生成因果链
          </Button>
        ) : (
          <p className="text-xs text-slate-400">请先生成因果链</p>
        )}
      </div>
    );
  }

  // Data state: render the causal chain flow chart
  return (
    <div className="rounded-xl border border-red-200/60 bg-gradient-to-br from-red-50/50 to-orange-50/50 p-5">
      <h4 className="text-sm font-semibold text-red-800 mb-5">{title}</h4>

      <div className="space-y-4">
        {nodes.map((node, i) => {
          const hasChildren = childrenOf[i] && childrenOf[i].length > 0;
          const outgoingEdges = edges.filter((e) => e.from === i);

          return (
            <div key={node.id || i}>
              {/* Node card */}
              <div className="bg-white rounded-lg border border-slate-200/60 p-3.5 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <h5 className="text-sm font-medium text-slate-800">
                      {node.label || node.event}
                    </h5>
                    {node.description && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {node.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Connector arrow to children */}
              {hasChildren && (
                <div className="flex flex-col items-center py-1.5">
                  <svg width="2" height="20" className="text-red-300">
                    <line x1="1" y1="0" x2="1" y2="20" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  <div className="flex items-center gap-1.5">
                    <svg width="16" height="16" viewBox="0 0 16 16" className="text-red-400">
                      <path d="M8 12L4 6h8L8 12z" fill="currentColor" />
                    </svg>
                    {outgoingEdges.map((edge, ei) => (
                      <span key={ei} className="text-[10px] text-red-500 font-medium">
                        {edge.label || edge.relation || '导致'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && hasData && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
