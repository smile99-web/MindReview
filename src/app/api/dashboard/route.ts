import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';

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
      averageMasteryResult,
      subjects,
      recentNodes,
      dueTasks,
      lowMastery,
      mediumMastery,
      highMastery,
    ] = await Promise.all([
      prisma.knowledgeNode.count(),
      prisma.subject.count(),
      prisma.chapter.count(),
      prisma.reviewLog.count({
        where: { userId, action: { in: ['reviewed', 'solved', 'mastered'] } },
      }),
      prisma.reviewLog.count({
        where: {
          userId,
          action: { in: ['reviewed', 'solved', 'mastered'] },
          createdAt: { gte: startOfToday, lt: endOfToday },
        },
      }),
      prisma.reviewTask.count({ where: { userId, completed: false } }),
      prisma.mistake.count({ where: { userId } }),
      prisma.question.count(),
      prisma.knowledgeNode.aggregate({ _avg: { masteryLevel: true } }),
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
      prisma.knowledgeNode.count({ where: { masteryLevel: { lt: 34 } } }),
      prisma.knowledgeNode.count({ where: { masteryLevel: { gte: 34, lt: 67 } } }),
      prisma.knowledgeNode.count({ where: { masteryLevel: { gte: 67 } } }),
    ]);

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
        averageMastery: Math.round(averageMasteryResult._avg.masteryLevel ?? 0),
      },
      subjects,
      recentNodes,
      dueTasks,
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
