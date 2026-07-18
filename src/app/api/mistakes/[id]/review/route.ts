import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { fsrsReview, RATING_LABEL } from '@/lib/fsrs';
import type { Rating } from '@/lib/fsrs';

// POST /api/mistakes/[id]/review
// Body: { rating: 0|1|2|3, durationMs?: number }
// Returns: { state, nextReviewAt, stability, difficulty, resolved, history }
//
// Records one FSRS review attempt for a single mistake and
// re-schedules the next review. The "暂从错题库移除" requirement:
// when rating = 3 (easy/秒答，毕业) AND the state has graduated to
// 'review' AND stability >= 5, we set resolved=true. The
// Mistake row stays in the DB (FSRS keeps its history), but it
// disappears from the default unresolved view. nextReviewAt is
// still written so the Ebbinghaus curve resurfaces it later
// (到期后 due/by-subject 会重新放行 resolved:true 的行).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      rating?: number;
      durationMs?: number;
    };

    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 3) {
      return NextResponse.json(
        { error: 'rating must be 0|1|2|3' },
        { status: 400 },
      );
    }
    const r = rating as Rating;

    const mistake = await prisma.mistake.findUnique({ where: { id } });
    if (!mistake) {
      return NextResponse.json({ error: '错题不存在' }, { status: 404 });
    }
    if (mistake.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // 读 → 计算 → 写包进 Serializable 事务：无事务的 read-modify-write
    // 下并发两次评分会让 history 互相覆盖丢一条记录。事务冲突
    // （P2034 / 40001）时重新执行整个事务函数重试一次。
    const executeReview = () =>
      prisma.$transaction(
        async (tx) => {
          const current = await tx.mistake.findUnique({ where: { id } });
          if (!current) {
            throw new Error('错题不存在');
          }

          // Build the prev FSRS state from the row. Existing rows
          // (pre-FSRS schema) will have nulls/defaults — we fall back
          // to the initial state so the first review uses the standard
          // FSRS beginner curve.
          const prev = {
            state: (current.state as 'new' | 'learning' | 'review' | 'relearning') || 'new',
            stability: current.stability ?? 1,
            difficulty: current.difficulty ?? 5,
            reps: current.reps ?? 0,
            lapses: current.lapses ?? 0,
            lastReviewAt: current.lastReviewAt,
            nextReviewAt: current.nextReviewAt,
          };

          const { state, log } = fsrsReview(r, prev);

          // resolved 规则（与 fsrs.ts 的 rating 语义一致）：
          // 仅 rating=3（秒答，毕业）且状态已毕业才标记 resolved=true；
          // rating=0（Again）强制 resolved:false，rating 1-2（非毕业
          // 评分）也 resolved:false — 否则 resolved 的错题到期后永远
          // 回不到复习列表，FSRS 闭环断裂。
          const graduated = state.state === 'review' && state.stability >= 5;
          const shouldResolve = graduated && r === 3;

          // Append to history, cap at 20 entries.
          const prevHistory = Array.isArray(current.history)
            ? (current.history as unknown[])
            : [];
          const nextHistory = [
            ...prevHistory,
            { ...log, durationMs: body.durationMs },
          ].slice(-20);

          return tx.mistake.update({
            where: { id },
            data: {
              state: state.state,
              stability: state.stability,
              difficulty: state.difficulty,
              reps: state.reps,
              lapses: state.lapses,
              lastReviewAt: state.lastReviewAt,
              nextReviewAt: state.nextReviewAt,
              history: nextHistory as unknown as object,
              resolved: shouldResolve,
            },
            select: {
              id: true,
              state: true,
              stability: true,
              difficulty: true,
              reps: true,
              lapses: true,
              lastReviewAt: true,
              nextReviewAt: true,
              resolved: true,
              history: true,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );

    let updated;
    try {
      updated = await executeReview();
    } catch (error: unknown) {
      // Serializable 冲突：整体重试一次
      const code = (error as { code?: string } | null)?.code;
      if (code === 'P2034' || code === '40001') {
        updated = await executeReview();
      } else {
        throw error;
      }
    }

    return NextResponse.json({
      rating: r,
      ratingLabel: RATING_LABEL[r],
      state: updated.state,
      stability: updated.stability,
      difficulty: updated.difficulty,
      reps: updated.reps,
      lapses: updated.lapses,
      lastReviewAt: updated.lastReviewAt,
      nextReviewAt: updated.nextReviewAt,
      resolved: updated.resolved,
      // UI hint: if resolved this turn, tell the user "this one
      // is done for now, will resurface on <date>".
      willResurface: updated.nextReviewAt
        ? updated.nextReviewAt.toISOString()
        : null,
      history: updated.history,
    });
  } catch (error: unknown) {
    console.error('[mistakes/review] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
