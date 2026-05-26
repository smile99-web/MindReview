'use client';

interface ForceVector {
  name: string;
  direction: 'up' | 'down' | 'left' | 'right' | 'upleft' | 'upright' | 'downleft' | 'downright';
  magnitude: string;
  color?: string;
}

interface ForceObject {
  name: string;
  forces: ForceVector[];
}

interface ForceDiagramData {
  objects?: ForceObject[];
}

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
      <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="11" fontWeight="600">
        {force.name} {force.magnitude}
      </text>
    </g>
  );
}

export function ForceDiagram({ data = {}, title }: { data: ForceDiagramData; title: string }) {
  const objects = data.objects || [];

  if (objects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-sm text-slate-400">暂无受力分析数据</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-purple-200/60 bg-gradient-to-br from-purple-50/50 to-indigo-50/50 p-5">
      <h4 className="text-sm font-semibold text-purple-800 mb-4">{title}</h4>
      <div className="space-y-6">
        {objects.map((obj, objIdx) => (
          <div key={objIdx} className="bg-white rounded-lg border border-slate-200/60 p-4">
            <h5 className="text-sm font-medium text-slate-700 mb-3 text-center">{obj.name}</h5>
            <div className="flex justify-center">
              <svg width="200" height="200" viewBox="0 0 200 200">
                {/* Object (box) */}
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
            {/* Legend */}
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
    </div>
  );
}
