'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { LatexText } from '@/components/ui/LatexText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MasteryBar } from '@/components/ui/MasteryBar';
import { DecomposeForm } from '@/components/knowledge/DecomposeForm';
import { TextbookGenerateForm } from '@/components/knowledge/TextbookGenerateForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { authFetch } from '@/lib/auth';
import { useUserId } from '@/components/auth/AuthProvider';
import { SUBJECT_CONFIG } from '@/types';
import type { SubjectName } from '@/types';

interface SubjectDetail {
  id: string;
  name: string;
  icon?: string | null;
}

interface ChapterItem {
  id: string;
  title: string;
  sortOrder: number;
  children?: { id: string }[];
  _count?: {
    knowledgeNodes?: number;
  };
}

interface KnowledgeNodeItem {
  id: string;
  title: string;
  summary?: string | null;
  masteryLevel: number;
  chapter?: {
    title?: string | null;
  } | null;
}

interface LearningPathStep {
  nodeId: string;
  title: string;
  summary?: string | null;
  icapLevel: string;
  estimatedMinutes?: number;
  difficulty: number;
  masteryLevel: number;
  locked?: boolean;
}

interface LearningPath {
  steps?: LearningPathStep[];
  totalSteps?: number;
  totalEstimatedMinutes?: number;
}

interface BlockedByNode {
  nodeId: string;
  title: string;
  masteryLevel: number;
  requiredLevel: number;
}

interface BlockedNode {
  nodeId: string;
  blockedBy: BlockedByNode[];
}

type SubjectsResponseItem = SubjectDetail;

interface KnowledgeResponse {
  nodes?: KnowledgeNodeItem[];
}

interface GeneratePathResponse {
  path?: LearningPath;
  blockedNodes?: BlockedNode[];
}

// Parse "第X章" or "第X单元" → absolute sequence number.
// Physics chapters use global numbering (1-18 across
// 八年级上/下/九年级上).
// History units use per-volume numbering (1-4 for each
// semester). For the "单元" pattern we return 0 —
// the grouping logic handles this case via sortOrder
// rollover detection.
function chapterNum(title: string): number {
  const m = title.match(/第([一二三四五六七八九十百零\d]+)章/);
  if (!m) return 0;
  return chineseToNumber(m[1]);
}
function chineseToNumber(s: string): number {
  const map: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
    '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14,
    '十五': 15, '十六': 16, '十七': 17, '十八': 18,
    '十九': 19, '二十': 20,
  };
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  return map[s] || 0;
}
type ChapterGroup = { label: string; icon: string; chapters: ChapterItem[] };
function groupChapters(chapters: ChapterItem[]): ChapterGroup[] {
  // Physics-style: uses "第X章" with absolute numbering.
  // Map chapter numbers to grade levels.
  const hasAbsoluteChapters = chapters.some((ch) => chapterNum(ch.title) > 0);
  if (hasAbsoluteChapters) {
    const groups: Record<string, ChapterItem[]> = {};
    for (const ch of chapters) {
      const n = chapterNum(ch.title);
      let key: string;
      if (n >= 1 && n <= 6) key = '八年级上';
      else if (n >= 7 && n <= 12) key = '八年级下';
      else if (n >= 13 && n <= 18) key = '九年级上';
      else if (n >= 19 && n <= 24) key = '九年级下';
      else if (n >= 25) key = '高中';
      else key = '其他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(ch);
    }
    const order = ['八年级上', '八年级下', '九年级上', '九年级下', '高中', '其他'];
    const icons: Record<string, string> = {
      '八年级上': '📘', '八年级下': '📗', '九年级上': '📙', '九年级下': '📕', '高中': '📓', '其他': '📂',
    };
    return order
      .filter((k) => groups[k] && groups[k].length > 0)
      .map((k) => ({ label: k, icon: icons[k] || '📂', chapters: groups[k] }));
  }

  // History-style: uses "第X单元" with per-volume numbering.
  // Detect volume boundaries by sortOrder rollover (sortOrder
  // resets to 1 when a new volume starts).
  const sorted = [...chapters].sort((a, b) => {
    // primary sort: scan order (original list is DB-ordered)
    return 0; // keep original order
  });
  const volumes: ChapterItem[][] = [];
  let current: ChapterItem[] = [];
  let prevSort = 999;
  for (const ch of sorted) {
    if (ch.sortOrder < prevSort && current.length > 0) {
      // sortOrder dropped → new volume
      volumes.push(current);
      current = [];
    }
    current.push(ch);
    prevSort = ch.sortOrder;
  }
  if (current.length > 0) volumes.push(current);

  // If only 1 volume was detected and the chapter titles have NO
  // '第N单元' pattern (i.e. we can't tell grade from the title
  // itself), keep them as a single unlabeled group. We can only
  // safely split 6/10 chapters when the original LLM prompt
  // produced ordered 1-6/1-10 titles — which we can detect by
  // checking that the sortOrder spans 1..N and the chapter
  // number in the title is also a clean 1..N sequence.
  if (volumes.length === 1 && sorted.length > 1) {
    // Check sortOrder is 1..N (uninterrupted) and chapter numbers
    // in titles also form a 1..N sequence — that's the LLM-emitted
    // 'clean' case.
    const sortOrderIsSequential =
      sorted.every((ch, i) => ch.sortOrder === i + 1);
    const titleNums = sorted.map((ch) => chapterNum(ch.title));
    const titleNumsAreSequential =
      titleNums.length > 0 &&
      titleNums.every((n, i) => n === i + 1) &&
      titleNums[titleNums.length - 1] === sorted.length;
    const cleanLLMOutput = sortOrderIsSequential && titleNumsAreSequential;

    if (cleanLLMOutput && sorted.length === 6) {
      volumes.length = 0;
      volumes.push(sorted.slice(0, 3));
      volumes.push(sorted.slice(3));
    } else if (cleanLLMOutput && sorted.length === 10) {
      volumes.length = 0;
      volumes.push(sorted.slice(0, 4));
      volumes.push(sorted.slice(4, 7));
      volumes.push(sorted.slice(7));
    }
  }

  // Label volumes based on detected count:
  // 2 → 七上/七下, 3 → 七上/七下/八上, otherwise generic.
  const labels: string[] = [];
  if (volumes.length === 3) labels.push('七年级上', '七年级下', '八年级上');
  else if (volumes.length === 2) labels.push('七年级上', '七年级下');
  else volumes.forEach((_, i) => labels.push(`第${i + 1} 册`));

  const icons = ['📘', '📗', '📙', '📕', '📓'];
  return volumes.map((chs, i) => ({
    label: labels[i] || `第${i + 1} 册`,
    icon: icons[i % icons.length] || '📂',
    chapters: chs,
  }));
}

export default function SubjectDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const userId = useUserId() || '';
  const router = useRouter();
  const id = params.id as string;

  const [subject, setSubject] = useState<SubjectDetail | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [nodes, setNodes] = useState<KnowledgeNodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDecompose, setShowDecompose] = useState(false);
  const [showTextbookGenerate, setShowTextbookGenerate] = useState(false);
  const [activeTab, setActiveTab] = useState<'chapters' | 'nodes'>('chapters');
  const [deletingChapter, setDeletingChapter] = useState<string | null>(null);
  const [deletingNode, setDeletingNode] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'chapter' | 'node'; id: string; title: string } | null>(null);
  const [learningPath, setLearningPath] = useState<LearningPath | null>(null);
  const [blockedNodes, setBlockedNodes] = useState<BlockedNode[]>([]);
  const [pathLoading, setPathLoading] = useState(false);
  const [showPath, setShowPath] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subjRes, chRes, nodeRes] = await Promise.all([
        authFetch(`/api/subjects`),
        authFetch(`/api/chapters?subjectId=${id}`),
        authFetch(`/api/knowledge?subjectId=${id}&limit=100`),
      ]);

      const subjects = await subjRes.json() as SubjectsResponseItem[];
      const currentSubject = subjects.find((s) => s.id === id);
      setSubject(currentSubject || null);
      setChapters(await chRes.json() as ChapterItem[]);
      const knowledgeResult = await nodeRes.json() as KnowledgeResponse;
      setNodes(knowledgeResult.nodes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData();
    });
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get('generate') === 'textbook') {
      queueMicrotask(() => {
        setShowTextbookGenerate(true);
        setShowDecompose(false);
      });
    }
  }, [searchParams]);

  const handleDeleteChapter = async (chId: string) => {
    setDeletingChapter(chId);
    try {
      const res = await authFetch(`/api/chapters/${chId}`, { method: 'DELETE' });
      if (res.ok) {
        setChapters((prev) => prev.filter((c) => c.id !== chId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingChapter(null);
      setConfirmDelete(null);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    setDeletingNode(nodeId);
    try {
      const res = await authFetch(`/api/knowledge/${nodeId}`, { method: 'DELETE' });
      if (res.ok) {
        setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingNode(null);
      setConfirmDelete(null);
    }
  };

  const config = subject ? SUBJECT_CONFIG[subject.name as SubjectName] : null;

  const handleGeneratePath = async () => {
    setPathLoading(true);
    setShowPath(true);
    try {
      const res = await authFetch('/api/path/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: id, userId }),
      });
      const data = await res.json() as GeneratePathResponse;
      setLearningPath(data.path || null);
      setBlockedNodes(data.blockedNodes || []);
    } catch { /* ignore */ }
    setPathLoading(false);
  };

  // Build lookup: nodeId -> blockedBy info
  const blockedMap = new Map<string, BlockedByNode[]>();
  for (const bn of blockedNodes) {
    blockedMap.set(bn.nodeId, bn.blockedBy);
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!subject) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 text-center">
        <p className="text-slate-500">学科不存在</p>
        <Link href="/subjects" className="text-indigo-500 hover:text-indigo-600 font-medium mt-2 inline-block transition-colors">
          返回学科列表
        </Link>
      </div>
    );
  }

  const tabs = [
    { key: 'chapters' as const, label: '章节', icon: '📂', count: chapters.length },
    { key: 'nodes' as const, label: '知识点', icon: '🧩', count: nodes.length },
  ];

  let chaptersContent: React.ReactNode;
  if (chapters.length === 0) {
    chaptersContent = (
      <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200/80">
        <p className="text-4xl mb-3">📭</p>
        <p className="text-slate-400 font-medium">暂无章节，请先拆解教材内容</p>
      </div>
    );
  } else {
    chaptersContent = (
      <div className="space-y-8">
        {groupChapters(chapters).map((grp) => (
          <div key={grp.label}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-base font-semibold text-slate-800">{grp.icon} {grp.label}</h3>
              <span className="text-xs text-slate-500">({grp.chapters.length} 章)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {grp.chapters.map((ch) => (
                <Card key={ch.id} hover>
                  <div className="flex items-start gap-3">
                    <Link href={`/chapters/${ch.id}`} className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="text-2xl shrink-0">📂</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-800 truncate text-sm">{ch.title}</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          {ch._count?.knowledgeNodes || 0} 个知识点
                        </p>
                      </div>
                    </Link>
                    <button
                      className="shrink-0 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="删除章节"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete({ type: 'chapter', id: ch.id, title: ch.title }); }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/50 text-3xl">
            {subject.icon || config?.icon || '📖'}
          </div>
          <div>
            <Link href="/subjects" className="text-xs text-slate-400 hover:text-indigo-500 transition-colors font-medium">
              学科列表
            </Link>
            <h1 className="text-[28px] font-bold text-slate-800 tracking-tight">{subject.name}</h1>
            <p className="text-sm text-slate-500">
              {chapters.length} 章节 · {nodes.length} 知识点
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/mindmap?subjectId=${id}`}>
            <Button variant="secondary">思维导图</Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setShowTextbookGenerate(!showTextbookGenerate);
              setShowDecompose(false);
            }}
          >
            {showTextbookGenerate ? '收起' : '人教版生成'}
          </Button>
          <Button
            onClick={() => {
              setShowDecompose(!showDecompose);
              setShowTextbookGenerate(false);
            }}
          >
            {showDecompose ? '收起' : 'AI拆解'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleGeneratePath}
            loading={pathLoading}
          >
            生成学习路径
          </Button>
        </div>
      </div>

      {showTextbookGenerate && (
        <div className="mb-8">
          <TextbookGenerateForm
            initialSubject={subject.name as SubjectName}
            onGenerated={() => {
              // 不要收起 — 让用户继续看 subject/grade/volume chips
              // 和生成结果。仅刷新学科数据。
              void loadData();
              router.refresh();
            }}
          />
        </div>
      )}

      {showDecompose && (
        <div className="mb-8">
          <DecomposeForm
              onDecomposed={() => {
              setShowDecompose(false);
              void loadData(); router.refresh();
            }}
          />
        </div>
      )}

      {showPath && (
        <div className="mb-8">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">学习路径</h3>
              <button onClick={() => setShowPath(false)} className="text-sm text-slate-400 hover:text-slate-600">收起</button>
            </div>
            {pathLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : learningPath ? (
              <div className="space-y-0">
                {learningPath.steps?.map((step, i) => {
                  // 学习路径不再锁定：所有步骤都可以自由学习
                  const isLocked = false;
                  const blockedInfo = blockedMap.get(step.nodeId);

                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-indigo-100 text-indigo-600">
                          {i + 1}
                        </div>
                        {i < (learningPath.steps?.length || 0) - 1 && (
                          <div className="w-0.5 flex-1 min-h-[16px] bg-indigo-100" />
                        )}
                      </div>
                      <div className="pb-5 flex-1 min-w-0">
                        <Link href={`/cards/${step.nodeId}`} className="font-medium text-slate-800 text-sm hover:text-indigo-600 transition-colors">
                          {step.title}
                        </Link>
                        {step.summary && <LatexText text={step.summary || ""} className="text-xs text-slate-500 mt-0.5 line-clamp-1" />}
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="info" size="sm">{step.icapLevel}</Badge>
                          {step.estimatedMinutes && <span className="text-xs text-slate-400">{step.estimatedMinutes}分钟</span>}
                          <span className="text-xs text-slate-400">难度 {step.difficulty}</span>
                          <div className="w-16">
                            <MasteryBar level={step.masteryLevel} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-3 text-xs text-slate-400 pt-2 border-t border-slate-100">
                  <span>共 {learningPath.totalSteps || 0} 步</span>
                  <span>预估 {learningPath.totalEstimatedMinutes || 0} 分钟</span>
                </div>
              </div>
            ) : (
              <EmptyState icon="🗺️" title="暂无学习路径数据" />
            )}
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/60 backdrop-blur rounded-xl p-1 border border-slate-200/60 inline-flex shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-white text-indigo-600 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_12px_rgba(0,0,0,0.02)]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {activeTab === 'chapters' ? chaptersContent : (
        <div className="space-y-2">
          {nodes.map((node) => (
            <Card key={node.id} hover padding="sm">
              <div className="flex items-center justify-between">
                <Link href={`/cards/${node.id}`} className="flex-1 min-w-0 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-slate-800 truncate">{node.title}</h4>
                      <Badge variant="info" size="sm">{node.chapter?.title}</Badge>
                    </div>
                    <LatexText text={node.summary || ""} className="text-xs text-slate-500 line-clamp-1" />
                  </div>
                  <div className="ml-4 flex items-center gap-3">
                    <div className="w-24">
                      <MasteryBar level={node.masteryLevel} />
                    </div>
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </Link>
                <button
                  className="shrink-0 ml-3 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="删除知识点"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete({ type: 'node', id: node.id, title: node.title }); }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </Card>
          ))}
          {nodes.length === 0 && (
            <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200/80">
              <p className="text-4xl mb-3">🧩</p>
              <p className="text-slate-400 font-medium">暂无知识点</p>
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 mx-4 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-100 text-red-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-[15px]">
                  确认删除{confirmDelete.type === 'chapter' ? '章节' : '知识点'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{confirmDelete.title}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              {confirmDelete.type === 'chapter'
                ? '删除后关联的知识点将解除绑定，子章节将提升为顶级章节。此操作不可撤销。'
                : '删除后相关的练习记录和错题将被保留。此操作不可撤销。'}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>
                取消
              </Button>
              <Button
                size="sm"
                className="bg-red-500 hover:bg-red-600 text-white"
                loading={confirmDelete.type === 'chapter' ? deletingChapter !== null : deletingNode !== null}
                onClick={() => {
                  if (confirmDelete.type === 'chapter') {
                    handleDeleteChapter(confirmDelete.id);
                  } else {
                    handleDeleteNode(confirmDelete.id);
                  }
                }}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
