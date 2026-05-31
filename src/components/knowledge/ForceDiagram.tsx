'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { BoundaryCallout } from './BoundaryCallout';

// ========== Force vector type (shared by both formats) ==========
interface ForceVector {
  name: string;
  direction: 'up' | 'down' | 'left' | 'right' | 'upleft' | 'upright' | 'downleft' | 'downright';
  magnitude: string;
  color?: string;
}

// ========== Legacy format: objects array ==========
interface ForceObject {
  name: string;
  forces: ForceVector[];
}

// ========== Engine format: flat body+forces ==========
interface ForceEngineForce {
  name: string;
  direction: string;
  magnitude: string;
  point?: string;
  color?: string;
}

// ========== Unified data interface ==========
export interface ForceDiagramData {
  /** Engine-generated: single body with forces */
  body?: string;
  forces?: ForceEngineForce[];
  /** Engine-generated: coordinate system description */
  coordinateSystem?: string;
  /** Legacy: array of objects with forces */
  objects?: ForceObject[];
  /** Boundary/limitation: when this representation breaks down */
  boundary?: string;
}

interface ForceDiagramProps {
  data?: ForceDiagramData | null;
  title: string;
  nodeId?: string;
  loading?: boolean;
  error?: string | null;
  onGenerate?: () => void;
}

// ========== Direction vectors for SVG rendering ==========
const directionVectors: Record<string, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  upleft: { dx: -0.7, dy: -0.7 },
  upright: { dx: 0.7, dy: -0.7 },
  downleft: { dx: -0.7, dy: 0.7 },
  downright: { dx: 0.7, dy: 0.7 },
};

const defaultColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const BASE_ARROW_LEN = 55;

// ========== Helpers ==========
function parseMagnitude(mag: string): number {
  const match = mag.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 1;
}

function getUnit(mag: string): string {
  const m = mag.match(/[a-zA-Z一-鿿]+/);
  return m ? m[0] : '';
}

// ========== Single force arrow SVG element ==========
function ForceArrow({
  force,
  index,
  cx,
  cy,
  scale = 1,
  onDragStart,
}: {
  force: ForceVector;
  index: number;
  cx: number;
  cy: number;
  scale?: number;
  onDragStart?: (e: React.MouseEvent) => void;
}) {
  const vec = directionVectors[force.direction] || directionVectors.down;
  const arrowLen = BASE_ARROW_LEN * scale;
  const x2 = cx + vec.dx * arrowLen;
  const y2 = cy + vec.dy * arrowLen;
  const color = force.color || defaultColors[index % defaultColors.length];

  const lx = cx + vec.dx * arrowLen * 0.55;
  const ly = cy + vec.dy * arrowLen * 0.55;

  const currentMag = (parseMagnitude(force.magnitude) * scale).toFixed(1);
  const unit = getUnit(force.magnitude);

  return (
    <g>
      <line
        x1={cx} y1={cy} x2={x2} y2={y2}
        stroke={color} strokeWidth="2"
        markerEnd={`url(#arrow-${index})`}
      />
      <defs>
        <marker
          id={`arrow-${index}`} viewBox="0 0 10 10"
          refX="9" refY="5" markerWidth="6" markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      {/* Label with numerical magnitude */}
      <text
        x={lx} y={ly} textAnchor="middle"
        dominantBaseline="middle" fill={color}
        fontSize="11" fontWeight="600"
      >
        {force.name} {currentMag}{unit}
      </text>
      {/* Drag handle at arrow tip */}
      <circle
        cx={x2} cy={y2} r={7}
        fill="white" fillOpacity={0.7}
        stroke={color} strokeWidth="1.5"
        strokeDasharray="2 2"
        style={{ cursor: 'grab' }}
        onMouseDown={onDragStart}
      />
    </g>
  );
}

// ========== Main component ==========
export function ForceDiagram({
  data,
  title,
  nodeId,
  loading = false,
  error = null,
  onGenerate,
}: ForceDiagramProps) {
  // Normalize data: accept both engine format (body + forces) and legacy format (objects)
  const _data = data || {};

  let objects: ForceObject[] = _data.objects || [];

  // If engine format is provided, wrap it into objects array
  if (objects.length === 0 && _data.body && _data.forces && _data.forces.length > 0) {
    objects = [
      {
        name: _data.body,
        forces: _data.forces.map((f) => ({
          name: f.name,
          direction: (f.direction as ForceVector['direction']) || 'down',
          magnitude: f.magnitude,
          color: (f as any).color,
        })),
      },
    ];
  }

  const coordinateSystem = _data.coordinateSystem;
  const boundary = _data.boundary;
  const hasData = objects.length > 0;

  // ---- Interactive state: drag-to-adjust force magnitudes ----
  const [magnitudes, setMagnitudes] = useState<Record<string, number>>({});
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragSvgRef = useRef<SVGSVGElement | null>(null);
  // Keep a ref to objects so the document-level drag handler reads current data
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  // Reset magnitudes when the underlying data changes
  const dataFingerprint = objects
    .map((o) => o.forces.map((f) => f.magnitude).join(','))
    .join('|');
  useEffect(() => {
    setMagnitudes({});
    setDraggingKey(null);
  }, [dataFingerprint]);

  const getScale = useCallback(
    (objIdx: number, forceIdx: number): number => {
      const key = `${objIdx}-${forceIdx}`;
      return magnitudes[key] ?? 1;
    },
    [magnitudes],
  );

  const handleReset = useCallback(() => {
    setMagnitudes({});
  }, []);

  const handleDragStart = useCallback(
    (key: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingKey(key);
      const svg = (e.target as Element).closest('svg') as SVGSVGElement | null;
      if (svg) dragSvgRef.current = svg;
    },
    [],
  );

  // Document-level drag listeners for reliable tracking outside the SVG
  useEffect(() => {
    if (!draggingKey) return;

    const handleMove = (e: MouseEvent) => {
      const svg = dragSvgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const svgX = ((e.clientX - rect.left) / rect.width) * vb.width;
      const svgY = ((e.clientY - rect.top) / rect.height) * vb.height;
      const cx = 100;
      const cy = 100;

      const [oi, fi] = draggingKey.split('-').map(Number);
      const objs = objectsRef.current;
      const force = objs[oi]?.forces?.[fi];
      if (!force) return;

      const vec = directionVectors[force.direction] || directionVectors.down;
      // Project mouse displacement onto force direction
      const proj = (svgX - cx) * vec.dx + (svgY - cy) * vec.dy;
      const clamped = Math.max(8, Math.min(180, proj));
      const scale = clamped / BASE_ARROW_LEN;

      setMagnitudes((prev) => ({
        ...prev,
        [draggingKey]: Math.round(scale * 100) / 100,
      }));
    };

    const handleUp = () => {
      setDraggingKey(null);
      dragSvgRef.current = null;
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [draggingKey]);

  // Loading state
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/30 p-6 text-center">
        <svg className="w-6 h-6 animate-spin mx-auto mb-3 text-indigo-500" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
        </svg>
        <p className="text-sm text-indigo-600 font-medium">AI 正在生成受力分析图...</p>
        <p className="text-xs text-slate-400 mt-1">正在分析力的方向和大小</p>
      </div>
    );
  }

  // Error state (no data to show)
  if (error && !hasData) {
    return (
      <div className="rounded-xl border border-dashed border-red-200 bg-red-50/30 p-6 text-center">
        <p className="text-sm text-red-600 mb-2">受力图生成失败</p>
        <p className="text-xs text-red-400 mb-4">{error}</p>
        {onGenerate && (
          <Button size="sm" variant="secondary" onClick={onGenerate}>
            重试
          </Button>
        )}
      </div>
    );
  }

  // Empty state: show generate button or text description
  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-sm text-slate-500 mb-3">暂无受力分析数据</p>
        <p className="text-xs text-slate-400 mb-4">
          AI 将分析物体受力情况并绘制受力示意图
        </p>
        {onGenerate ? (
          <Button size="sm" onClick={onGenerate} disabled={!nodeId}>
            生成受力图
          </Button>
        ) : (
          <p className="text-xs text-slate-400">请先生成受力分析</p>
        )}
      </div>
    );
  }

  const hasModifications = Object.keys(magnitudes).length > 0;

  // Data state: render the SVG force diagram
  return (
    <div className="rounded-xl border border-purple-200/60 bg-gradient-to-br from-purple-50/50 to-indigo-50/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-purple-800">{title}</h4>
        {hasModifications && (
          <button
            onClick={handleReset}
            className="text-xs text-purple-600 hover:text-purple-800 underline underline-offset-2 font-medium"
          >
            重置力的大小
          </button>
        )}
      </div>

      <div className="space-y-6">
        {objects.map((obj, objIdx) => (
          <div key={objIdx} className="bg-white rounded-lg border border-slate-200/60 p-4">
            <h5 className="text-sm font-medium text-slate-700 mb-3 text-center">{obj.name}</h5>
            <div className="flex justify-center">
              <svg width="200" height="200" viewBox="0 0 200 200">
                {/* Object (box) rendered as a rounded rectangle */}
                <rect x="70" y="70" width="60" height="60" rx="4" fill="#f1f5f9" stroke="#64748b" strokeWidth="2" />
                <text x="100" y="105" textAnchor="middle" fill="#475569" fontSize="12" fontWeight="500">
                  {obj.name}
                </text>
                {/* Force arrows */}
                {obj.forces.map((force, fi) => (
                  <ForceArrow
                    key={fi}
                    force={force}
                    index={objIdx * 10 + fi}
                    cx={100}
                    cy={100}
                    scale={getScale(objIdx, fi)}
                    onDragStart={handleDragStart(`${objIdx}-${fi}`)}
                  />
                ))}
              </svg>
            </div>
            {/* Legend below the diagram */}
            <div className="flex flex-wrap gap-3 justify-center mt-3">
              {obj.forces.map((force, fi) => {
                const color = force.color || defaultColors[fi % defaultColors.length];
                const scale = getScale(objIdx, fi);
                const mag = (parseMagnitude(force.magnitude) * scale).toFixed(1);
                const unit = getUnit(force.magnitude);
                return (
                  <div key={fi} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: color }} />
                    {force.name}: {mag}{unit}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Coordinate system description (engine-generated info) */}
      {coordinateSystem && (
        <div className="mt-4 bg-white rounded-lg border border-slate-200/60 p-3">
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">坐标系</h5>
          <p className="text-xs text-slate-600 leading-relaxed">{coordinateSystem}</p>
        </div>
      )}

      {/* Error banner with existing data */}
      {boundary && <BoundaryCallout boundary={boundary} />}

      {error && hasData && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
