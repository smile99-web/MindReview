'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { LatexText } from '@/components/ui/LatexText';
import { BoundaryCallout } from './BoundaryCallout';

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
  /** Boundary/limitation: when this representation breaks down */
  boundary?: string;
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
  const _data = useMemo(() => data || {}, [data]);
  const nodes = useMemo(() => _data.nodes || [], [_data.nodes]);
  const edges = useMemo(() => _data.edges || _data.chains || [], [_data.edges, _data.chains]);
  const boundary = _data.boundary;
  const hasData = nodes.length > 0;

  // Build adjacency map for display ordering
  const childrenOf = useMemo(() => {
    const map: Record<number, number[]> = {};
    for (const edge of edges) {
      if (!map[edge.from]) map[edge.from] = [];
      map[edge.from].push(edge.to);
    }
    return map;
  }, [edges]);

  // ---- Interactive state: what-if parameter toggle ----
  const [hiddenEffects, setHiddenEffects] = useState<Set<number>>(new Set());

  // Reset when data content changes
  const dataFingerprint =
    nodes.map((n) => n.event).join('|') +
    '::' +
    edges.map((e) => `${e.from}-${e.to}`).join(',');
  useEffect(() => {
    queueMicrotask(() => {
      setHiddenEffects(new Set());
    });
  }, [dataFingerprint]);

  // Compute full downstream set for each node (all reachable nodes via edges)
  const downstreamMap = useMemo(() => {
    const map: Record<number, Set<number>> = {};
    const adj: Record<number, number[]> = {};
    for (const edge of edges) {
      if (!adj[edge.from]) adj[edge.from] = [];
      adj[edge.from].push(edge.to);
    }

    function dfs(node: number, visited: Set<number>): Set<number> {
      if (map[node]) return map[node];
      const result = new Set<number>();
      const children = adj[node] || [];
      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          result.add(child);
          const downstream = dfs(child, new Set(visited));
          downstream.forEach((d) => result.add(d));
        }
      }
      map[node] = result;
      return result;
    }

    for (let i = 0; i < nodes.length; i++) {
      if (!map[i]) dfs(i, new Set());
    }
    return map;
  }, [nodes, edges]);

  // Which nodes should be dimmed (all downstream of hidden-effect nodes)
  const dimmedNodes = useMemo(() => {
    const dimmed = new Set<number>();
    for (const hiddenIdx of hiddenEffects) {
      const downstream = downstreamMap[hiddenIdx];
      if (downstream) {
        downstream.forEach((d) => dimmed.add(d));
      }
    }
    return dimmed;
  }, [hiddenEffects, downstreamMap]);

  const toggleNode = useCallback((idx: number) => {
    setHiddenEffects((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const handleShowAll = useCallback(() => {
    setHiddenEffects(new Set());
  }, []);

  const anyHidden = hiddenEffects.size > 0;

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
      <div className="flex items-center justify-between mb-5">
        <h4 className="text-sm font-semibold text-red-800">{title}</h4>
        <button
          onClick={handleShowAll}
          disabled={!anyHidden}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            anyHidden
              ? 'text-red-600 border-red-300 bg-red-50 hover:bg-red-100 cursor-pointer'
              : 'text-slate-400 border-slate-200 bg-slate-50 cursor-default'
          }`}
        >
          {anyHidden ? `显示全部 (${hiddenEffects.size})` : '显示全部'}
        </button>
      </div>

      <div className="space-y-4">
        {nodes.map((node, i) => {
          const hasChildren = childrenOf[i] && childrenOf[i].length > 0;
          const outgoingEdges = edges.filter((e) => e.from === i);
          const isHidden = hiddenEffects.has(i);
          const isDimmed = dimmedNodes.has(i);
          const dimmedClass = isDimmed ? 'opacity-30' : '';

          return (
            <div key={node.id || i} className={dimmedClass}>
              {/* Node card */}
              <div className="bg-white rounded-lg border border-slate-200/60 p-3.5 shadow-sm relative group">
                <div className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <h5 className="text-sm font-medium text-slate-800">
                      <LatexText text={node.label || node.event} />
                    </h5>
                    {node.description && (
                      <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        <LatexText text={node.description} />
                      </div>
                    )}
                  </div>
                  {/* Toggle button: show/hide this cause's downstream effects */}
                  {hasChildren && (
                    <button
                      onClick={() => toggleNode(i)}
                      title={
                        isHidden
                          ? '显示该原因的后续影响'
                          : '隐藏该原因的后续影响（假设该原因未发生）'
                      }
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                        isHidden
                          ? 'border-amber-400 bg-amber-50 text-amber-600 hover:bg-amber-100'
                          : 'border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {isHidden ? '+' : '−'}
                    </button>
                  )}
                </div>
                {isHidden && (
                  <div className="mt-1.5 text-[10px] text-amber-600 italic">
                    已隐藏该原因的后续影响
                  </div>
                )}
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

      {boundary && <BoundaryCallout boundary={boundary} />}

      {error && hasData && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
