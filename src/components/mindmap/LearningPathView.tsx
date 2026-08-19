'use client';

// ---------------------------------------------------------------------------
// LearningPathView — 思维导图的"学习路径"视图
// 解决"知识点太零散、不知道从哪开始"：
//   1. 按年级学期分组（七上 → 九下 → 其他），每个年级有掌握度进度
//   2. 章内按教材顺序排列节点，节点间用关系（先修/因果/对比…）串联
//   3. 每个知识点标注 3D 演示入口，看不懂可直接去看互动模型
//   4. "建议从这里开始"：路径上第一个未掌握的节点高亮 + 一键进入学习
// 学习/练习跳转卡片页：/cards/[id]（?tab=practice 直接进练习，?tab=lab3d 看演示）
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/auth';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { RELATION_LABELS } from '@/types';
import type { RelationType } from '@/types';
import { matchScenes } from '@/lib/lab3d/registry';

const MASTERED_THRESHOLD = 60;

interface PathRelation {
  nodeId: string;
  title: string;
  relationType: string;
  direction: 'out' | 'in';
  label: string | null;
}

interface PathNode {
  id: string;
  title: string;
  summary: string | null;
  difficulty: number;
  masteryLevel: number;
  keywords: string[];
  readCompleted: boolean;
  practicedCompleted: boolean;
  relations: PathRelation[];
}

interface PathChapter {
  id: string | null;
  title: string;
  nodes: PathNode[];
}

interface PathGrade {
  label: string;
  icon: string;
  stats: { total: number; mastered: number; avgMastery: number };
  chapters: PathChapter[];
}

interface PathResponse {
  subject: { id: string; name: string; icon?: string | null };
  grades: PathGrade[];
  recommendedNodeId: string | null;
  recommendedGrade: string | null;
  stats: { total: number; mastered: number; avgMastery: number };
  error?: string;
}

/** 关系标签：先修/后续优先于通用关系名，这是"串联"的语义核心 */
function relationDisplay(rel: PathRelation): string {
  if (rel.relationType === 'prerequisite') {
    return rel.direction === 'in' ? `先修·${rel.title}` : `后续·${rel.title}`;
  }
  const label = RELATION_LABELS[(rel.relationType as RelationType) ?? 'prerequisite'] ?? rel.relationType;
  return `${label}·${rel.title}`;
}

/** 串联 chips 排序：先修 > 后续 > 其他 */
function relationRank(rel: PathRelation): number {
  if (rel.relationType === 'prerequisite') return rel.direction === 'in' ? 0 : 1;
  return 2;
}

function nodeStatus(n: PathNode): 'mastered' | 'learning' | 'fresh' {
  if (n.masteryLevel >= MASTERED_THRESHOLD) return 'mastered';
  if (n.masteryLevel > 0 || n.readCompleted || n.practicedCompleted) return 'learning';
  return 'fresh';
}

const STATUS_META = {
  mastered: { icon: '✅', label: '已掌握', cls: 'text-emerald-600' },
  learning: { icon: '🔵', label: '学习中', cls: 'text-indigo-600' },
  fresh: { icon: '⚪', label: '未开始', cls: 'text-slate-400' },
} as const;

function DifficultyDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`难度 ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            i <= level ? 'bg-amber-400' : 'bg-slate-200'
          }`}
        />
      ))}
    </span>
  );
}

export default function LearningPathView({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const [data, setData] = useState<PathResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGrade, setActiveGrade] = useState<string | null>(null);
  const [expandedRelations, setExpandedRelations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => setLoading(true));
    authFetch(`/api/mindmap/path?subjectId=${encodeURIComponent(subjectId)}`)
      .then(async (res) => {
        const json = (await res.json()) as PathResponse;
        if (!res.ok) throw new Error(json.error || '学习路径加载失败');
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        // 默认选中推荐起点所在年级，其次第一个有内容的年级
        const fallback = json.grades.find((g) => g.chapters.length > 0)?.label ?? null;
        setActiveGrade(json.recommendedGrade ?? fallback);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '学习路径加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  const subjectName = data?.subject.name ?? '';
  // 推荐起点定位（数据量小，直接算，不用 useMemo —— React Compiler 对
  // 带 early-return 循环的 memo 无法保持手工记忆化，lint 会报错）
  let recommendedNode: { node: PathNode; grade: string; chapter: string } | null = null;
  if (data?.recommendedNodeId) {
    for (const g of data.grades) {
      for (const c of g.chapters) {
        const hit = c.nodes.find((n) => n.id === data.recommendedNodeId);
        if (hit) {
          recommendedNode = { node: hit, grade: g.label, chapter: c.title };
          break;
        }
      }
      if (recommendedNode) break;
    }
  }

  const grade = data?.grades.find((g) => g.label === activeGrade) ?? null;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-slate-100" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-600">
        {error || '学习路径加载失败'}
      </div>
    );
  }

  if (data.grades.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
        <p className="font-semibold text-slate-700">这个学科还没有知识点</p>
        <p className="mt-1.5 text-sm text-slate-500">先去学科页面拆解教材，再回来按年级学习</p>
      </div>
    );
  }

  const overallPct = data.stats.total > 0 ? Math.round((data.stats.mastered / data.stats.total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* 总进度 + 推荐起点 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              {data.subject.icon ?? '📖'} {subjectName} · 总进度
            </p>
            <span className="text-sm font-bold text-indigo-600 tabular-nums">{overallPct}%</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700"
              style={{ width: `${Math.max(2, overallPct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400 tabular-nums">
            已掌握 {data.stats.mastered} / {data.stats.total} 个知识点 · 平均掌握度 {data.stats.avgMastery}%
          </p>
        </div>

        {recommendedNode && (
          <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 to-violet-50/90 p-5">
            <p className="text-sm font-semibold text-indigo-700">👉 建议从这里开始</p>
            <p className="mt-1 truncate text-lg font-bold text-slate-800" title={recommendedNode.node.title}>
              {recommendedNode.node.title}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {recommendedNode.grade} · {recommendedNode.chapter}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => router.push(`/cards/${recommendedNode.node.id}`)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95"
              >
                🚀 开始学习
              </button>
              <button
                type="button"
                onClick={() => router.push(`/cards/${recommendedNode.node.id}?tab=practice`)}
                className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50 active:scale-95"
              >
                ✏️ 直接练习
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 年级选择 */}
      <div className="flex flex-wrap gap-2">
        {data.grades.map((g) => {
          const pct = g.stats.total > 0 ? Math.round((g.stats.mastered / g.stats.total) * 100) : 0;
          const active = g.label === activeGrade;
          return (
            <button
              key={g.label}
              type="button"
              onClick={() => setActiveGrade(g.label)}
              className={`group rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <span className="mr-1">{g.icon}</span>
              {g.label}
              <span className={`ml-2 text-xs tabular-nums ${active ? 'text-indigo-100' : 'text-slate-400'}`}>
                {g.stats.mastered}/{g.stats.total}
              </span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-black/10">
                <span
                  className={`block h-full rounded-full ${active ? 'bg-emerald-300' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct)}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* 当前年级的章节路径 */}
      {grade && (
        <div className="space-y-4">
          {grade.chapters.map((chapter, chapterIdx) => (
            <section
              key={chapter.id ?? `none-${chapterIdx}`}
              className="rounded-2xl border border-slate-200/70 bg-white p-5"
            >
              <header className="mb-1 flex flex-wrap items-baseline gap-x-3">
                <h3 className="text-[15px] font-bold text-slate-800">{chapter.title}</h3>
                <span className="text-xs text-slate-400">{chapter.nodes.length} 个知识点</span>
                {/* 本章主线：快速预览知识串联顺序 */}
                <span className="w-full truncate text-xs text-slate-400" title={chapter.nodes.map((n) => n.title).join(' → ')}>
                  主线：{chapter.nodes.map((n) => n.title).join(' → ')}
                </span>
              </header>

              <ol className="relative mt-3 space-y-1 border-l-2 border-indigo-100 pl-4">
                {chapter.nodes.map((n) => {
                  const status = nodeStatus(n);
                  const meta = STATUS_META[status];
                  const isRecommended = n.id === data.recommendedNodeId;
                  const lab3d = matchScenes({
                    title: n.title,
                    keywords: n.keywords,
                    subjectName,
                  });
                  const sortedRelations = [...n.relations].sort((a, b) => relationRank(a) - relationRank(b));
                  const expanded = Boolean(expandedRelations[n.id]);
                  const shownRelations = expanded ? sortedRelations : sortedRelations.slice(0, 4);

                  return (
                    <li key={n.id} className="relative">
                      {/* 时间轴圆点 */}
                      <span
                        className={`absolute -left-[23px] top-4 h-3 w-3 rounded-full border-2 ${
                          status === 'mastered'
                            ? 'border-emerald-400 bg-emerald-400'
                            : status === 'learning'
                              ? 'border-indigo-400 bg-indigo-400'
                              : 'border-slate-300 bg-white'
                        }`}
                      />
                      <div
                        className={`rounded-xl border p-3.5 transition-all ${
                          isRecommended
                            ? 'border-indigo-300 bg-indigo-50/60 shadow-[0_0_0_3px_rgba(99,102,241,0.08)]'
                            : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={meta.cls} title={meta.label}>{meta.icon}</span>
                          <button
                            type="button"
                            onClick={() => router.push(`/cards/${n.id}`)}
                            className="text-left text-sm font-semibold text-slate-800 transition-colors hover:text-indigo-600"
                            title={n.summary ?? n.title}
                          >
                            {n.title}
                          </button>
                          <DifficultyDots level={n.difficulty} />
                          {isRecommended && (
                            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              建议起点
                            </span>
                          )}
                          {lab3d.length > 0 && (
                            <button
                              type="button"
                              onClick={() => router.push(`/cards/${n.id}?tab=lab3d`)}
                              className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 transition hover:bg-cyan-100"
                              title={`3D 演示：${lab3d.map((s) => s.title).join('、')}（可调参数动手玩）`}
                            >
                              🧊 3D演示
                            </button>
                          )}
                          <span className="ml-auto flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => router.push(`/cards/${n.id}`)}
                              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-indigo-100 hover:text-indigo-700"
                            >
                              {status === 'mastered' ? '复习' : status === 'learning' ? '继续学' : '学习'}
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/cards/${n.id}?tab=practice`)}
                              className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100"
                            >
                              练习
                            </button>
                          </span>
                        </div>

                        <div className="mt-2">
                          <MasteryBar level={n.masteryLevel} />
                        </div>

                        {/* 串联：与其他知识点的关系 */}
                        {sortedRelations.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">串联</span>
                            {shownRelations.map((rel, i) => (
                              <button
                                key={`${rel.nodeId}-${rel.relationType}-${i}`}
                                type="button"
                                onClick={() => router.push(`/cards/${rel.nodeId}`)}
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                                  rel.relationType === 'prerequisite'
                                    ? rel.direction === 'in'
                                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                      : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                                title={rel.label ?? relationDisplay(rel)}
                              >
                                {relationDisplay(rel)}
                              </button>
                            ))}
                            {sortedRelations.length > 4 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedRelations((prev) => ({ ...prev, [n.id]: !expanded }))
                                }
                                className="text-[11px] font-medium text-indigo-500 hover:text-indigo-600"
                              >
                                {expanded ? '收起' : `+${sortedRelations.length - 4}`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
