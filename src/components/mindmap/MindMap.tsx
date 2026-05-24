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
}

const nodeTypes = {
  knowledgeNode: KnowledgeNodeCard,
};

export function MindMap({ nodes: dataNodes, edges: dataEdges, onNodeClick, className }: MindMapProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // 转换为 ReactFlow 格式
  const initialNodes: Node[] = useMemo(() => {
    if (!dataNodes || dataNodes.length === 0) return [];

    // 简单的网格布局
    const cols = Math.ceil(Math.sqrt(dataNodes.length));
    return dataNodes.map((node, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      return {
        id: node.id,
        type: 'knowledgeNode',
        position: { x: col * 280 + 40, y: row * 160 + 40 },
        data: {
          label: node.title,
          subject: node.subject?.name || '',
          difficulty: node.difficulty,
          masteryLevel: node.masteryLevel,
          icapLevel: node.icapLevel,
          summary: node.summary,
          onClick: () => {
            setSelectedNode(node.id);
            onNodeClick?.(node.id);
          },
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      };
    });
  }, [dataNodes]);

  const initialEdges: Edge[] = useMemo(() => {
    if (!dataEdges) return [];
    return dataEdges.map((edge) => ({
      id: edge.id,
      source: edge.fromId,
      target: edge.toId,
      label: RELATION_LABELS[edge.relationType as RelationType] || edge.relationType,
      style: {
        stroke: RELATION_COLORS[edge.relationType as RelationType] || '#94a3b8',
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: RELATION_COLORS[edge.relationType as RelationType] || '#94a3b8',
      },
      labelStyle: { fontSize: 11, fill: '#64748b' },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
      animated: edge.relationType === 'prerequisite' || edge.relationType === 'cause',
    }));
  }, [dataEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onNodeClickHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

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
    <div className={className || 'w-full h-[600px]'}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickHandler}
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
            const level = (n.data as any)?.masteryLevel || 0;
            if (level >= 80) return '#10b981';
            if (level >= 60) return '#f59e0b';
            return '#ef4444';
          }}
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>
    </div>
  );
}
