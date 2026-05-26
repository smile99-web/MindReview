'use client';

interface FormulaVariable {
  symbol: string;
  name: string;
  unit?: string;
}

interface FormulaViewData {
  formula?: string;
  steps?: string[];
  variables?: FormulaVariable[];
  notes?: string;
}

export function FormulaView({ data = {}, title }: { data: FormulaViewData; title: string }) {
  const { formula, steps, variables, notes } = data;

  return (
    <div className="rounded-xl border border-blue-200/60 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 p-5">
      <h4 className="text-sm font-semibold text-blue-800 mb-4">{title}</h4>

      {formula && (
        <div className="bg-white rounded-lg border border-blue-200/40 p-4 mb-4 text-center">
          <span className="text-lg font-mono font-bold text-slate-800 tracking-wide">{formula}</span>
        </div>
      )}

      {variables && variables.length > 0 && (
        <div className="mb-4">
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">变量说明</h5>
          <div className="bg-white rounded-lg border border-slate-200/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/60">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">符号</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">名称</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">单位</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((v, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-2 font-mono text-blue-700 font-medium">{v.symbol}</td>
                    <td className="px-3 py-2 text-slate-700">{v.name}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{v.unit || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {steps && steps.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">推导步骤</h5>
          <ol className="space-y-1.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {notes && (
        <p className="mt-4 text-xs text-slate-500 bg-amber-50/80 rounded-lg p-2.5 border border-amber-100/60">
          {notes}
        </p>
      )}
    </div>
  );
}
