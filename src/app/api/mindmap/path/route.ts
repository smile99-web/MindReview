import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import {
  chapterNumberFromTitle,
  GRADE_ICONS,
  gradeSortIndex,
  inferGradeFromChapterTitle,
  normalizeGradeLevel,
} from '@/lib/grade-level';

// ---------------------------------------------------------------------------
// GET /api/mindmap/path?subjectId=xxx — 年级学习路径
//
// 思维导图的"学习路径"视图数据：把学科知识点按年级学期分组、按教材章节顺序
// 排列，标注每个知识点的掌握度与关系（串联），并给出"建议从这里开始"的
// 推荐起点（路径上第一个未掌握的节点）。
// ---------------------------------------------------------------------------

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');
    if (!subjectId) {
      return NextResponse.json({ error: '缺少 subjectId' }, { status: 400 });
    }

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, icon: true },
    });
    if (!subject) {
      return NextResponse.json({ error: '学科不存在' }, { status: 404 });
    }

    const nodes = await prisma.knowledgeNode.findMany({
      where: {
        subjectId,
        OR: [{ representationType: null }, { representationType: { not: 'schema' } }],
      },
      select: {
        id: true,
        title: true,
        summary: true,
        difficulty: true,
        masteryLevel: true,
        keywords: true,
        gradeLevel: true,
        chapterId: true,
        createdAt: true,
        chapter: { select: { id: true, title: true, sortOrder: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });

    const nodeIds = nodes.map((n) => n.id);

    // 当前用户的掌握度 + 学习完成度（读/练）
    type ProgressRow = {
      knowledgeNodeId: string;
      masteryLevel: number;
      readCompletedAt: Date | null;
      practicedCompletedAt: Date | null;
    };
    let progressRows: ProgressRow[] = [];
    try {
      const userId = await resolveUserIdFromRequest(req);
      progressRows = await prisma.userKnowledgeProgress.findMany({
        where: { userId, knowledgeNodeId: { in: nodeIds } },
        select: {
          knowledgeNodeId: true,
          masteryLevel: true,
          readCompletedAt: true,
          practicedCompletedAt: true,
        },
      });
    } catch {
      // 未登录兜底：proxy 一般已拦截；这里保持只读不 500
    }
    const progressByNodeId = new Map(progressRows.map((p) => [p.knowledgeNodeId, p]));

    // 学科内关系边（排除 schema_member，只留两端都在本学科的边）
    const edges = await prisma.knowledgeEdge.findMany({
      where: {
        relationType: { not: 'schema_member' },
        fromId: { in: nodeIds },
        toId: { in: nodeIds },
      },
      select: { fromId: true, toId: true, relationType: true, label: true },
    });
    const titleById = new Map(nodes.map((n) => [n.id, n.title]));
    const relationsByNodeId = new Map<string, PathRelation[]>();
    const pushRelation = (nodeId: string, rel: PathRelation) => {
      const list = relationsByNodeId.get(nodeId) ?? [];
      // 每节点最多保留 8 条，避免长列表撑爆 UI；先修优先
      if (list.length >= 8) return;
      list.push(rel);
      relationsByNodeId.set(nodeId, list);
    };
    // 先修边优先插入
    const sortedEdges = [...edges].sort((a, b) =>
      a.relationType === 'prerequisite' && b.relationType !== 'prerequisite'
        ? -1
        : b.relationType === 'prerequisite' && a.relationType !== 'prerequisite'
          ? 1
          : 0,
    );
    for (const e of sortedEdges) {
      pushRelation(e.fromId, {
        nodeId: e.toId,
        title: titleById.get(e.toId) ?? '',
        relationType: e.relationType,
        direction: 'out',
        label: e.label,
      });
      pushRelation(e.toId, {
        nodeId: e.fromId,
        title: titleById.get(e.fromId) ?? '',
        relationType: e.relationType,
        direction: 'in',
        label: e.label,
      });
    }

    // 章节众数年级（章内多数节点的 gradeLevel）→ 给没标注的节点兜底
    const chapterGradeVotes = new Map<string, Map<string, number>>();
    for (const n of nodes) {
      const g = normalizeGradeLevel(n.gradeLevel);
      if (!g || !n.chapterId) continue;
      const votes = chapterGradeVotes.get(n.chapterId) ?? new Map<string, number>();
      votes.set(g, (votes.get(g) ?? 0) + 1);
      chapterGradeVotes.set(n.chapterId, votes);
    }
    const chapterModalGrade = new Map<string, string>();
    for (const [chapterId, votes] of chapterGradeVotes) {
      const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) chapterModalGrade.set(chapterId, top[0]);
    }

    const gradeOf = (n: (typeof nodes)[number]): string => {
      const own = normalizeGradeLevel(n.gradeLevel);
      if (own) return own;
      if (n.chapterId) {
        const modal = chapterModalGrade.get(n.chapterId);
        if (modal) return modal;
      }
      if (n.chapter?.title) {
        const inferred = inferGradeFromChapterTitle(n.chapter.title);
        if (inferred) return inferred;
      }
      return '其他';
    };

    // 组装：grade → chapter → nodes（节点按难度升序，同难度按创建顺序）
    const gradeMap = new Map<string, Map<string, PathChapter & { sortKey: number }>>();
    for (const n of nodes) {
      const grade = gradeOf(n);
      const chapterKey = n.chapterId ?? '__none__';
      let chapterMap = gradeMap.get(grade);
      if (!chapterMap) {
        chapterMap = new Map();
        gradeMap.set(grade, chapterMap);
      }
      let chapter = chapterMap.get(chapterKey);
      if (!chapter) {
        const title = n.chapter?.title ?? '未分章';
        const num = n.chapter?.title ? chapterNumberFromTitle(n.chapter.title) : 0;
        chapter = {
          id: n.chapterId,
          title,
          nodes: [],
          // 排序键：优先章节号，其次 sortOrder，未分章排最后
          sortKey: (num > 0 ? num : 999) * 1000 + (n.chapter?.sortOrder ?? 999),
        };
        chapterMap.set(chapterKey, chapter);
      }
      const progress = progressByNodeId.get(n.id);
      chapter.nodes.push({
        id: n.id,
        title: n.title,
        summary: n.summary,
        difficulty: n.difficulty,
        // 有用户进度就用用户进度，否则退回全局快照（新用户全 0）
        masteryLevel: progress?.masteryLevel ?? n.masteryLevel ?? 0,
        keywords: n.keywords,
        readCompleted: Boolean(progress?.readCompletedAt),
        practicedCompleted: Boolean(progress?.practicedCompletedAt),
        relations: relationsByNodeId.get(n.id) ?? [],
      });
    }

    const grades: PathGrade[] = [...gradeMap.entries()]
      .map(([label, chapterMap]) => {
        const chapters = [...chapterMap.values()]
          .sort((a, b) => a.sortKey - b.sortKey)
          .map((c) => {
            const nodes = [...c.nodes].sort(
              (a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title, 'zh'),
            );
            return { id: c.id, title: c.title, nodes };
          });
        const all = chapters.flatMap((c) => c.nodes);
        const mastered = all.filter((n) => n.masteryLevel >= MASTERED_THRESHOLD).length;
        const avgMastery = all.length
          ? Math.round(all.reduce((s, n) => s + n.masteryLevel, 0) / all.length)
          : 0;
        return {
          label,
          icon: GRADE_ICONS[label] ?? '📂',
          stats: { total: all.length, mastered, avgMastery },
          chapters,
        };
      })
      .sort((a, b) => gradeSortIndex(a.label) - gradeSortIndex(b.label));

    // 推荐起点：路径顺序上第一个未掌握的节点；全部掌握则推荐掌握度最低的
    let recommendedNodeId: string | null = null;
    let recommendedGrade: string | null = null;
    let weakest: { id: string; grade: string; mastery: number } | null = null;
    outer: for (const g of grades) {
      for (const c of g.chapters) {
        for (const n of c.nodes) {
          if (!weakest || n.masteryLevel < weakest.mastery) {
            weakest = { id: n.id, grade: g.label, mastery: n.masteryLevel };
          }
          if (n.masteryLevel < MASTERED_THRESHOLD) {
            recommendedNodeId = n.id;
            recommendedGrade = g.label;
            break outer;
          }
        }
      }
    }
    if (!recommendedNodeId && weakest) {
      const fallback: { id: string; grade: string } = weakest;
      recommendedNodeId = fallback.id;
      recommendedGrade = fallback.grade;
    }

    const allNodes = grades.flatMap((g) => g.chapters.flatMap((c) => c.nodes));
    const masteredTotal = allNodes.filter((n) => n.masteryLevel >= MASTERED_THRESHOLD).length;

    return NextResponse.json({
      subject,
      grades,
      recommendedNodeId,
      recommendedGrade,
      stats: {
        total: allNodes.length,
        mastered: masteredTotal,
        avgMastery: allNodes.length
          ? Math.round(allNodes.reduce((s, n) => s + n.masteryLevel, 0) / allNodes.length)
          : 0,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
