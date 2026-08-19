import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { createShareToken, verifyShareToken } from '@/lib/share-token';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { appDateKey, startOfAppDay } from '@/lib/date-utils';

// POST /api/share — 生成家长周报分享链接（需登录），7 天有效
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const token = createShareToken(userId);
    return NextResponse.json({ token, path: `/share/${token}` });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}

// GET /api/share?token=xxx — 公开只读周报（签名 token 即凭证）。
// 只输出聚合统计，不含题目原文/错题内容等私密信息。
export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token') || '';
    const userId = verifyShareToken(token);
    if (!userId) {
      return NextResponse.json({ error: '分享链接无效或已过期' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, username: true, grade: true },
    });
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const now = new Date();
    const startOfToday = startOfAppDay(appDateKey(now));
    const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [reviewLogs, studyAgg, mistakeTotal, mistakeResolved, progressRows] = await Promise.all([
      prisma.reviewLog.findMany({
        where: { userId, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true, quality: true },
      }),
      prisma.studyTimeLog.aggregate({
        where: { userId, startedAt: { gte: sevenDaysAgo } },
        _sum: { durationSeconds: true },
      }),
      prisma.mistake.count({ where: { userId } }),
      prisma.mistake.count({ where: { userId, resolved: true } }),
      prisma.userKnowledgeProgress.findMany({
        where: { userId },
        select: { masteryLevel: true },
      }),
    ]);

    // 近 7 天每日复习次数
    const byDay = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      byDay.set(appDateKey(new Date(startOfToday.getTime() - (6 - i) * 24 * 60 * 60 * 1000)), 0);
    }
    for (const log of reviewLogs) {
      const key = appDateKey(log.createdAt);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const qualities = reviewLogs.map((l) => l.quality).filter((q): q is number => typeof q === 'number');
    const avgMastery = progressRows.length > 0
      ? Math.round(progressRows.reduce((s, r) => s + r.masteryLevel, 0) / progressRows.length)
      : 0;

    return NextResponse.json({
      studentName: user.name || user.username,
      grade: user.grade,
      week: {
        reviewCount: reviewLogs.length,
        avgQuality: qualities.length > 0
          ? Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 10) / 10
          : null,
        studyMinutes: Math.round((studyAgg._sum.durationSeconds ?? 0) / 60),
        dailyReviews: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      },
      mistakes: { total: mistakeTotal, resolved: mistakeResolved },
      mastery: { avgLevel: avgMastery, nodesStudied: progressRows.length },
      generatedAt: now.toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
