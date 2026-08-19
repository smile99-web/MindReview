import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';

// GET /api/mistakes/subjects
// Returns per-subject mistake counts so the landing page can render
// the 学科分类 grid. Three counts per subject:
//   - total: every mistake the user has for that subject
//   - unresolved: mistakes not yet marked resolved (default scope)
//   - due: unresolved mistakes whose nextReviewAt <= now
// Subjects with zero mistakes are NOT included (cleaner grid).
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const now = new Date();

    const rows = await prisma.mistake.groupBy({
      by: ['subjectId'],
      where: { userId, subjectId: { not: null } },
      _count: { id: true },
    });

    if (rows.length === 0) {
      return NextResponse.json({ subjects: [] });
    }

    const subjectIds = rows.map((r) => r.subjectId!).filter(Boolean);
    const subjects = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true, icon: true, colorClass: true },
    });
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    // Per-subject unresolved / due counts. Doing one extra
    // groupBy with the same predicate shape is cheaper than
    // loading every row.
    const unresolved = await prisma.mistake.groupBy({
      by: ['subjectId'],
      where: { userId, subjectId: { not: null }, resolved: false },
      _count: { id: true },
    });
    // due 口径必须与 /api/mistakes/due 一致：未解决且到期，或
    // 已解决但 nextReviewAt 到期重新浮现（否则两 widget 数字互相矛盾）
    const due = await prisma.mistake.groupBy({
      by: ['subjectId'],
      where: {
        userId,
        subjectId: { not: null },
        OR: [
          {
            resolved: false,
            OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: now } }],
          },
          { resolved: true, nextReviewAt: { lte: now } },
        ],
      },
      _count: { id: true },
    });
    const unresolvedById = new Map(unresolved.map((r) => [r.subjectId!, r._count.id]));
    const dueById = new Map(due.map((r) => [r.subjectId!, r._count.id]));

    const out = rows
      .map((r) => {
        const s = subjectById.get(r.subjectId!);
        if (!s) return null;
        return {
          id: s.id,
          name: s.name,
          icon: s.icon,
          colorClass: s.colorClass,
          total: r._count.id,
          unresolved: unresolvedById.get(s.id) ?? 0,
          due: dueById.get(s.id) ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.unresolved - a.unresolved);

    return NextResponse.json({ subjects: out });
  } catch (error: unknown) {
    console.error('[mistakes/subjects] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
