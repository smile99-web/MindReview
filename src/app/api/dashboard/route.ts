import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { loadProgressByNodeId } from '@/lib/user-knowledge-progress';

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [
      totalNodes,
      totalSubjects,
      totalChapters,
      totalReviewCount,
      reviewedToday,
      pendingTasks,
      totalMistakes,
      totalQuestions,
      allNodesForMastery,
      subjects,
      recentNodes,
      dueTasks,
    ] = await Promise.all([
      prisma.knowledgeNode.count(),
      prisma.subject.count(),
      prisma.chapter.count(),
      prisma.reviewLog.count({
        where: { userId, action: { in: ['reviewed', 'solved', 'mastered', 'mistake'] } },
      }),
      prisma.reviewLog.count({
        where: {
          userId,
          action: { in: ['reviewed', 'solved', 'mastered', 'mistake'] },
          createdAt: { gte: startOfToday, lt: endOfToday },
        },
      }),
      prisma.reviewTask.count({ where: { userId, completed: false } }),
      prisma.mistake.count({ where: { userId } }),
      prisma.question.count(),
      prisma.knowledgeNode.findMany({ select: { id: true, masteryLevel: true } }),
      prisma.subject.findMany({
        include: {
          _count: {
            select: { chapters: true, knowledgeNodes: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.knowledgeNode.findMany({
        include: {
          subject: { select: { id: true, name: true } },
          chapter: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.reviewTask.findMany({
        where: { userId, completed: false },
        include: {
          knowledgeNode: {
            select: { id: true, title: true, masteryLevel: true, subjectId: true },
          },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ]);

    const progressByNodeId = await loadProgressByNodeId(
      userId,
      allNodesForMastery.map((node) => node.id),
      prisma,
    );
    const masteryValues = allNodesForMastery.map(
      (node) => progressByNodeId.get(node.id)?.masteryLevel ?? node.masteryLevel,
    );
    const averageMastery =
      masteryValues.length > 0
        ? Math.round(masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length)
        : 0;
    const lowMastery = masteryValues.filter((value) => value < 34).length;
    const mediumMastery = masteryValues.filter((value) => value >= 34 && value < 67).length;
    const highMastery = masteryValues.filter((value) => value >= 67).length;
    const dueTasksWithProgress = dueTasks.map((task) => ({
      ...task,
      knowledgeNode: {
        ...task.knowledgeNode,
        masteryLevel:
          progressByNodeId.get(task.knowledgeNode.id)?.masteryLevel ??
          task.knowledgeNode.masteryLevel,
      },
    }));

    return NextResponse.json({
      stats: {
        totalNodes,
        totalSubjects,
        totalChapters,
        totalReviewCount,
        reviewedToday,
        pendingTasks,
        totalMistakes,
        totalQuestions,
        averageMastery,
      },
      subjects,
      recentNodes,
      dueTasks: dueTasksWithProgress,
      masteryDistribution: {
        low: lowMastery,
        medium: mediumMastery,
        high: highMastery,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
