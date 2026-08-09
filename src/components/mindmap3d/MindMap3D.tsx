'use client';

// ---------------------------------------------------------------------------
// 3D 思维导图（知识星空）— React 封装
// three.js 引擎在 galaxy.ts，这里只负责 DOM 覆盖层（HUD/提示/聚焦面板）
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GalaxyEngine } from './galaxy';
import type { GalaxyRawNode, GalaxyRawEdge, GalaxyStats } from './galaxy';
import { RELATION_COLORS, RELATION_LABELS } from '@/types';
import type { RelationType } from '@/types';

export interface MindMap3DNode extends GalaxyRawNode {
  summary?: string | null;
}

export type MindMap3DEdge = GalaxyRawEdge;

interface MindMap3DProps {
  nodes: MindMap3DNode[];
  edges: MindMap3DEdge[];
  onNodeClick?: (nodeId: string) => void;
  className?: string;
  /** 跨章节边高亮（琥珀色） */
  crossChapterEnabled?: boolean;
  relationTypeFilter?: string;
  onRelationTypeFilterChange?: (type: string) => void;
}

interface HoverInfo {
  id: string;
  x: number;
  y: number;
}

const MASTERED_THRESHOLD = 60;

export function MindMap3D({
  nodes,
  edges,
  onNodeClick,
  className,
  crossChapterEnabled = false,
  relationTypeFilter = '',
  onRelationTypeFilterChange,
}: MindMap3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [stats, setStats] = useState<GalaxyStats | null>(null);
  const [internalFilter, setInternalFilter] = useState('');
  const activeFilter = relationTypeFilter || internalFilter;

  const nodeById = useMemo(() => {
    const map = new Map<string, MindMap3DNode>();
    for (const n of nodes || []) {
      if (n.id && !map.has(n.id)) map.set(n.id, n);
    }
    return map;
  }, [nodes]);

  // 引擎生命周期（只创建一次；回调都是稳定的 setState 封装）
  const handleHover = useCallback((info: HoverInfo | null) => setHover(info), []);
  const handleFocusChange = useCallback((id: string | null) => setFocusId(id), []);
  const handleStats = useCallback((s: GalaxyStats) => {
    // setData 在 effect 里同步触发此回调 —— 推到微任务，避免 effect 体内 setState
    queueMicrotask(() => setStats(s));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const engine = new GalaxyEngine(el, {
      onHover: handleHover,
      onFocusChange: handleFocusChange,
      onStatsChange: handleStats,
    });
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [handleHover, handleFocusChange, handleStats]);

  useEffect(() => {
    engineRef.current?.setData(nodes || [], edges || []);
  }, [nodes, edges]);

  useEffect(() => {
    engineRef.current?.setRelationFilter(activeFilter);
  }, [activeFilter]);

  useEffect(() => {
    engineRef.current?.setCrossChapter(crossChapterEnabled);
  }, [crossChapterEnabled]);

  // 图例：只显示当前数据里实际出现的关系类型
  const availableRelationTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of edges || []) {
      if (e.relationType && e.relationType in RELATION_LABELS) types.add(e.relationType);
    }
    return Array.from(types) as RelationType[];
  }, [edges]);

  const applyFilter = useCallback((type: string) => {
    if (onRelationTypeFilterChange) onRelationTypeFilterChange(type);
    else setInternalFilter(type);
  }, [onRelationTypeFilterChange]);

  // 聚焦节点的关系列表（沿图谱跳转探索）
  const focusRelations = useMemo(() => {
    if (!focusId) return [];
    const list: Array<{
      key: string;
      otherId: string;
      otherTitle: string;
      relationType: RelationType | null;
      out: boolean;
    }> = [];
    for (const e of edges || []) {
      if (!e.fromId || !e.toId) continue;
      if (e.fromId !== focusId && e.toId !== focusId) continue;
      if (activeFilter && e.relationType !== activeFilter) continue;
      const out = e.fromId === focusId;
      const otherId = out ? e.toId : e.fromId;
      list.push({
        key: e.id || `${e.fromId}:${e.toId}:${e.relationType || 'edge'}`,
        otherId,
        otherTitle: nodeById.get(otherId)?.title || '未命名',
        relationType: e.relationType && e.relationType in RELATION_LABELS ? e.relationType as RelationType : null,
        out,
      });
    }
    return list;
  }, [focusId, edges, nodeById, activeFilter]);

  const focusNode = focusId ? nodeById.get(focusId) : null;
  const hoverNode = hover ? nodeById.get(hover.id) : null;
  const masteredPct = stats && stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;

  return (
    <div className={`relative overflow-hidden bg-[#0b1023] ${className || 'w-full h-[600px]'}`}>
      {/* three.js 画布挂载点 */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* 顶部左：点亮进度 */}
      {stats && stats.total > 0 && (
        <div className="absolute top-3 left-3 z-10 rounded-xl bg-slate-900/75 backdrop-blur-sm border border-white/10 px-3.5 py-2.5 text-white shadow-lg">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <span>🌌</span>
            <span>已点亮 {stats.mastered} / {stats.total} 颗知识星</span>
            <span className="text-amber-300">{masteredPct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-48 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400 transition-all duration-500"
              style={{ width: `${masteredPct}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-slate-400">掌握度到 {MASTERED_THRESHOLD} 即可点亮一颗星</div>
        </div>
      )}

      {/* 顶部右：推荐点亮 + 重置视角 */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5 max-w-[46%]">
        {stats && stats.suggested.length > 0 && (
          <div className="rounded-xl bg-slate-900/75 backdrop-blur-sm border border-amber-300/20 px-3 py-2 shadow-lg">
            <div className="text-[11px] font-semibold text-amber-300 mb-1">💡 推荐点亮（前置已掌握）</div>
            <div className="flex flex-wrap gap-1 justify-end">
              {stats.suggested.slice(0, 3).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => engineRef.current?.focusNode(id)}
                  className="rounded-full bg-amber-400/15 hover:bg-amber-400/30 border border-amber-300/30 px-2 py-0.5 text-[11px] text-amber-200 transition-colors"
                >
                  ✨ {(nodeById.get(id)?.title || '未命名').slice(0, 10)}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => engineRef.current?.resetView()}
          className="rounded-full bg-slate-900/75 backdrop-blur-sm border border-white/10 px-3 py-1 text-[11px] text-slate-300 hover:text-white hover:border-white/25 transition-colors"
        >
          ↺ 全景视角
        </button>
      </div>

      {/* 底部左：关系图例（点击筛选） */}
      {availableRelationTypes.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-1 max-w-[70%]">
          {availableRelationTypes.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => applyFilter(activeFilter === key ? '' : key)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm border transition-colors ${
                activeFilter === key
                  ? 'bg-white/20 text-white border-white/40'
                  : 'bg-slate-900/60 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: RELATION_COLORS[key] }}
              />
              {RELATION_LABELS[key]}
            </button>
          ))}
          {activeFilter && (
            <button
              type="button"
              onClick={() => applyFilter('')}
              className="rounded-full px-2 py-0.5 text-[10px] text-rose-300 hover:text-rose-200 bg-slate-900/60 border border-white/10"
            >
              清除筛选
            </button>
          )}
        </div>
      )}

      {/* 底部右：操作提示 */}
      <div className="absolute bottom-3 right-3 z-10 text-[10px] text-slate-500 bg-slate-900/60 backdrop-blur-sm rounded-full px-3 py-1 border border-white/5 hidden sm:block">
        拖动旋转 · 滚轮缩放 · 点击星球聚焦
      </div>

      {/* 悬停提示 */}
      {hover && hoverNode && !focusId && (
        <div
          className="absolute z-20 pointer-events-none rounded-lg bg-slate-900/90 border border-white/15 px-2.5 py-1.5 text-white shadow-xl max-w-[220px]"
          style={{ left: hover.x + 14, top: hover.y + 12 }}
        >
          <div className="text-[12px] font-semibold leading-tight">{hoverNode.title}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {hoverNode.chapter?.title || '未分组'} · 掌握度 {hoverNode.masteryLevel ?? 0}
            {(hoverNode.masteryLevel ?? 0) >= MASTERED_THRESHOLD ? ' ✨已点亮' : ''}
          </div>
        </div>
      )}

      {/* 聚焦面板 */}
      {focusNode && (
        <div className="absolute top-14 right-3 z-20 w-64 sm:w-72 rounded-2xl bg-slate-900/85 backdrop-blur-md border border-white/15 p-4 text-white shadow-2xl max-h-[calc(100%-5rem)] overflow-y-auto">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[15px] font-bold leading-snug">{focusNode.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="rounded-full bg-blue-400/15 text-blue-300 border border-blue-300/25 px-2 py-0.5">
                  {focusNode.chapter?.title || '未分组知识'}
                </span>
                {(focusNode.masteryLevel ?? 0) >= MASTERED_THRESHOLD && (
                  <span className="rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-300/25 px-2 py-0.5">✨ 已点亮</span>
                )}
                {focusNode.difficulty != null && (
                  <span className="text-amber-300/80">{'★'.repeat(Math.max(1, Math.min(5, focusNode.difficulty)))}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => engineRef.current?.focusNode(null)}
              className="shrink-0 rounded-full w-6 h-6 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>

          {/* 掌握度 */}
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-slate-300">
              <span>掌握度</span>
              <span className={(focusNode.masteryLevel ?? 0) >= MASTERED_THRESHOLD ? 'text-emerald-300' : 'text-amber-300'}>
                {focusNode.masteryLevel ?? 0} / 100
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${(focusNode.masteryLevel ?? 0) >= MASTERED_THRESHOLD ? 'bg-emerald-400' : 'bg-amber-400'}`}
                style={{ width: `${Math.max(2, Math.min(100, focusNode.masteryLevel ?? 0))}%` }}
              />
            </div>
            {(focusNode.masteryLevel ?? 0) < MASTERED_THRESHOLD && (
              <div className="mt-1 text-[10px] text-slate-500">掌握度到 {MASTERED_THRESHOLD} 就能点亮这颗星 ✨</div>
            )}
          </div>

          {focusNode.summary && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-300 line-clamp-4">{focusNode.summary}</p>
          )}

          {/* 关系列表 —— 沿着图谱继续探索 */}
          {focusRelations.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-semibold text-slate-400 mb-1.5">
                🔗 知识连接（{focusRelations.length}）· 点击跳转
              </div>
              <div className="space-y-1">
                {focusRelations.slice(0, 10).map((rel) => (
                  <button
                    key={rel.key}
                    type="button"
                    onClick={() => engineRef.current?.focusNode(rel.otherId)}
                    className="w-full flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/12 border border-white/10 px-2 py-1.5 text-left transition-colors"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: rel.relationType ? RELATION_COLORS[rel.relationType] : '#94a3b8' }}
                    />
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {rel.out ? '→' : '←'} {rel.relationType ? RELATION_LABELS[rel.relationType] : '关联'}
                    </span>
                    <span className="text-[11px] text-slate-200 truncate">{rel.otherTitle}</span>
                  </button>
                ))}
                {focusRelations.length > 10 && (
                  <div className="text-[10px] text-slate-500 pl-1">还有 {focusRelations.length - 10} 条连接…</div>
                )}
              </div>
            </div>
          )}

          {onNodeClick && (
            <button
              type="button"
              onClick={() => onNodeClick(focusNode.id)}
              className="mt-4 w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 px-3 py-2 text-[13px] font-semibold text-white transition-colors"
            >
              打开知识卡，点亮这颗星 →
            </button>
          )}
        </div>
      )}

      {/* 加载中 */}
      {!stats && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-slate-500 text-sm pointer-events-none">
          🌌 正在构建知识星空…
        </div>
      )}
    </div>
  );
}
