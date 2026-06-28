import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// GET /api/mistakes/due
// Returns the user's unresolved mistakes whose nextReviewAt is
// null or <= now. Used by the "今日待复习" widget on the
// mistakes landing page. Limit defaults to 20; pass ?limit=N to
// override.
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
        resolved: false,
        OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: now } }],
      },
      // 同题答错 N 次 → N 行，今日待复习列表会出现 10 道完全相同的题。
      // `distinct` 让 Prisma 在 SELECT 里加 DISTINCT ON (questionText)，
      // 每个题干只保留第一行（按 orderBy 排序，最早创建的优先）。
      distinct: ['questionText'],
      include: {
        knowledgeNode: { select: { id: true, title: true } },
        subject: { select: { id: true, name: true, icon: true, colorClass: true } },
      },
      orderBy: [{ questionText: 'asc' }, { createdAt: 'asc' }],
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
