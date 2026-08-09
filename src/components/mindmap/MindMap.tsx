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

interface MindMapDataNode {
  id: string;
  title?: string | null;
  subject?: {
    name?: string | null;
  } | null;
  chapter?: {
    id?: string | null;
    title?: string | null;
  } | null;
  chapterId?: string | null;
  difficulty?: number | null;
  masteryLevel?: number | null;
  icapLevel?: string | null;
  summary?: string | null;
  representationType?: string | null;
}

interface MindMapDataEdge {
  id?: string;
  fromId?: string | null;
  toId?: string | null;
  relationType?: string | null;
}

interface RenderableMindMapEdge extends MindMapDataEdge {
  fromId: string;
  toId: string;
}

interface MindMapFlowData extends Record<string, unknown> {
  label: string;
  subject: string;
  difficulty: number;
  masteryLevel: number;
  icapLevel: string;
  summary?: string;
  representationType?: string;
  isHighlighted: boolean;
}

interface MindMapTreeNodeData extends Record<string, unknown> {
  label: string;
  kind: 'root' | 'chapter';
  count?: number;
}

interface MindMapProps {
  nodes: MindMapDataNode[];
  edges: MindMapDataEdge[];
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

const TREE_ROOT_ID = '__mindmap_root';
const TREE_CHAPTER_PREFIX = '__mindmap_chapter__';

function getRelationType(value?: string | null): RelationType | undefined {
  return value && value in RELATION_LABELS ? value as RelationType : undefined;
}

function getEdgeKey(edge: RenderableMindMapEdge): string {
  return edge.id || `${edge.fromId}:${edge.toId}:${edge.relationType || 'edge'}`;
}

export function MindMap({
  nodes: rawDataNodes,
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

  // API 可能返回重复 id 的节点（如 schema 节点同时出现在常规列表和
  // includeSchemas 分支），ReactFlow 遇到重复 id 会告警并渲染异常——先按 id 去重
  const dataNodes = useMemo(() => {
    if (!rawDataNodes) return rawDataNodes;
    const seen = new Set<string>();
    return rawDataNodes.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }, [rawDataNodes]);

  const treeGroups = useMemo(() => {
    const groups = new Map<string, { id: string; title: string; nodes: MindMapDataNode[] }>();
    for (const node of dataNodes || []) {
      if (node.representationType === 'schema') continue;
      const chapterKey = node.chapter?.id || node.chapterId || 'uncategorized';
      const chapterTitle = node.chapter?.title || '未分组知识';
      const existing = groups.get(chapterKey);
      if (existing) {
        existing.nodes.push(node);
      } else {
        groups.set(chapterKey, { id: chapterKey, title: chapterTitle, nodes: [node] });
      }
    }
    return Array.from(groups.values());
  }, [dataNodes]);

  const rootLabel = useMemo(() => {
    if (!dataNodes || dataNodes.length === 0) return '思维导图';
    return dataNodes[0]?.subject?.name || '知识主题';
  }, [dataNodes]);

  // Build a quick lookup: nodeId -> chapterId
  const nodeChapterMap = useMemo(() => {
    const map = new Map<string, string>();
    if (dataNodes) {
      dataNodes.forEach((n) => {
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
      dataEdges.forEach((e) => {
        if (!e.fromId || !e.toId) return;
        const fromChap = nodeChapterMap.get(e.fromId);
        const toChap = nodeChapterMap.get(e.toId);
        if (fromChap && toChap && fromChap !== toChap) {
          ids.add(getEdgeKey({ ...e, fromId: e.fromId, toId: e.toId }));
        }
      });
    }
    return ids;
  }, [crossChapterEnabled, dataEdges, nodeChapterMap]);

  // Compute connected member node IDs for the hovered schema node
  const highlightedMemberIds = useMemo(() => {
    if (!hoveredSchemaNode || !dataEdges) return new Set<string>();
    const memberIds = new Set<string>();
    dataEdges.forEach((edge) => {
      if (!edge.fromId || !edge.toId) return;
      if (edge.relationType !== 'schema_member') return;
      if (edge.fromId === hoveredSchemaNode) memberIds.add(edge.toId);
      if (edge.toId === hoveredSchemaNode) memberIds.add(edge.fromId);
    });
    return memberIds;
  }, [hoveredSchemaNode, dataEdges]);

  // Tree mind-map layout: center topic -> chapter branches -> knowledge leaves.
  const initialNodes: Node<MindMapFlowData | MindMapTreeNodeData>[] = useMemo(() => {
    if (!dataNodes || dataNodes.length === 0) return [];

    const chapterX = 360;
    const knowledgeX = 720;
    const knowledgeColumnGap = 310;
    const schemaX = 1720;
    const childRowGap = 135;
    const chapterGap = 85;
    const maxChildrenPerRow = 3;
    const treeHeight = treeGroups.reduce(
      (sum, group) => {
        const rows = Math.max(1, Math.ceil(group.nodes.length / maxChildrenPerRow));
        return sum + rows * childRowGap + chapterGap;
      },
      0,
    );
    let cursorY = 40;

    const flowNodes: Node<MindMapFlowData | MindMapTreeNodeData>[] = [
      {
        id: TREE_ROOT_ID,
        type: 'input',
        position: { x: 40, y: Math.max(120, treeHeight / 2 - 34) },
        data: {
          label: rootLabel,
          kind: 'root',
          count: dataNodes.filter((node) => node.representationType !== 'schema').length,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: 220,
          borderRadius: 18,
          border: '1px solid #6366f1',
          background: '#eef2ff',
          color: '#312e81',
          fontWeight: 700,
          padding: 14,
          boxShadow: '0 10px 24px rgba(99,102,241,0.14)',
        },
      },
    ];

    for (const group of treeGroups) {
      const groupStartY = cursorY;
      const children = group.nodes;
      const childRows = Math.max(1, Math.ceil(children.length / maxChildrenPerRow));
      const groupHeight = childRows * childRowGap;
      children.forEach((node, index) => {
        const col = index % maxChildrenPerRow;
        const row = Math.floor(index / maxChildrenPerRow);
        flowNodes.push({
          id: node.id,
          type: 'knowledgeNode',
          position: {
            x: knowledgeX + col * knowledgeColumnGap,
            y: groupStartY + row * childRowGap,
          },
          data: {
            label: node.title || 'Untitled',
            subject: node.subject?.name || '',
            difficulty: node.difficulty ?? 3,
            masteryLevel: node.masteryLevel ?? 0,
            icapLevel: node.icapLevel || 'Passive',
            summary: node.summary || undefined,
            representationType: node.representationType || undefined,
            isHighlighted: highlightedMemberIds.has(node.id),
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      });

      flowNodes.push({
        id: `${TREE_CHAPTER_PREFIX}${group.id}`,
        type: 'default',
        position: {
          x: chapterX,
          y: groupStartY + Math.max(0, groupHeight - childRowGap) / 2 + 18,
        },
        data: {
          label: `${group.title} (${children.length})`,
          kind: 'chapter',
          count: children.length,
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          width: 220,
          borderRadius: 14,
          border: '1px solid #cbd5e1',
          background: '#ffffff',
          color: '#334155',
          fontWeight: 650,
          padding: 12,
          boxShadow: '0 6px 18px rgba(15,23,42,0.06)',
        },
      });

      cursorY += groupHeight + chapterGap;
    }

    dataNodes
      .filter((node) => node.representationType === 'schema')
      .forEach((node, index) => {
        flowNodes.push({
          id: node.id,
          type: 'knowledgeNode',
          position: { x: schemaX, y: 40 + index * childRowGap },
          data: {
            label: node.title || 'Untitled',
            subject: node.subject?.name || '',
            difficulty: node.difficulty ?? 3,
            masteryLevel: node.masteryLevel ?? 0,
            icapLevel: node.icapLevel || 'Passive',
            summary: node.summary || undefined,
            representationType: node.representationType || undefined,
            isHighlighted: highlightedMemberIds.has(node.id),
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });
      });

    return flowNodes;
  }, [dataNodes, highlightedMemberIds, rootLabel, treeGroups]);

  const treeEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    for (const group of treeGroups) {
      const chapterNodeId = `${TREE_CHAPTER_PREFIX}${group.id}`;
      edges.push({
        id: `${TREE_ROOT_ID}:${chapterNodeId}`,
        source: TREE_ROOT_ID,
        target: chapterNodeId,
        type: 'smoothstep',
        style: { stroke: '#6366f1', strokeWidth: 2.2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
      });

      for (const node of group.nodes) {
        edges.push({
          id: `${chapterNodeId}:${node.id}`,
          source: chapterNodeId,
          target: node.id,
          type: 'smoothstep',
          style: { stroke: '#94a3b8', strokeWidth: 1.7 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        });
      }
    }

    return edges;
  }, [treeGroups]);

  // Filter edges by active relation type
  const filteredEdges = useMemo(() => {
    if (!dataEdges) return [];
    if (!activeFilter) return dataEdges;
    return dataEdges.filter((e) => e.relationType === activeFilter);
  }, [dataEdges, activeFilter]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!filteredEdges) return [];
    const renderableEdges = filteredEdges.filter((edge): edge is RenderableMindMapEdge => (
      typeof edge.fromId === 'string' &&
      edge.fromId.length > 0 &&
      typeof edge.toId === 'string' &&
      edge.toId.length > 0
    ));

    return renderableEdges.map((edge) => {
      const isSchemaMember = edge.relationType === 'schema_member';
      const edgeKey = getEdgeKey(edge);
      const isCrossChapter = crossChapterEdgeIds.has(edgeKey);
      const relationType = getRelationType(edge.relationType);
      const color = relationType ? RELATION_COLORS[relationType] : '#94a3b8';
      const isHighlighted =
        !!hoveredSchemaNode &&
        isSchemaMember &&
        (edge.fromId === hoveredSchemaNode || edge.toId === hoveredSchemaNode);

      // Cross-chapter edges get a distinct dashed + thicker style
      const dashArray = isCrossChapter ? '8 4' : (isSchemaMember ? '6 4' : undefined);

      return {
        id: edgeKey,
        source: edge.fromId,
        target: edge.toId,
        label: (isCrossChapter ? '[跨章] ' : '') + (relationType ? RELATION_LABELS[relationType] : edge.relationType || ''),
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

  const relationEdges = useMemo(() => {
    const treeEdgeIds = new Set(treeEdges.map((edge) => edge.id));
    return initialEdges.filter((edge) => !treeEdgeIds.has(edge.id));
  }, [initialEdges, treeEdges]);

  const flowEdges = useMemo(() => [...treeEdges, ...relationEdges], [treeEdges, relationEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    // 重建节点（悬停高亮、筛选变化都会触发）时按 id 保留用户手动
    // 拖拽的位置，只更新数据——否则鼠标划过 schema 节点就重置整个布局
    setNodes((current) => {
      const posById = new Map(current.map((n) => [n.id, n.position]));
      return initialNodes.map((n) => {
        const pos = posById.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
    });
    setEdges(flowEdges);
  }, [initialNodes, flowEdges, setNodes, setEdges]);

  const onNodeClickHandler = useCallback(
    (_event: React.MouseEvent, node: Node<MindMapFlowData | MindMapTreeNodeData>) => {
      if (node.id === TREE_ROOT_ID || node.id.startsWith(TREE_CHAPTER_PREFIX)) return;
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  const onNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node<MindMapFlowData | MindMapTreeNodeData>) => {
      const nodeData = dataNodes?.find((n) => n.id === node.id);
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
    dataEdges.forEach((e) => { if (e.relationType) types.add(e.relationType); });
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
            nodeColor={(n: Node) => {
              const data = n.data as Partial<MindMapFlowData>;
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
