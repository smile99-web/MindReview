'use client';

import { authFetch } from '@/lib/auth';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/errors';

interface SearchResult {
  id: string;
  title: string;
  summary: string;
  subjectName: string;
  score: number;
}

interface SearchResponse {
  error?: string;
  results?: SearchResult[];
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await authFetch(
        `/api/search?q=${encodeURIComponent(q.trim())}&limit=15`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as SearchResponse;
        throw new Error(data.error || '搜索失败');
      }
      const data = await res.json() as SearchResponse;
      setResults(data.results || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, '搜索出错'));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 键盘快捷键: Ctrl+K 聚焦搜索框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.getElementById('search-input') as HTMLInputElement;
        input?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold text-slate-800 tracking-tight mb-4">
          搜索知识点
        </h1>

        {/* 搜索框 */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              id="search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch(query);
              }}
              placeholder="搜索知识点关键词、概念、公式...（Ctrl+K 聚焦）"
              autoComplete="off"
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-slate-200/80 text-sm bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all duration-200 placeholder:text-slate-300"
            />
          </div>
          <Button
            onClick={() => handleSearch(query)}
            loading={loading}
            disabled={!query.trim()}
            className="px-6"
          >
            搜索
          </Button>
        </div>

        <p className="text-xs text-slate-400 mt-2.5">
          支持语义搜索（向量匹配）+ 关键词回退 · 共 {results.length} 条结果
        </p>
      </div>

      {/* 结果区域 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 bg-slate-100 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <Card>
          <div className="text-center py-14">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 text-2xl mb-4">
              ⚠️
            </div>
            <p className="text-slate-600 font-medium">搜索出错</p>
            <p className="text-sm text-slate-400 mt-1.5">{error}</p>
          </div>
        </Card>
      ) : searched && results.length === 0 ? (
        <Card>
          <div className="text-center py-14">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-2xl mb-4">
              🔍
            </div>
            <p className="text-slate-500 font-medium">
              未找到「{query}」的相关结果
            </p>
            <p className="text-sm text-slate-400 mt-1.5">
              试试其他关键词，或者先去学科页面拆解教材内容
            </p>
            <Link href="/subjects" className="inline-block mt-4">
              <Button variant="secondary">前往学科页面</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {results.map((result) => (
            <Link key={result.id} href={`/cards/${result.id}`}>
              <Card hover padding="sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="font-semibold text-slate-800 text-[15px] truncate">
                        {result.title}
                      </h3>
                      {result.subjectName && (
                        <Badge variant="info" size="sm">
                          {result.subjectName}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2">
                      {result.summary || '暂无摘要'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-slate-400">
                      {Math.round(result.score * 100)}% 匹配
                    </span>
                    <svg
                      className="w-4 h-4 text-slate-300 ml-auto mt-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </div>
                </div>
              </Card>
            </Link>
          ))}

          {results.length > 0 && (
            <p className="text-center text-xs text-slate-400 pt-4">
              共找到 {results.length} 条结果 · 点击卡片查看详情
            </p>
          )}
        </div>
      )}
    </div>
  );
}
