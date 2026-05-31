'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { EmptyState } from '@/components/ui/EmptyState';

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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/schema/list');
        const data = await res.json();
        setSchemas(data.schemas || []);
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
        <Card>
          <EmptyState
            icon="🧠"
            title="还没有构建图式"
            description="去知识卡片页构建第一个图式"
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
                  <p className="text-sm text-slate-500 line-clamp-2 mb-3 leading-relaxed">
                    {schema.description}
                  </p>
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
                      router.push(`/practice?schemaId=${schema.id}`)
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
