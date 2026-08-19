'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { SchemaApplyExercise } from '@/components/knowledge/SchemaApplyExercise';
import { Button } from '@/components/ui/Button';

interface SchemaData {
  id: string;
  name: string;
  description: string | null;
  // schemaType/keyInsights/applicationScope/typicalExample/transferHints
  // 实际嵌在 /api/schema/list 响应的 representationData 下（unknown，需收窄）
  representationData?: unknown;
  members: Array<{ id: string; title: string; subject?: { name: string } }>;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SchemaApplyPage({ params }: PageProps) {
  // Next.js 16: params is a Promise that must be unwrapped with `use()`.
  // (This matches the AGENTS.md note about this being a new Next.js
  // where several APIs differ from training data.)
  const { id } = use(params);
  const router = useRouter();
  const [schema, setSchema] = useState<SchemaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authFetch(`/api/schema/list`);
        const data = (await res.json()) as { schemas: SchemaData[] };
        if (!res.ok) {
          throw new Error(getErrorMessage((data as { error?: string }).error || '加载失败'));
        }
        const found = (data.schemas || []).find(s => s.id === id);
        if (!cancelled) {
          if (!found) {
            setError('未找到该图式');
          } else {
            setSchema(found);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">加载中…</p>
      </div>
    );
  }

  if (error || !schema) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-rose-600">{error || '未找到该图式'}</p>
        <Link href="/schemas">
          <Button variant="ghost">返回图式库</Button>
        </Link>
      </div>
    );
  }

  // 五个图式字段嵌在 representationData 下；收窄为 Record 后逐字段取 string
  const rep: Record<string, unknown> =
    schema.representationData && typeof schema.representationData === 'object'
      ? (schema.representationData as Record<string, unknown>)
      : {};
  const asString = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const schemaData = {
    schemaType: asString(rep.schemaType),
    keyInsights: Array.isArray(rep.keyInsights)
      ? (rep.keyInsights as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
    applicationScope: asString(rep.applicationScope),
    typicalExample: asString(rep.typicalExample),
    transferHints: asString(rep.transferHints),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              type="button"
              onClick={() => router.push('/schemas')}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors mb-1"
            >
              ← 返回图式库
            </button>
            <h1 className="text-2xl font-bold text-slate-800">
              {schema.name}
            </h1>
            {schema.description && (
              <p className="text-sm text-slate-500 mt-1">{schema.description}</p>
            )}
          </div>
        </div>

        <SchemaApplyExercise
          schemaId={schema.id}
          schemaName={schema.name}
          schemaDescription={schema.description}
          schemaData={schemaData}
          memberCount={schema.members?.length}
          onComplete={(score) => {
            // 成绩落库（此前只 console.log，练习数据全部丢失）。
            // fire-and-forget：记录失败不打断学生流程。
            void authFetch('/api/schema/apply-result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ schemaId: schema.id, score }),
            }).catch(() => {});
          }}
          onClose={() => router.push('/schemas')}
        />

        <TransferOpportunitiesPanel schemaId={schema.id} />
      </div>
    </div>
  );
}

interface TransferOpportunity {
  domain: string;
  relevance: number;
  explanation: string;
  exampleApplication: string;
}

/**
 * Cross-domain transfer panel — calls the previously-orphaned
 * detectTransferOpportunities via /api/schema/transfer and renders
 * the result. Wires up the function that was already implemented
 * but had no route and no caller.
 */
function TransferOpportunitiesPanel({ schemaId }: { schemaId: string }) {
  const [opps, setOpps] = useState<TransferOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/schema/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaNodeId: schemaId }),
      });
      const data = (await res.json()) as {
        opportunities?: TransferOpportunity[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || '加载失败');
      }
      setOpps(data.opportunities || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          if (opps.length === 0 && !loading) void load();
        }}
        className="mt-6 w-full p-4 rounded-xl border border-dashed border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
      >
        🌐 查看跨学科迁移建议（其他学科中的应用）
      </button>
    );
  }

  return (
    <div className="mt-6 p-5 bg-white border border-slate-200 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">
          🌐 跨学科迁移建议
        </h3>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          收起
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">分析中…</p>
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : opps.length === 0 ? (
        <p className="text-sm text-slate-500">暂无迁移建议</p>
      ) : (
        <ul className="space-y-3">
          {opps.map((o, i) => (
            <li key={i} className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-indigo-700">
                  {o.domain}
                </span>
                <span className="text-xs text-slate-500">
                  相关度 {Math.round(o.relevance * 100)}%
                </span>
              </div>
              <p className="text-xs text-slate-700">{o.explanation}</p>
              {o.exampleApplication && (
                <p className="text-xs text-slate-500 mt-1">
                  例：{o.exampleApplication}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
