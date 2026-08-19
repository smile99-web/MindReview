'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { RELATION_LABELS, RELATION_COLORS, type RelationType } from '@/types';

const GYM_TABS = [
  { href: '/mindmap/find-bugs', label: '🐛 找茬' },
  { href: '/mindmap/cloze', label: '🕳️ 挖空' },
  { href: '/mindmap/rebuild', label: '🧩 默画' },
];

/**
 * 知识图谱找茬（纠错式概念图任务）
 * 学习科学：纠错式概念图 > 挖空 > 纯看图（Chang, Sung & Chen 2002）。
 * 系统把章节关系网注入错误（错类型/反方向/多余边），学生逐条裁决。
 */

interface GraphNode {
  id: string;
  title: string;
  chapter?: { id?: string | null; title?: string | null } | null;
  subject?: { id?: string; name?: string | null } | null;
}

interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
  relationType: string;
}

interface ChapterOption {
  id: string;
  title: string;
  subjectName: string;
  edgeCount: number;
}

interface TaskData {
  nodes: Array<{ id: string; title: string }>;
  edges: GraphEdge[];
  bugCount: number;
  edgeCount: number;
  token: string;
}

type Verdict = 'ok' | 'wrongType' | 'flipped' | 'spurious';

interface Answer {
  verdict: Verdict;
  correctedRelationType: string;
}

interface GradeDetail {
  edgeId: string;
  kind: 'wrongType' | 'flipped' | 'spurious';
  found: boolean;
  exact: boolean;
  explanation: string;
}

interface GradeResult {
  score: number;
  maxScore: number;
  falsePositives: number;
  foundAll: boolean;
  details: GradeDetail[];
}

const VERDICT_OPTIONS: Array<{ value: Verdict; label: string }> = [
  { value: 'ok', label: '✅ 没问题' },
  { value: 'wrongType', label: '🏷️ 关系类型错了' },
  { value: 'flipped', label: '🔀 方向反了' },
  { value: 'spurious', label: '🗑️ 这条边不该存在' },
];

// 学生纠错时可选的关系类型（schema_member 是系统内部边，不出现）
const CORRECTABLE_TYPES = (Object.keys(RELATION_LABELS) as RelationType[]).filter(
  (t) => t !== 'schema_member',
);

export default function FindBugsPage() {
  const pathname = usePathname();
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [task, setTask] = useState<TaskData | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeChapterId, setActiveChapterId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/mindmap');
        // 不查 res.ok 会把 401/500 的 { error } 当空数据展示
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { nodes?: GraphNode[]; edges?: GraphEdge[] };
        if (cancelled) return;
        const nodes = data.nodes ?? [];
        const edges = data.edges ?? [];
        const chapterByNodeId = new Map<string, string>();
        for (const n of nodes) {
          if (n.chapter?.id) chapterByNodeId.set(n.id, n.chapter.id);
        }
        // 只统计两端都在同一章内的边（游戏只用章内子图）
        const edgeCountByChapter = new Map<string, number>();
        for (const e of edges) {
          const ca = chapterByNodeId.get(e.fromId);
          const cb = chapterByNodeId.get(e.toId);
          if (ca && ca === cb) {
            edgeCountByChapter.set(ca, (edgeCountByChapter.get(ca) ?? 0) + 1);
          }
        }
        const chapterMap = new Map<string, ChapterOption>();
        for (const n of nodes) {
          if (!n.chapter?.id || !n.chapter.title) continue;
          if (!chapterMap.has(n.chapter.id)) {
            chapterMap.set(n.chapter.id, {
              id: n.chapter.id,
              title: n.chapter.title,
              subjectName: n.subject?.name ?? '',
              edgeCount: edgeCountByChapter.get(n.chapter.id) ?? 0,
            });
          }
        }
        const playable = [...chapterMap.values()]
          .filter((c) => (edgeCountByChapter.get(c.id) ?? 0) >= 5)
          .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'zh'));
        setChapters(playable);
      } catch {
        if (!cancelled) setError('加载章节失败，请刷新重试');
      } finally {
        if (!cancelled) setLoadingChapters(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of task?.nodes ?? []) map.set(n.id, n.title);
    return map;
  }, [task]);

  const startGame = async (chapterId: string) => {
    setBusy(true);
    setError('');
    setResult(null);
    setAnswers({});
    try {
      const res = await authFetch('/api/mindmap/find-bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', chapterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建任务失败');
      setTask(data as TaskData);
      setActiveChapterId(chapterId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建任务失败');
    } finally {
      setBusy(false);
    }
  };

  const setVerdict = (edgeId: string, verdict: Verdict) => {
    setAnswers((prev) => ({
      ...prev,
      [edgeId]: { verdict, correctedRelationType: prev[edgeId]?.correctedRelationType ?? '' },
    }));
  };

  const setCorrection = (edgeId: string, relationType: string) => {
    setAnswers((prev) => ({
      ...prev,
      [edgeId]: { verdict: 'wrongType', correctedRelationType: relationType },
    }));
  };

  const submit = async () => {
    if (!task) return;
    setBusy(true);
    setError('');
    try {
      const res = await authFetch('/api/mindmap/find-bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grade',
          token: task.token,
          answers: task.edges.map((e) => ({
            edgeId: e.id,
            verdict: answers[e.id]?.verdict ?? 'ok',
            correctedRelationType: answers[e.id]?.correctedRelationType ?? '',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '评分失败');
      setResult(data as GradeResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : '评分失败');
    } finally {
      setBusy(false);
    }
  };

  const detailByEdgeId = useMemo(() => {
    const map = new Map<string, GradeDetail>();
    for (const d of result?.details ?? []) map.set(d.edgeId, d);
    return map;
  }, [result]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-800">🐛 知识图谱找茬</h1>
        <Link href="/mindmap" className="text-sm text-indigo-600 hover:underline">
          返回思维导图 →
        </Link>
      </div>

      {/* 训练场标签 */}
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
        下面的关系网里混进了错误——有的关系类型不对、有的方向反了、有的边根本不该存在。
        把它们揪出来，比单纯看图记得牢得多。
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 选章节 */}
      {!task && (
        <div>
          {loadingChapters ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : chapters.length === 0 ? (
            <p className="text-slate-500 text-sm">还没有关系数足够的章节（至少5条），先去补充知识点。</p>
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

      {/* 游戏中 / 已评分 */}
      {task && (
        <div>
          {!result ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              共 {task.edgeCount} 条关系，其中混入了 <b>{task.bugCount}</b> 条错误。逐条判断，全部判完后提交。
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <div className="text-lg font-bold text-indigo-800">
                得分 {result.score} / {result.maxScore}
                {result.foundAll && result.falsePositives === 0 && ' 🎉 全部揪出，零误判！'}
              </div>
              <div className="text-sm text-indigo-600 mt-1">
                找出错误 +1 分，说对错在哪再 +1 分；误判一条正确关系 -1 分（本次误判 {result.falsePositives} 条）。
              </div>
            </div>
          )}

          <div className="space-y-3">
            {task.edges.map((edge) => {
              const answer = answers[edge.id] ?? { verdict: 'ok' as Verdict, correctedRelationType: '' };
              const detail = result ? detailByEdgeId.get(edge.id) : undefined;
              const isFalsePositive =
                result && !detail && answer.verdict !== 'ok';
              const color = RELATION_COLORS[edge.relationType as RelationType] ?? '#64748b';

              let cardClass = 'border-slate-200 bg-white';
              if (result) {
                if (detail?.exact) cardClass = 'border-emerald-300 bg-emerald-50/60';
                else if (detail?.found) cardClass = 'border-amber-300 bg-amber-50/60';
                else if (detail) cardClass = 'border-red-300 bg-red-50/60';
                else if (isFalsePositive) cardClass = 'border-red-200 bg-red-50/40';
              }

              return (
                <div key={edge.id} className={`rounded-2xl border px-4 py-3 ${cardClass}`}>
                  <div className="flex flex-wrap items-center gap-2 text-slate-800">
                    <span className="font-medium">{titleById.get(edge.fromId) ?? '?'}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: color }}
                    >
                      {RELATION_LABELS[edge.relationType as RelationType] ?? edge.relationType}
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium">{titleById.get(edge.toId) ?? '?'}</span>
                  </div>

                  {!result ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {VERDICT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setVerdict(edge.id, opt.value)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition ${
                            answer.verdict === opt.value
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-medium'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {answer.verdict === 'wrongType' && (
                        <select
                          value={answer.correctedRelationType}
                          onChange={(e) => setCorrection(edge.id, e.target.value)}
                          className="text-xs border border-slate-300 rounded-lg px-2 py-1 text-slate-700"
                        >
                          <option value="">正确的关系是…</option>
                          {CORRECTABLE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {RELATION_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm">
                      {detail ? (
                        <div className={detail.exact ? 'text-emerald-700' : detail.found ? 'text-amber-700' : 'text-red-700'}>
                          {detail.exact ? '✓ 精准纠错' : detail.found ? '△ 发现了，但错因判断不对' : '✗ 漏掉了这条错误'}
                          {' —— '}
                          {detail.explanation}
                        </div>
                      ) : isFalsePositive ? (
                        <div className="text-red-600">✗ 误判：这条关系其实是正确的</div>
                      ) : (
                        <div className="text-slate-400">这条关系是正确的</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            {!result ? (
              <>
                <Button onClick={submit} loading={busy}>
                  提交裁决
                </Button>
                <Button variant="secondary" onClick={() => { setTask(null); setAnswers({}); }}>
                  换一章
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => startGame(activeChapterId)} loading={busy}>
                  再来一局
                </Button>
                <Button variant="secondary" onClick={() => { setTask(null); setResult(null); setAnswers({}); }}>
                  换一章
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
