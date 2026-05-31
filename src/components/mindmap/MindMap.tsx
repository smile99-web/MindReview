'use client';

import { useCallback, useMemo, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
} from '@xyflow/react';
import { KnowledgeNodeCard } from './KnowledgeNodeCard';
import { RELATION_COLORS, RELATION_LABELS } from '@/types';
import type { RelationType } from '@/types';

interface MindMapProps {
  nodes: any[];
  edges: any[];
  onNodeClick?: (nodeId: string) => void;
  className?: string;
  /** When true, edges crossing chapter boundaries get a distinct dashed style */
  crossChapterEnabled?: boolean;
  /** Filter edges to only show those matching this relation type (empty = show all) */
  relationTypeFilter?: string;
  /** Callback when relation type filter changes */
  onRelationTypeFilterChange?: (type: string) => void;
}

const nodeTypes = {
  knowledgeNode: KnowledgeNodeCard,
};

export function MindMap({
  nodes: dataNodes,
  edges: dataEdges,
  onNodeClick,
  className,
  crossChapterEnabled = false,
  relationTypeFilter = '',
  onRelationTypeFilterChange,
}: MindMapProps) {
  const [hoveredSchemaNode, setHoveredSchemaNode] = useState<string | null>(null);
  const [internalFilter, setInternalFilter] = useState('');
  const activeFilter = relationTypeFilter || internalFilter;

  // Build a quick lookup: nodeId -> chapterId
  const nodeChapterMap = useMemo(() => {
    const map = new Map<string, string>();
    if (dataNodes) {
      dataNodes.forEach((n: any) => {
        const cid = n.chapter?.id || n.chapterId || '';
        if (cid) map.set(n.id, cid);
      });
    }
    return map;
  }, [dataNodes]);

  // Identify cross-chapter edges (when crossChapterEnabled)
  const crossChapterEdgeIds = useMemo(() => {
    if (!crossChapterEnabled) return new Set<string>();
    const ids = new Set<string>();
    if (dataEdges) {
      dataEdges.forEach((e: any) => {
        const fromChap = nodeChapterMap.get(e.fromId);
        const toChap = nodeChapterMap.get(e.toId);
        if (fromChap && toChap && fromChap !== toChap) {
          ids.add(e.id);
        }
      });
    }
    return ids;
  }, [crossChapterEnabled, dataEdges, nodeChapterMap]);

  // Compute connected member node IDs for the hovered schema node
  const highlightedMemberIds = useMemo(() => {
    if (!hoveredSchemaNode || !dataEdges) return new Set<string>();
    const memberIds = new Set<string>();
    dataEdges.forEach((edge: any) => {
      if (edge.relationType !== 'schema_member') return;
      if (edge.fromId === hoveredSchemaNode) memberIds.add(edge.toId);
      if (edge.toId === hoveredSchemaNode) memberIds.add(edge.fromId);
    });
    return memberIds;
  }, [hoveredSchemaNode, dataEdges]);

  // 转换为 ReactFlow 格式
  const initialNodes: Node[] = useMemo(() => {
    if (!dataNodes || dataNodes.length === 0) return [];

    // 简单的网格布局 — schema nodes get extra spacing
    const cols = Math.ceil(Math.sqrt(dataNodes.length));
    const isSchema = (node: any) => node.representationType === 'schema';
    const spacingX = 280;
    const spacingY = 160;

    return dataNodes.map((node, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const schema = isSchema(node);
      return {
        id: node.id,
        type: 'knowledgeNode',
        position: { x: col * spacingX + 40, y: row * spacingY + 40 },
        data: {
          label: node.title,
          subject: node.subject?.name || '',
          difficulty: node.difficulty,
          masteryLevel: node.masteryLevel,
          icapLevel: node.icapLevel,
          summary: node.summary,
          representationType: node.representationType,
          isHighlighted: highlightedMemberIds.has(node.id),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });
  }, [dataNodes, highlightedMemberIds, onNodeClick]);

  // Filter edges by active relation type
  const filteredEdges = useMemo(() => {
    if (!dataEdges) return [];
    if (!activeFilter) return dataEdges;
    return dataEdges.filter((e: any) => e.relationType === activeFilter);
  }, [dataEdges, activeFilter]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!filteredEdges) return [];
    return filteredEdges.map((edge) => {
      const isSchemaMember = edge.relationType === 'schema_member';
      const isCrossChapter = crossChapterEdgeIds.has(edge.id);
      const color = RELATION_COLORS[edge.relationType as RelationType] || '#94a3b8';
      const isHighlighted =
        !!hoveredSchemaNode &&
        isSchemaMember &&
        (edge.fromId === hoveredSchemaNode || edge.toId === hoveredSchemaNode);

      // Cross-chapter edges get a distinct dashed + thicker style
      const dashArray = isCrossChapter ? '8 4' : (isSchemaMember ? '6 4' : undefined);

      return {
        id: edge.id,
        source: edge.fromId,
        target: edge.toId,
        label: (isCrossChapter ? '[跨章] ' : '') + (RELATION_LABELS[edge.relationType as RelationType] || edge.relationType),
        style: {
          stroke: color,
          strokeWidth: isCrossChapter ? 2.5 : (isHighlighted ? 3 : 1.5),
          strokeDasharray: dashArray,
          opacity: hoveredSchemaNode && !isHighlighted ? 0.25 : 1,
          transition: 'opacity 0.25s, strokeWidth 0.25s',
        },
        markerEnd: {
          type: isSchemaMember || isCrossChapter ? MarkerType.Arrow : MarkerType.ArrowClosed,
          color,
        },
        labelStyle: {
          fontSize: 11,
          fill: isCrossChapter ? '#d97706' : '#64748b',
          fontWeight: isCrossChapter ? 600 : 400,
        },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
        animated: edge.relationType === 'prerequisite' || edge.relationType === 'cause',
      };
    });
  }, [filteredEdges, crossChapterEdgeIds, hoveredSchemaNode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClickHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  const onNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const nodeData = dataNodes?.find((n: any) => n.id === node.id);
      if (nodeData?.representationType === 'schema') {
        setHoveredSchemaNode(node.id);
      }
    },
    [dataNodes],
  );

  const onNodeMouseLeave = useCallback(() => {
    setHoveredSchemaNode(null);
  }, []);

  // Collect unique relation types present in edges for the filter dropdown
  const availableRelationTypes = useMemo(() => {
    if (!dataEdges) return [];
    const types = new Set<string>();
    dataEdges.forEach((e: any) => { if (e.relationType) types.add(e.relationType); });
    return Array.from(types);
  }, [dataEdges]);

  const relationTypeEntries = Object.entries(RELATION_LABELS) as [RelationType, string][];

  if (!dataNodes || dataNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50/80 rounded-2xl border border-dashed border-slate-200/80">
        <div className="text-center text-slate-400">
          <p className="text-4xl mb-3">🗺️</p>
          <p className="font-medium">暂无知识点，请先拆解教材内容</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className || 'w-full h-[600px]'}`}>
      {/* Toolbar: legend + cross-chapter toggle + filter */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-slate-100 bg-white/80 backdrop-blur-sm text-xs shrink-0">
        {/* Legend: edge type chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400 font-medium">图例:</span>
          {relationTypeEntries
            .filter(([key]) => availableRelationTypes.length === 0 || availableRelationTypes.includes(key))
            .map(([key, label]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                  activeFilter === key
                    ? 'bg-slate-200 text-slate-800 ring-1 ring-slate-300'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
                onClick={() => {
                  const next = activeFilter === key ? '' : key;
                  if (onRelationTypeFilterChange) {
                    onRelationTypeFilterChange(next);
                  } else {
                    setInternalFilter(next);
                  }
                }}
                title={`点击筛选 ${label} 关系${activeFilter === key ? '（取消筛选）' : ''}`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: RELATION_COLORS[key] }}
                />
                {label}
              </span>
            ))}
          {activeFilter && (
            <button
              className="text-[10px] text-red-400 hover:text-red-600 font-medium"
              onClick={() => {
                if (onRelationTypeFilterChange) onRelationTypeFilterChange('');
                else setInternalFilter('');
              }}
            >
              清除筛选
            </button>
          )}
        </div>

        {/* Divider */}
        <span className="text-slate-200 select-none">|</span>

        {/* Cross-chapter toggle */}
        <label className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={crossChapterEnabled}
            onChange={() => {}} // controlled externally via page
            className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
            disabled
          />
          <span className="text-[10px] font-medium">跨章节边</span>
          <span
            className="inline-block w-4 h-0.5 rounded ml-0.5"
            style={{
              backgroundColor: '#d97706',
              border: 'none',
              backgroundImage: 'repeating-linear-gradient(90deg, #d97706 0, #d97706 4px, transparent 4px, transparent 8px)',
            }}
            title="跨章节关系使用虚线标识"
          />
        </label>

        {/* Cross-chapter count indicator */}
        {crossChapterEnabled && crossChapterEdgeIds.size > 0 && (
          <span className="text-[10px] text-amber-600 font-medium">
            {crossChapterEdgeIds.size} 条跨章节关系
          </span>
        )}
      </div>

      {/* Flow area */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClickHandler}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap
            nodeStrokeColor="#6366f1"
            nodeColor={(n: any) => {
              const data = n.data as any;
              if (data?.representationType === 'schema') return '#d97706';
              const level = data?.masteryLevel || 0;
              if (level >= 80) return '#10b981';
              if (level >= 60) return '#f59e0b';
              return '#ef4444';
            }}
            maskColor="rgba(0,0,0,0.05)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
