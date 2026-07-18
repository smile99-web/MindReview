import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// GET /api/mistakes/due
// Returns the user's mistakes that are due for review: unresolved
// rows whose nextReviewAt is null or <= now, plus resolved rows
// whose nextReviewAt has come due again (否则 resolved 错题到期后
// 永远回不到复习列表，FSRS 闭环断裂). Used by the "今日待复习"
// widget on the mistakes landing page. Limit defaults to 20;
// pass ?limit=N to override.
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(new URL(req.url).searchParams.get('limit') || '20', 10) || 20),
    );
    const now = new Date();

    const due = await prisma.mistake.findMany({
      where: {
        userId,
        OR: [
          {
            resolved: false,
            OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: now } }],
          },
          // resolved 但已到期的错题要重新浮现
          { resolved: true, nextReviewAt: { lte: now } },
        ],
      },
      // 同题答错 N 次 → N 行，今日待复习列表会出现 10 道完全相同的题。
      // `distinct` 让 Prisma 在 SELECT 里加 DISTINCT ON (questionText)，
      // 每个题干只保留第一行；按 nextReviewAt 降序让 FSRS 进度最深
      // （调度最远）的那行胜出，而不是最早创建的旧状态行。
      distinct: ['questionText'],
      include: {
        knowledgeNode: { select: { id: true, title: true } },
        subject: { select: { id: true, name: true, icon: true, colorClass: true } },
      },
      orderBy: [{ questionText: 'asc' }, { nextReviewAt: 'desc' }],
      take: limit,
    });

    return NextResponse.json({ due });
  } catch (error: unknown) {
    console.error('[mistakes/due] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
