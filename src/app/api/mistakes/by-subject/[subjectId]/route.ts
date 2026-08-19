import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';

// GET /api/mistakes/by-subject/[subjectId]
// Returns the user's mistakes for one subject. Defaults to
// unresolved only (resolved=false). Pass ?includeResolved=true to
// get the full history.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const { subjectId } = await params;
    const { searchParams } = new URL(req.url);
    const includeResolved = searchParams.get('includeResolved') === 'true';
    const limit = Math.min(
      500,
      Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100),
    );

    const where = includeResolved
      ? { userId, subjectId }
      : { userId, subjectId, resolved: false };

    const [subject, mistakes] = await Promise.all([
      prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, name: true, icon: true, colorClass: true },
      }),
      prisma.mistake.findMany({
        where,
        // 去重：同题答错多次只展示一条。保留的是 distinct 排序后每组第一行
        // ——必须与 mistakes/due 同口径保留调度最深的行（nextReviewAt desc），
        // 否则同一题在 due 列表显示"10 天后"、此处却按最旧行显示"已到期"。
        // Postgres DESC 时 NULL 排前，符合"未排期=立即到期"语义。
        distinct: ['questionText'],
        include: {
          knowledgeNode: { select: { id: true, title: true } },
        },
        orderBy: [{ questionText: 'asc' }, { nextReviewAt: 'desc' }],
        take: limit,
      }),
    ]);

    if (!subject) {
      return NextResponse.json({ error: '学科不存在' }, { status: 404 });
    }

    const now = Date.now();
    const enriched = mistakes.map((m) => ({
      ...m,
      // Surface the "due now" hint at the API layer so the UI
      // doesn't have to re-implement the date math. resolved 的
      // 错题到期后同样视为到期（否则 FSRS 闭环断裂）。
      isDue: !m.resolved
        ? m.nextReviewAt === null || m.nextReviewAt.getTime() <= now
        : m.nextReviewAt !== null && m.nextReviewAt.getTime() <= now,
      daysUntilDue: m.nextReviewAt
        ? Math.max(0, Math.ceil((m.nextReviewAt.getTime() - now) / (24 * 60 * 60 * 1000)))
        : 0,
    }));

    return NextResponse.json({ subject, mistakes: enriched });
  } catch (error: unknown) {
    console.error('[mistakes/by-subject] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
