'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { RELATION_LABELS, type RelationType } from '@/types';

/**
 * 连接词挖空：给两个知识点，学生选关系类型 + 用自己的话写关系内容。
 * 概念图理论里"连接词"才是意义的基本单元（Novak）——挖词比挖节点有效。
 */

const GYM_TABS = [
  { href: '/mindmap/find-bugs', label: '🐛 找茬' },
  { href: '/mindmap/cloze', label: '🕳️ 挖空' },
  { href: '/mindmap/rebuild', label: '🧩 默画' },
];

const ANSWERABLE_TYPES = (Object.keys(RELATION_LABELS) as RelationType[]).filter(
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

interface ClozeItemView {
  edgeId: string;
  fromTitle: string;
  toTitle: string;
}

interface GradeDetail {
  edgeId: string;
  fromTitle: string;
  toTitle: string;
  typeCorrect: boolean;
  correctRelationLabel: string;
  correctLabel: string;
  labelOk: boolean | null;
  labelComment: string | null;
}

export default function ClozePage() {
  const pathname = usePathname();
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [items, setItems] = useState<ClozeItemView[]>([]);
  const [token, setToken] = useState('');
  const [scaffold, setScaffold] = useState<{ level: 'guided' | 'standard' | 'expert'; mastery: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, { relationType: string; labelText: string }>>({});
  const [result, setResult] = useState<{ score: number; maxScore: number; labelGraded: boolean; details: GradeDetail[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeChapterId, setActiveChapterId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/mindmap');
        const data = (await res.json()) as { nodes?: GraphNode[]; edges?: Array<{ fromId: string; toId: string }> };
        const nodes = data.nodes ?? [];
        const edges = data.edges ?? [];
        const chapterByNodeId = new Map<string, string>();
        for (const n of nodes) if (n.chapter?.id) chapterByNodeId.set(n.id, n.chapter.id);
        const edgeCountByChapter = new Map<string, number>();
        for (const e of edges) {
          const ca = chapterByNodeId.get(e.fromId);
          if (ca && ca === chapterByNodeId.get(e.toId)) {
            edgeCountByChapter.set(ca, (edgeCountByChapter.get(ca) ?? 0) + 1);
          }
        }
        const chapterMap = new Map<string, ChapterOption>();
        for (const n of nodes) {
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
        setError('加载章节失败，请刷新重试');
      } finally {
        setLoadingChapters(false);
      }
    })();
  }, []);

  const startGame = async (chapterId: string) => {
    setBusy(true);
    setError('');
    setResult(null);
    setAnswers({});
    try {
      const res = await authFetch('/api/mindmap/cloze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', chapterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建任务失败');
      setItems(data.items);
      setToken(data.token);
      setScaffold({ level: data.scaffoldLevel ?? 'standard', mastery: data.chapterMastery ?? 0 });
      setActiveChapterId(chapterId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建任务失败');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    // standard/expert 档要求必须写出关系描述（支架淡出：guided 才可选填）
    if (scaffold && scaffold.level !== 'guided') {
      const missing = items.filter((i) => !(answers[i.edgeId]?.labelText ?? '').trim());
      if (missing.length > 0) {
        setError(`还有 ${missing.length} 条没写关系描述——能写出来才算真的懂`);
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const res = await authFetch('/api/mindmap/cloze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grade',
          token,
          answers: items.map((i) => ({
            edgeId: i.edgeId,
            relationType: answers[i.edgeId]?.relationType ?? '',
            labelText: answers[i.edgeId]?.labelText ?? '',
          })),
        }),
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

  const detailByEdgeId = new Map((result?.details ?? []).map((d) => [d.edgeId, d]));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-800">🕳️ 连接词挖空</h1>
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
        两个知识点之间是什么关系？先选关系类型，再用自己的话写出关系内容——能写出来，才算真的懂。
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {!items.length && (
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

      {items.length > 0 && (
        <div>
          {scaffold && !result && (
            <div className={`mb-4 rounded-xl border px-4 py-2 text-sm ${
              scaffold.level === 'expert'
                ? 'border-purple-200 bg-purple-50 text-purple-800'
                : scaffold.level === 'standard'
                  ? 'border-sky-200 bg-sky-50 text-sky-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}>
              {scaffold.level === 'expert' ? (
                <>
                  这章你平均掌握 {scaffold.mastery}%，已经是高手——描述全写完后，建议去
                  <Link href="/mindmap/rebuild" className="font-medium underline mx-1">🧩 默画</Link>
                  挑战零支架：不看关系，整章自己画出来。
                </>
              ) : scaffold.level === 'standard' ? (
                <>这章你平均掌握 {scaffold.mastery}%——每条都要写出关系描述才能提交。</>
              ) : (
                <>这章还在打基础（平均掌握 {scaffold.mastery}%）——描述写不出可以空着，先看参考描述。</>
              )}
            </div>
          )}
          {result && (
            <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <div className="text-lg font-bold text-indigo-800">得分 {result.score} / {result.maxScore}</div>
              <div className="text-sm text-indigo-600 mt-1">
                关系类型选对 +2；写出关系内容且被 AI 认可再 +1{!result.labelGraded && '（本次 AI 评判不可用，描述分未计）'}。
              </div>
            </div>
          )}

          <div className="space-y-3">
            {items.map((item) => {
              const answer = answers[item.edgeId] ?? { relationType: '', labelText: '' };
              const detail = result ? detailByEdgeId.get(item.edgeId) : undefined;
              return (
                <div
                  key={item.edgeId}
                  className={`rounded-2xl border px-4 py-3 ${
                    result
                      ? detail?.typeCorrect
                        ? 'border-emerald-300 bg-emerald-50/60'
                        : 'border-red-300 bg-red-50/60'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-slate-800">
                    <span className="font-medium">{item.fromTitle}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">？</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium">{item.toTitle}</span>
                  </div>

                  {!result ? (
                    <div className="mt-2 space-y-2">
                      <select
                        value={answer.relationType}
                        onChange={(e) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [item.edgeId]: { ...answer, relationType: e.target.value },
                          }))
                        }
                        className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700"
                      >
                        <option value="">选择关系类型…</option>
                        {ANSWERABLE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {RELATION_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={answer.labelText}
                        onChange={(e) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [item.edgeId]: { ...answer, labelText: e.target.value },
                          }))
                        }
                        placeholder={
                          scaffold?.level === 'guided'
                            ? '（选填）用自己的话：它们之间是什么关系？'
                            : '用自己的话写出它们的关系（必填）'
                        }
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-700"
                        maxLength={100}
                      />
                    </div>
                  ) : (
                    detail && (
                      <div className="mt-2 text-sm space-y-1">
                        <div className={detail.typeCorrect ? 'text-emerald-700' : 'text-red-700'}>
                          {detail.typeCorrect ? '✓ 类型选对' : `✗ 类型不对，正确的是「${detail.correctRelationLabel}」`}
                        </div>
                        {detail.correctLabel && (
                          <div className="text-slate-500">参考描述：{detail.correctLabel}</div>
                        )}
                        {detail.labelComment && (
                          <div className={detail.labelOk ? 'text-emerald-600' : 'text-amber-600'}>
                            AI 点评你的描述：{detail.labelComment}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            {!result ? (
              <>
                <Button onClick={submit} loading={busy}>提交</Button>
                <Button variant="secondary" onClick={() => { setItems([]); setToken(''); setAnswers({}); }}>
                  换一章
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => startGame(activeChapterId)} loading={busy}>再来一组</Button>
                <Button variant="secondary" onClick={() => { setItems([]); setToken(''); setResult(null); setAnswers({}); }}>
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
