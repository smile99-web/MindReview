'use client';

import { Button } from '@/components/ui/Button';

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
const directionVectors: Record<string, { dx: number; dy: number; labelOffset: { x: number; y: number } }> = {
  up: { dx: 0, dy: -1, labelOffset: { x: 0, y: -18 } },
  down: { dx: 0, dy: 1, labelOffset: { x: 0, y: 16 } },
  left: { dx: -1, dy: 0, labelOffset: { x: -22, y: 0 } },
  right: { dx: 1, dy: 0, labelOffset: { x: 22, y: 0 } },
  upleft: { dx: -0.7, dy: -0.7, labelOffset: { x: -18, y: -18 } },
  upright: { dx: 0.7, dy: -0.7, labelOffset: { x: 18, y: -18 } },
  downleft: { dx: -0.7, dy: 0.7, labelOffset: { x: -18, y: 18 } },
  downright: { dx: 0.7, dy: 0.7, labelOffset: { x: 18, y: 18 } },
};

const defaultColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

// ========== Single force arrow SVG element ==========
function ForceArrow({ force, index, cx, cy }: { force: ForceVector; index: number; cx: number; cy: number }) {
  const vec = directionVectors[force.direction] || directionVectors.down;
  const arrowLen = 55;
  const x2 = cx + vec.dx * arrowLen;
  const y2 = cy + vec.dy * arrowLen;
  const color = force.color || defaultColors[index % defaultColors.length];

  const lx = cx + vec.dx * arrowLen * 0.55;
  const ly = cy + vec.dy * arrowLen * 0.55;

  return (
    <g>
      <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={color} strokeWidth="2" markerEnd={`url(#arrow-${index})`} />
      <defs>
        <marker id={`arrow-${index}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      {/* Label positioned 55% along the arrow */}
      <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="11" fontWeight="600">
        {force.name} {force.magnitude}
      </text>
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
  const hasData = objects.length > 0;

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

  // Data state: render the SVG force diagram
  return (
    <div className="rounded-xl border border-purple-200/60 bg-gradient-to-br from-purple-50/50 to-indigo-50/50 p-5">
      <h4 className="text-sm font-semibold text-purple-800 mb-4">{title}</h4>

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
                  <ForceArrow key={fi} force={force} index={objIdx * 10 + fi} cx={100} cy={100} />
                ))}
              </svg>
            </div>
            {/* Legend below the diagram */}
            <div className="flex flex-wrap gap-3 justify-center mt-3">
              {obj.forces.map((force, fi) => {
                const color = force.color || defaultColors[fi % defaultColors.length];
                return (
                  <div key={fi} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: color }} />
                    {force.name}: {force.magnitude}
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
      {error && hasData && (
        <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
