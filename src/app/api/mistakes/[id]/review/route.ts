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
// when rating >= 2 (good/easy) AND the state has graduated to
// 'review' AND stability >= 5, we set resolved=true. The
// Mistake row stays in the DB (FSRS keeps its history), but it
// disappears from the default unresolved view. nextReviewAt is
// still written so the Ebbinghaus curve resurfaces it later
// (the scheduler doesn't care about resolved — we re-show the
// row once nextReviewAt <= now, regardless).
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

    // Build the prev FSRS state from the row. Existing rows
    // (pre-FSRS schema) will have nulls/defaults — we fall back
    // to the initial state so the first review uses the standard
    // FSRS beginner curve.
    const prev = {
      state: (mistake.state as 'new' | 'learning' | 'review' | 'relearning') || 'new',
      stability: mistake.stability ?? 1,
      difficulty: mistake.difficulty ?? 5,
      reps: mistake.reps ?? 0,
      lapses: mistake.lapses ?? 0,
      lastReviewAt: mistake.lastReviewAt,
      nextReviewAt: mistake.nextReviewAt,
    };

    const { state, log } = fsrsReview(r, prev);

    // "暂从错题库移除" rule: graduated + good/easy → mark resolved.
    // The row stays so the Ebbinghaus-curve resurface can bring it
    // back later (FSRS doesn't delete on resolve — it just sets the
    // gate so the UI hides it).
    const graduated = state.state === 'review' && state.stability >= 5;
    const shouldResolve = graduated && r >= 2;

    // Append to history, cap at 20 entries.
    const prevHistory = Array.isArray(mistake.history)
      ? (mistake.history as unknown[])
      : [];
    const nextHistory = [
      ...prevHistory,
      { ...log, durationMs: body.durationMs },
    ].slice(-20);

    const updated = await prisma.mistake.update({
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
        resolved: shouldResolve ? true : mistake.resolved,
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
