'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { RELATION_LABELS, type RelationType } from '@/types';

/**
 * 合书默画骨架（Kit-Build 式图谱重组）
 * 只看知识点标题，凭记忆重建它们之间的关系，再与系统图按命题比对：
 * 漏掉的 = 知识缺口，多画的 = 潜在误解。
 */

const GYM_TABS = [
  { href: '/mindmap/find-bugs', label: '🐛 找茬' },
  { href: '/mindmap/cloze', label: '🕳️ 挖空' },
  { href: '/mindmap/rebuild', label: '🧩 默画' },
];

const BUILDABLE_TYPES = (Object.keys(RELATION_LABELS) as RelationType[]).filter(
  (t) => t !== 'schema_member',
);

interface GraphNode {
  id: string;
  chapter?: { id?: string | null; title?: string | null } | null;
  subject?: { name?: string | null } | null;
}

interface ChapterOption {
  id: string;
  title: string;
  subjectName: string;
  edgeCount: number;
}

interface TaskNode {
  id: string;
  title: string;
}

interface MyEdge {
  fromId: string;
  toId: string;
  relationType: string;
}

interface RebuildResult {
  score: number;
  maxScore: number;
  correct: Array<{ text: string; label: string }>;
  missing: Array<{ text: string; label: string }>;
  extra: string[];
  trueEdgeCount: number;
}

export default function RebuildPage() {
  const pathname = usePathname();
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [nodes, setNodes] = useState<TaskNode[]>([]);
  const [token, setToken] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [relationType, setRelationType] = useState('');
  const [myEdges, setMyEdges] = useState<MyEdge[]>([]);
  const [result, setResult] = useState<RebuildResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeChapterId, setActiveChapterId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/mindmap');
        // 不查 res.ok 会把 401/500 的 { error } 当空数据：用户无法区分
        // "真没数据"和"服务器挂了"
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { nodes?: GraphNode[]; edges?: Array<{ fromId: string; toId: string }> };
        if (cancelled) return;
        const allNodes = data.nodes ?? [];
        const edges = data.edges ?? [];
        const chapterByNodeId = new Map<string, string>();
        for (const n of allNodes) if (n.chapter?.id) chapterByNodeId.set(n.id, n.chapter.id);
        const edgeCountByChapter = new Map<string, number>();
        for (const e of edges) {
          const ca = chapterByNodeId.get(e.fromId);
          if (ca && ca === chapterByNodeId.get(e.toId)) {
            edgeCountByChapter.set(ca, (edgeCountByChapter.get(ca) ?? 0) + 1);
          }
        }
        const chapterMap = new Map<string, ChapterOption>();
        for (const n of allNodes) {
          if (!n.chapter?.id || !n.chapter.title || chapterMap.has(n.chapter.id)) continue;
          chapterMap.set(n.chapter.id, {
            id: n.chapter.id,
            title: n.chapter.title,
            subjectName: n.subject?.name ?? '',
            edgeCount: edgeCountByChapter.get(n.chapter.id) ?? 0,
          });
        }
        setChapters(
          [...chapterMap.values()]
            .filter((c) => c.edgeCount >= 3)
            .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'zh')),
        );
      } catch {
        if (!cancelled) setError('加载章节失败，请刷新重试');
      } finally {
        if (!cancelled) setLoadingChapters(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.title ?? '?';

  const startGame = async (chapterId: string) => {
    setBusy(true);
    setError('');
    setResult(null);
    setMyEdges([]);
    setFromId('');
    setToId('');
    setRelationType('');
    try {
      const res = await authFetch('/api/mindmap/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', chapterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建任务失败');
      setNodes(data.nodes);
      setToken(data.token);
      setActiveChapterId(chapterId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建任务失败');
    } finally {
      setBusy(false);
    }
  };

  const pickNode = (id: string) => {
    if (!fromId) {
      setFromId(id);
    } else if (id === fromId) {
      setFromId('');
    } else if (!toId) {
      setToId(id);
    } else {
      setFromId(id);
      setToId('');
    }
  };

  const addEdge = () => {
    if (!fromId || !toId || !relationType) return;
    const dup = myEdges.some(
      (e) =>
        (e.fromId === fromId && e.toId === toId && e.relationType === relationType) ||
        (relationType === 'compare' && e.fromId === toId && e.toId === fromId && e.relationType === 'compare'),
    );
    if (dup) return;
    setMyEdges((prev) => [...prev, { fromId, toId, relationType }]);
    setFromId('');
    setToId('');
    setRelationType('');
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await authFetch('/api/mindmap/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grade', token, edges: myEdges }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '评分失败');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '评分失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-800">🧩 合书默画骨架</h1>
        <Link href="/mindmap" className="text-sm text-indigo-600 hover:underline">
          返回思维导图 →
        </Link>
      </div>

      <div className="flex gap-2 mb-4">
        {GYM_TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`text-sm px-3 py-1.5 rounded-full border transition ${
              pathname === t.href
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-medium'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <p className="text-sm text-slate-500 mb-6">
        只看知识点标题，凭记忆画出它们之间的关系，再和系统图对照——画对的得分，漏掉的是知识缺口，多画的是潜在误解。
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {!nodes.length && (
        <div>
          {loadingChapters ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {chapters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => startGame(c.id)}
                  disabled={busy}
                  className="text-left rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition disabled:opacity-50"
                >
                  <div className="text-xs text-slate-400 mb-1">{c.subjectName}</div>
                  <div className="font-medium text-slate-800">{c.title}</div>
                  <div className="text-xs text-slate-400 mt-1">{c.edgeCount} 条关系</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {nodes.length > 0 && !result && (
        <div>
          <div className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs text-slate-400 mb-2">依次点击两个知识点（先起点后终点），再选关系类型，点「添加关系」：</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {nodes.map((n) => {
                const isFrom = n.id === fromId;
                const isTo = n.id === toId;
                return (
                  <button
                    key={n.id}
                    onClick={() => pickNode(n.id)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition ${
                      isFrom
                        ? 'border-indigo-500 bg-indigo-500 text-white'
                        : isTo
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-300 text-slate-700 hover:border-indigo-300'
                    }`}
                  >
                    {n.title}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={fromId ? 'text-indigo-700 font-medium' : 'text-slate-400'}>
                {fromId ? titleOf(fromId) : '起点？'}
              </span>
              <select
                value={relationType}
                onChange={(e) => setRelationType(e.target.value)}
                className="text-sm border border-slate-300 rounded-lg px-2 py-1 text-slate-700"
              >
                <option value="">关系…</option>
                {BUILDABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RELATION_LABELS[t]}
                  </option>
                ))}
              </select>
              <span className={toId ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                {toId ? titleOf(toId) : '终点？'}
              </span>
              <Button size="sm" onClick={addEdge} disabled={!fromId || !toId || !relationType}>
                添加关系
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {myEdges.length === 0 && (
              <p className="text-sm text-slate-400">还没画任何关系。回忆一下这些知识点谁是谁的基础、谁和谁会混、谁能推出谁……</p>
            )}
            {myEdges.map((e, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                <span className="text-slate-800">{titleOf(e.fromId)}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {RELATION_LABELS[e.relationType as RelationType] ?? e.relationType}
                </span>
                <span className="text-slate-400">→</span>
                <span className="text-slate-800">{titleOf(e.toId)}</span>
                <button
                  onClick={() => setMyEdges((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-auto text-slate-300 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-3">
            <Button onClick={submit} loading={busy} disabled={myEdges.length === 0}>
              画完了，对照答案
            </Button>
            <Button variant="secondary" onClick={() => { setNodes([]); setToken(''); setMyEdges([]); }}>
              换一章
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div>
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
            <div className="text-lg font-bold text-indigo-800">得分 {result.score} / {result.maxScore}</div>
            <div className="text-sm text-indigo-600 mt-1">
              画对一条 +2，多画一条 -1。系统图共 {result.trueEdgeCount} 条关系。
            </div>
          </div>

          {result.correct.length > 0 && (
            <div className="mb-4">
              <h3 className="font-medium text-emerald-700 mb-2">✓ 画对了（{result.correct.length}）</h3>
              <div className="space-y-1">
                {result.correct.map((c, i) => (
                  <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-sm">
                    <div className="text-slate-800">{c.text}</div>
                    {c.label && <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.missing.length > 0 && (
            <div className="mb-4">
              <h3 className="font-medium text-amber-700 mb-2">△ 漏掉了——这些是你的知识缺口（{result.missing.length}）</h3>
              <div className="space-y-1">
                {result.missing.map((m, i) => (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2 text-sm">
                    <div className="text-slate-800">{m.text}</div>
                    {m.label && <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.extra.length > 0 && (
            <div className="mb-4">
              <h3 className="font-medium text-red-700 mb-2">✗ 多画了——想想是不是真的成立（{result.extra.length}）</h3>
              <div className="space-y-1">
                {result.extra.map((x, i) => (
                  <div key={i} className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-2 text-sm text-slate-800">
                    {x}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button onClick={() => startGame(activeChapterId)} loading={busy}>再默一次</Button>
            <Button variant="secondary" onClick={() => { setNodes([]); setToken(''); setResult(null); setMyEdges([]); }}>
              换一章
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
