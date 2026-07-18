/**
 * FSRS-style spaced-repetition scheduler for the mistake book.
 *
 * 简化版 FSRS（Free Spaced Repetition Scheduler）实现。
 * 完整 FSRS 4.x 用 17 个参数 + 19 条更新规则 — 我们用 4 个核心
 * 参数（stability, difficulty, reps, lapses）+ 6 条最关键规则，
 * 够用且容易解释。
 *
 * 设计目标：
 *  - 学生答对 → 拉长 nextReviewAt（Ebbinghaus 曲线：保留率随时间指数衰减，
 *    stability 是"半衰期"天数）。
 *  - 学生答错 → 立刻把 nextReviewAt 拉回今天（重新进入 learning 状态），
 *    不从错题本移除（resolved 保持 false）。
 *  - 多次答对后提升 stability，多次答错降低 stability + difficulty 扣分。
 *  - 不在 Mistake 表上设 unique 约束（避免用户重做同题时 unique violation）。
 *
 * 字段约定：
 *  - rating 0-3：0=Again(完全不会), 1=Hard(提示下答对), 2=Good(自己答对),
 *    3=Easy(秒答)
 */

export type Rating = 0 | 1 | 2 | 3;

export interface FsrsState {
  state: 'new' | 'learning' | 'review' | 'relearning';
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewAt: Date | null;
  nextReviewAt: Date | null;
}

export interface FsrsReviewLog {
  at: string; // ISO
  rating: Rating;
  durationMs?: number;
  // Snapshot of state right AFTER this review, so the user can
  // see how their memory-strength changed over time.
  stabilityAfter: number;
  difficultyAfter: number;
  nextReviewAt: string;
}

const RATING_LABEL: Record<Rating, string> = {
  0: '完全不会',
  1: '提示下答对',
  2: '自己答对',
  3: '秒答',
};

const RATING_COLOR: Record<Rating, string> = {
  0: 'bg-rose-500',
  1: 'bg-orange-500',
  2: 'bg-emerald-500',
  3: 'bg-emerald-600',
};

/**
 * Run the FSRS scheduling update for a single review. Returns the
 * new state + a log entry the caller can append to Mistake.history.
 *
 * Parameters follow the simplified FSRS algorithm (Anki-derived):
 *   - again (0): reset stability to ~1 day, difficulty += 0.2 (capped 1-10),
 *     lapses += 1, reps += 1（reps 语义 = 总复习次数，含 lapse；
 *     毕业判定另有 stability >= 5 门槛，Again 后 stability 被压低，不会误毕业）,
 *     state → 'relearning' if was 'review' else 'learning'.
 *     nextReviewAt = now + 1 day (capped at 1d so the user sees it
 *     again in the next session at the latest).
 *   - hard (1): small difficulty bump, stability multiplied by 1.1
 *     (modest interval growth), nextReviewAt = now + 1 day.
 *   - good (2): canonical "good" — stability *= w (where w depends on
 *     difficulty), difficulty -= 0.15, reps += 1. Graduation check:
 *     if reps >= 2 AND stability >= 5, state → 'review' and we let
 *     stability drive the interval (multi-day).
 *   - easy (3): same as good but with a 1.3x boost on stability,
 *     difficulty -= 0.3, reps += 1, state → 'review' immediately.
 *
 * All updates preserve the invariant nextReviewAt > lastReviewAt.
 */
export function fsrsReview(
  rating: Rating,
  prev: FsrsState,
  now: Date = new Date(),
): { state: FsrsState; log: FsrsReviewLog } {
  const wasReview = prev.state === 'review';
  let nextState: FsrsState = {
    ...prev,
    lastReviewAt: now,
  };
  let days: number;

  if (rating === 0) {
    // Again — full reset
    nextState = {
      state: wasReview ? 'relearning' : 'learning',
      stability: Math.max(0.5, prev.stability * 0.4),
      difficulty: clampDifficulty(prev.difficulty + 0.2),
      reps: prev.reps + 1,
      lapses: prev.lapses + 1,
      lastReviewAt: now,
      nextReviewAt: addDays(now, 1),
    };
    days = 1;
  } else if (rating === 1) {
    // Hard — small growth
    const newStab = Math.max(0.8, prev.stability * 1.1);
    nextState = {
      state: prev.state === 'new' ? 'learning' : prev.state,
      stability: newStab,
      difficulty: clampDifficulty(prev.difficulty + 0.05),
      reps: prev.reps + 1,
      lapses: prev.lapses,
      lastReviewAt: now,
      nextReviewAt: addDays(now, 1),
    };
    days = 1;
  } else if (rating === 2) {
    // Good — canonical growth
    const newStab = prev.stability * (1.6 - 0.05 * prev.difficulty);
    const newReps = prev.reps + 1;
    const graduated = newReps >= 2 && newStab >= 5;
    nextState = {
      state: graduated ? 'review' : 'learning',
      stability: newStab,
      difficulty: clampDifficulty(prev.difficulty - 0.15),
      reps: newReps,
      lapses: prev.lapses,
      lastReviewAt: now,
      nextReviewAt: addDays(now, graduateToDays(newStab, prev.difficulty)),
    };
    days = graduateToDays(newStab, prev.difficulty);
  } else {
    // Easy — boosted growth
    const newStab = prev.stability * (1.6 - 0.05 * prev.difficulty) * 1.3;
    const newReps = prev.reps + 1;
    nextState = {
      state: 'review',
      stability: newStab,
      difficulty: clampDifficulty(prev.difficulty - 0.3),
      reps: newReps,
      lapses: prev.lapses,
      lastReviewAt: now,
      nextReviewAt: addDays(now, graduateToDays(newStab, prev.difficulty) * 1.3),
    };
    days = graduateToDays(newStab, prev.difficulty) * 1.3;
  }

  // Cap to 365 days to match the SM-2 cap used elsewhere.
  const cap = Math.min(365, days);
  nextState.nextReviewAt = addDays(now, cap);

  const log: FsrsReviewLog = {
    at: now.toISOString(),
    rating,
    stabilityAfter: nextState.stability,
    difficultyAfter: nextState.difficulty,
    nextReviewAt: nextState.nextReviewAt!.toISOString(),
  };
  return { state: nextState, log };
}

/**
 * Convert a stability value (memory half-life in days) into the
 * next interval. Anchored to the Ebbinghaus curve: R(t) = 2^(-t/S),
 * with the desired-retention threshold at ~90% so t = S * log2(1/0.9) ≈
 * 0.152 * S, rounded to a friendly day count.
 */
function graduateToDays(stability: number, _difficulty: number): number {
  if (stability <= 1) return 1;
  const ideal = stability * 0.152; // 90% retention
  return Math.max(1, Math.round(ideal));
}

function clampDifficulty(d: number): number {
  return Math.max(1, Math.min(10, Number(d.toFixed(2))));
}

function addDays(now: Date, days: number): Date {
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms);
}

/**
 * When the user reports a NEW wrong answer (not an FSRS review),
 * we initialize the FSRS state. State starts as 'new' with
 * stability=1 (1-day half-life) and nextReviewAt = now + 1 day.
 * The 'analysis' field is still set by the existing LLM pipeline.
 */
export function fsrsInitial(now: Date = new Date()): FsrsState {
  return {
    state: 'new',
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    lastReviewAt: null,
    nextReviewAt: addDays(now, 1),
  };
}

export { RATING_LABEL, RATING_COLOR };
