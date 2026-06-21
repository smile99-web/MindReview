'use client';

import { authFetch } from '@/lib/auth';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LatexText } from '@/components/ui/LatexText';

const SUBJECT_FILTERS = [
  { id: '', label: '全部', icon: '📚' },
  { id: '数学', label: '数学', icon: '📐' },
  { id: '物理', label: '物理', icon: '⚛️' },
  { id: '化学', label: '化学', icon: '🧪' },
  { id: '历史', label: '历史', icon: '📜' },
  { id: '道法', label: '道法', icon: '⚖️' },
] as const;

interface SchemaMember {
  id: string;
  title: string;
  masteryLevel: number;
}

interface SchemaItem {
  id: string;
  name: string;
  description: string | null;
  subjectId: string;
  subjectName: string | null;
  difficulty: number;
  cognitiveLoad: number;
  icapLevel: string;
  masteryLevel: number;
  memberCount: number;
  avgMemberMastery: number;
  members: SchemaMember[];
  createdAt: string;
}

interface KnowledgeNodeOption {
  id: string;
  title: string;
  summary?: string | null;
  masteryLevel: number;
  representationType?: string | null;
  subject?: {
    name?: string | null;
  } | null;
  chapter?: {
    title?: string | null;
  } | null;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  } catch {
    return dateStr;
  }
}

export default function SchemasPage() {
  const router = useRouter();
  const [schemas, setSchemas] = useState<SchemaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNodeOption[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [schemaName, setSchemaName] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  // AI-recommended schema candidate groups. Populated by handleSuggestSchemas
  // (calls /api/schema/suggest which wraps the previously-orphaned
  // suggestSchemaNodes in lib/schema-builder.ts).
  const [suggestions, setSuggestions] = useState<
    Array<{ nodeIds: string[]; rationale: string }>
  >([]);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [schemasRes, nodesRes] = await Promise.all([
          authFetch('/api/schema/list'),
          authFetch('/api/knowledge?limit=200'),
        ]);
        const schemasData = await schemasRes.json();
        const nodesData = await nodesRes.json();
        setSchemas(schemasData.schemas || []);
        setKnowledgeNodes(
          ((nodesData.nodes || []) as KnowledgeNodeOption[])
            .filter((node) => node.representationType !== 'schema'),
        );
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Subject filter
  const subjectFiltered = useMemo(() => {
    if (!subjectFilter) return schemas;
    return schemas.filter((s) => s.subjectName === subjectFilter);
  }, [schemas, subjectFilter]);

  // Search filter
  const filteredSchemas = useMemo(() => {
    if (!searchQuery.trim()) return subjectFiltered;
    const q = searchQuery.trim().toLowerCase();
    return subjectFiltered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q),
    );
  }, [subjectFiltered, searchQuery]);

  // Count per subject
  const subjectCounts = useMemo(() => {
    const counts: Record<string, number> = { '': schemas.length };
    for (const f of SUBJECT_FILTERS) {
      if (!f.id) continue;
      counts[f.id] = schemas.filter((s) => s.subjectName === f.id).length;
    }
    return counts;
  }, [schemas]);

  const builderNodes = useMemo(() => {
    if (!subjectFilter) return knowledgeNodes;
    return knowledgeNodes.filter((node) => node.subject?.name === subjectFilter);
  }, [knowledgeNodes, subjectFilter]);

  const selectedNodes = useMemo(
    () => knowledgeNodes.filter((node) => selectedNodeIds.has(node.id)),
    [knowledgeNodes, selectedNodeIds],
  );

  const toggleNodeSelection = (nodeId: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const reloadSchemas = async () => {
    const res = await authFetch('/api/schema/list');
    const data = await res.json();
    setSchemas(data.schemas || []);
  };

  const handleBuildSchema = async () => {
    if (selectedNodeIds.size < 2) {
      setBuildError('请至少选择 2 个知识点再构建图式。');
      return;
    }

    setBuilding(true);
    setBuildError(null);
    try {
      const res = await authFetch('/api/schema/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeIds: Array.from(selectedNodeIds),
          name: schemaName.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `构建失败 (${res.status})`);
      }
      setSelectedNodeIds(new Set());
      setSchemaName('');
      await reloadSchemas();
    } catch (error: unknown) {
      setBuildError(error instanceof Error ? error.message : '图式构建失败，请稍后重试。');
    } finally {
      setBuilding(false);
    }
  };

  // Ask the AI to propose a few schema candidate groups. We pass a
  // random seed from the currently-filtered knowledge nodes; the
  // backend's suggestSchemaNodes (lib/schema-builder.ts) walks the
  // knowledge graph neighbours and returns groups. The user can then
  // apply one with '用此组合', which seeds the existing selection.
  const handleSuggestSchemas = async () => {
    if (knowledgeNodes.length === 0) return;
    setSuggesting(true);
    setBuildError(null);
    try {
      // Pick a random subset (3 nodes) as seeds so the LLM has multiple
      // anchors to build a coherent schema from.
      const seedIds: string[] = [];
      const pool = [...builderNodes];
      for (let i = 0; i < 3 && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        seedIds.push(pool[idx].id);
        pool.splice(idx, 1);
      }
      // suggestSchemaNodes is called per seed and we union the results
      // so the user sees a few candidate groups to pick from.
      const allSuggestions: Array<{ nodeIds: string[]; rationale: string }> = [];
      for (const seedId of seedIds) {
        const res = await authFetch('/api/schema/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seedNodeId: seedId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          suggestions?: Array<{ nodeIds: string[]; rationale: string }>;
          error?: string;
        };
        if (!res.ok) continue;
        for (const s of data.suggestions || []) {
          // Deduplicate by nodeIds set
          const key = [...s.nodeIds].sort().join(',');
          if (!allSuggestions.find(x => [...x.nodeIds].sort().join(',') === key)) {
            allSuggestions.push(s);
          }
        }
      }
      setSuggestions(allSuggestions.slice(0, 5));
      if (allSuggestions.length === 0) {
        setBuildError('当前知识点网络较稀疏，未找到可推荐的图式。');
      }
    } catch (error: unknown) {
      setBuildError(error instanceof Error ? error.message : '推荐失败，请稍后重试。');
    } finally {
      setSuggesting(false);
    }
  };

  const builderPanel = (
    <Card className="mb-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">构建知识图式</h2>
            <p className="text-sm text-slate-500 mt-1">
              选择 2 个以上相关知识点，AI 会把它们组织成一个可迁移的知识框架。
            </p>
          </div>
          <div className="flex gap-2">
            {/* AI 推荐入口：让用户从一个种子节点出发，让 suggestSchemaNodes
                自动从邻居节点中找出一组可构成图式的候选。Wires up the
                previously-orphaned function in src/lib/schema-builder.ts
                so the 'AI identifies the schema' promise is no longer
                bypassed. */}
            <button
              onClick={() => void handleSuggestSchemas()}
              disabled={knowledgeNodes.length === 0 || suggesting}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                knowledgeNodes.length > 0 && !suggesting
                  ? 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                  : 'bg-slate-100 text-slate-400 border border-transparent cursor-not-allowed'
              }`}
            >
              {suggesting ? '推荐中...' : '✨ AI 推荐'}
            </button>
            <button
              onClick={handleBuildSchema}
              disabled={selectedNodeIds.size < 2 || building}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                selectedNodeIds.size >= 2 && !building
                  ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {building ? '正在构建...' : `构建图式 (${selectedNodeIds.size})`}
            </button>
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-indigo-700">
                AI 推荐图式（点击种子节点 + 一组候选）
              </h4>
              <button
                onClick={() => setSuggestions([])}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                收起
              </button>
            </div>
            <ul className="space-y-2">
              {suggestions.map((s, i) => (
                <li key={i} className="p-3 bg-white rounded-lg border border-indigo-100">
                  <p className="text-xs text-slate-700 mb-2">{s.rationale}</p>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {s.nodeIds.map((nid) => {
                      const node = knowledgeNodes.find(k => k.id === nid);
                      return (
                        <span
                          key={nid}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"
                        >
                          {node?.title || nid.slice(0, 8)}
                        </span>
                      );
                    })}
                    <button
                      onClick={() => {
                        // Replace the user's current selection with the
                        // AI-recommended group. The 'AI identifies schema'
                        // promise is now actually delivered to the user.
                        setSelectedNodeIds(new Set(s.nodeIds));
                      }}
                      className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      用此组合
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-slate-500 mt-2">
              推荐基于种子节点在知识图谱中的邻居自动找出相关节点组。点击「用此组合」可一键填入选区，然后构建图式。
            </p>
          </div>
        )}

        <input
          value={schemaName}
          onChange={(event) => setSchemaName(event.target.value)}
          placeholder="图式名称，可留空由 AI 命名"
          className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300"
        />

        {selectedNodes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedNodes.map((node) => (
              <button
                key={node.id}
                onClick={() => toggleNodeSelection(node.id)}
                className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
              >
                {node.title} ×
              </button>
            ))}
          </div>
        )}

        {buildError && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {buildError}
          </div>
        )}

        {builderNodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            当前筛选下还没有可用于构建图式的知识点。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {builderNodes.slice(0, 24).map((node) => {
              const selected = selectedNodeIds.has(node.id);
              return (
                <button
                  key={node.id}
                  onClick={() => toggleNodeSelection(node.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    selected
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{node.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {node.subject?.name || '未分学科'}
                        {node.chapter?.title ? ` · ${node.chapter.title}` : ''}
                      </p>
                    </div>
                    <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      selected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selected ? '已选' : '选择'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header skeleton */}
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-2" />
        <div className="h-5 w-72 bg-slate-100 rounded animate-pulse mb-8" />

        {/* Filter tabs skeleton */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 w-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>

        {/* Search skeleton */}
        <div className="h-10 w-full max-w-md bg-slate-100 rounded-xl animate-pulse mb-6" />

        {/* Card grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Empty state ───
  if (schemas.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mb-1">
          知识图式库
        </h1>
        <p className="text-slate-500 text-[15px] mb-8">
          浏览和管理你的知识图式，将多个知识点组织成结构化的知识框架
        </p>
        {builderPanel}
        <Card>
          <EmptyState
            icon="🧠"
            title="还没有构建图式"
            description="在上方选择 2 个以上相关知识点，就可以创建第一个图式"
            action={{
              label: '前往知识卡片',
              href: '/subjects',
            }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mb-1.5">
          知识图式库
        </h1>
        <p className="text-slate-500 text-[15px]">
          浏览和管理你的知识图式，将多个知识点组织成结构化的知识框架
        </p>
      </div>

      {/* Subject filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {SUBJECT_FILTERS.map((f) => {
          const count = subjectCounts[f.id];
          const isActive = subjectFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setSubjectFilter(f.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white text-indigo-600 shadow-sm border border-indigo-200/60'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/60 border border-transparent'
              }`}
            >
              {f.icon} {f.label}{' '}
              <span className={`text-xs ml-0.5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {builderPanel}

      {/* Search input */}
      <div className="relative max-w-md mb-6">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索图式名称或描述..."
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filtered empty state */}
      {filteredSchemas.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔍"
            title="未找到匹配的图式"
            description={searchQuery ? `没有名称为"${searchQuery}"的图式，试试其他关键词` : '当前学科分类下暂无图式'}
            action={
              searchQuery
                ? { label: '清除搜索', onClick: () => setSearchQuery('') }
                : { label: '查看全部', onClick: () => setSubjectFilter('') }
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSchemas.map((schema) => {
            const isExpanded = expandedId === schema.id;

            return (
              <Card
                key={schema.id}
                hover={!isExpanded}
                className={isExpanded ? 'ring-2 ring-indigo-200' : ''}
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🧠</span>
                      <h3 className="font-semibold text-slate-800 text-[15px] truncate">
                        {schema.name}
                      </h3>
                    </div>
                    {schema.subjectName && (
                      <Badge variant="info" size="sm">
                        {schema.subjectName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <Badge variant="purple" size="sm">
                      覆盖 {schema.memberCount} 个知识点
                    </Badge>
                  </div>
                </div>

                {/* Description — 2-line clamp */}
                {schema.description && (
                  <div className="text-sm text-slate-500 line-clamp-2 mb-3 leading-relaxed">
                    <LatexText text={schema.description} />
                  </div>
                )}

                {/* Meta info */}
                <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
                  <span>创建于 {formatDate(schema.createdAt)}</span>
                  <span>
                    平均掌握度: {schema.avgMemberMastery}%
                  </span>
                </div>

                <div className="mb-3">
                  <MasteryBar level={schema.avgMemberMastery} showLabel={false} />
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : schema.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isExpanded
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isExpanded ? '收起详情' : '查看详情'}
                  </button>
                  <button
                    onClick={() =>
                      // Wire up the previously-orphaned SchemaApplyExercise
                      // (560-line AI problem-generator + per-step grader).
                      // Previously this button pushed to /practice?schemaId=
                      // which loaded the generic practice flow; the
                      // schema-transfer flow existed in code but was
                      // unreachable. /schemas/[id]/apply hosts the
                      // dedicated transfer-exercise UI.
                      router.push(`/schemas/${schema.id}/apply`)
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors shadow-sm"
                  >
                    应用到练习
                  </button>
                </div>

                {/* Expanded member list — mini mind-map / list */}
                {isExpanded && schema.members.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                      图式结构 (共 {schema.members.length} 个知识点)
                    </p>
                    {/* Mini mind-map style: tree-like indented list */}
                    <div className="relative pl-4 border-l-2 border-indigo-200 space-y-2">
                      {schema.members.map((member, idx) => (
                        <Link
                          key={member.id}
                          href={`/cards/${member.id}`}
                          className="relative flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                        >
                          {/* Connector dot */}
                          <div className="absolute -left-[1.35rem] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white bg-indigo-400 shadow-sm" />
                          {/* Number badge */}
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-50 text-indigo-500 text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-sm text-slate-700 font-medium truncate flex-1 min-w-0 group-hover:text-indigo-600 transition-colors">
                            {member.title}
                          </span>
                          <div className="w-16 shrink-0">
                            <MasteryBar level={member.masteryLevel} showLabel={false} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expanded but no members */}
                {isExpanded && schema.members.length === 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-400 text-center py-3">
                      该图式暂无关联知识点
                    </p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
