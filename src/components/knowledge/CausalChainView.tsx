'use client';

interface CausalNode {
  event: string;
  description?: string;
}

interface CausalEdge {
  from: number; // index
  to: number;   // index
  label?: string;
}

interface CausalChainData {
  nodes?: CausalNode[];
  edges?: CausalEdge[];
}

export function CausalChainView({ data = {}, title }: { data: CausalChainData; title: string }) {
  const nodes = data.nodes || [];
  const edges = data.edges || [];

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-sm text-slate-400">暂无因果链数据</p>
      </div>
    );
  }

  // Build adjacency for display
  const childrenOf: Record<number, number[]> = {};
  for (const edge of edges) {
    if (!childrenOf[edge.from]) childrenOf[edge.from] = [];
    childrenOf[edge.from].push(edge.to);
  }

  return (
    <div className="rounded-xl border border-red-200/60 bg-gradient-to-br from-red-50/50 to-orange-50/50 p-5">
      <h4 className="text-sm font-semibold text-red-800 mb-5">{title}</h4>

      <div className="space-y-4">
        {nodes.map((node, i) => {
          const hasChildren = childrenOf[i] && childrenOf[i].length > 0;
          const outgoingEdges = edges.filter(e => e.from === i);

          return (
            <div key={i}>
              <div className="bg-white rounded-lg border border-slate-200/60 p-3.5 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <h5 className="text-sm font-medium text-slate-800">{node.event}</h5>
                    {node.description && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{node.description}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Arrow to next */}
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
                        {edge.label || '导致'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
