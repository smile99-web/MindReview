'use client';

interface ReactionViewData {
  reactants?: string[];
  products?: string[];
  conditions?: string;
  equation?: string;
  type?: string; // synthesis/decomposition/displacement/double_displacement/redox/other
  notes?: string;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  synthesis: { label: '化合反应', color: 'bg-blue-100 text-blue-700' },
  decomposition: { label: '分解反应', color: 'bg-red-100 text-red-700' },
  displacement: { label: '置换反应', color: 'bg-amber-100 text-amber-700' },
  double_displacement: { label: '复分解反应', color: 'bg-purple-100 text-purple-700' },
  redox: { label: '氧化还原', color: 'bg-orange-100 text-orange-700' },
  other: { label: '其他', color: 'bg-slate-100 text-slate-700' },
};

export function ReactionView({ data = {}, title }: { data: ReactionViewData; title: string }) {
  const { reactants, products, conditions, equation, type = 'other', notes } = data;
  const typeInfo = typeLabels[type] || typeLabels.other;

  return (
    <div className="rounded-xl border border-green-200/60 bg-gradient-to-br from-green-50/50 to-emerald-50/50 p-5">
      <h4 className="text-sm font-semibold text-green-800 mb-4">{title}</h4>

      {type && (
        <div className="mb-4">
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        </div>
      )}

      {equation && (
        <div className="bg-white rounded-lg border border-green-200/40 p-4 mb-4 text-center">
          <span className="text-base font-mono font-bold text-slate-800">{equation}</span>
          {conditions && (
            <p className="text-xs text-slate-500 mt-2">条件: {conditions}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {reactants && reactants.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200/60 p-3">
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">反应物</h5>
            <div className="space-y-1">
              {reactants.map((r, i) => (
                <span key={i} className="inline-block px-2 py-0.5 bg-red-50 text-red-700 text-sm rounded mr-1 mb-1 font-medium">
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {products && products.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200/60 p-3">
            <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">生成物</h5>
            <div className="space-y-1">
              {products.map((p, i) => (
                <span key={i} className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-sm rounded mr-1 mb-1 font-medium">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {notes && (
        <p className="mt-4 text-xs text-slate-500 bg-amber-50/80 rounded-lg p-2.5 border border-amber-100/60">
          {notes}
        </p>
      )}
    </div>
  );
}
