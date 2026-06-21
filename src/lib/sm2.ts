/**
 * SM-2 记忆调度算法 + 艾宾浩斯遗忘曲线
 *
 * 核心公式：
 *   SM-2: interval = f(repetitions, easeFactor, quality)
 *   艾宾浩斯: retention = e^(-t / S), forget_risk = 1 - retention
 *   mastery: retention * 100 映射到 0-100
 */

export interface SM2State {
  repetitions: number;    // 连续正确次数
  easeFactor: number;     // 难度系数 (≥1.3)
  intervalDays: number;   // 当前间隔天数
  lastReviewAt: Date | null;
  nextReviewAt: Date | null;
  forgetRisk: number;     // 0-1
  masteryLevel: number;   // 0-100
}

export interface SM2Input {
  quality: number;                     // 回忆质量 0-5
  previous: {
    repetitions: number;
    easeFactor: number;
    intervalDays: number;
    lastReviewAt: Date | null;
  };
}

export interface SM2Result {
  state: SM2State;
  log: {
    quality: number;
    easeFactorBefore: number;
    easeFactorAfter: number;
    intervalBefore: number;
    intervalAfter: number;
    // Paired with the *_Before/*_After fields above. The single
    // 'repetitions' was ambiguous (set to the PRE-review count but the
    // schema comment said AT this review). The route handlers write
    // repetitionsAfter to ReviewLog.repetitions.
    repetitionsBefore: number;
    repetitionsAfter: number;
    forgetRisk: number;
  };
}

/**
 * 计算艾宾浩斯记忆保留率
 * R = e^(-t / S)
 *
 * @param t 距上次复习的天数
 * @param strength 记忆强度（综合 EF、重复次数、质量）
 */
function calcRetention(t: number, strength: number): number {
  if (t <= 0) return 1.0;
  return Math.exp(-t / strength);
}

/**
 * 计算记忆强度 S
 * 综合 easeFactor、repetitions、上次质量
 */
function calcMemoryStrength(ef: number, reps: number, lastQuality: number): number {
  // 基础: EF * (1 + reps 累积效应)
  const base = ef * (1 + reps * 0.12);
  // 质量修正: 质量越高记忆越牢固
  const qualityFactor = 0.6 + (lastQuality / 5) * 0.4;
  return Math.max(0.5, base * qualityFactor);
}

/**
 * SM-2 + 艾宾浩斯混合调度
 *
 * @param quality - 回忆质量评分 (0-5)
 *   5 = 完美回忆，毫不费力
 *   4 = 正确回忆，稍作思考
 *   3 = 正确回忆，但有困难
 *   2 = 错误回忆，但看到答案后能想起
 *   1 = 错误回忆，看到答案后仍不记得
 *   0 = 完全忘记
 * @param previous - 上一次的 SM-2 状态
 */
export function sm2(quality: number, previous: SM2Input["previous"]): SM2Result {
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  const now = new Date();
  const efBefore = previous.easeFactor;
  const intervalBefore = previous.intervalDays;

  // 计算距上次复习的天数
  let newReps: number;
  let newInterval: number;
  let newEF: number;

  if (q >= 3) {
    // 正确回忆 → 增加间隔
    if (previous.repetitions === 0) {
      newInterval = 1;
    } else if (previous.repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(previous.intervalDays * previous.easeFactor);
    }
    newReps = previous.repetitions + 1;

    // SM-2 难度系数更新 — 规范只在 q>=3 时更新 EF
    newEF = previous.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  } else {
    // 错误回忆 → 重置 reps 和 interval，EF 保持不变（canonical SuperMemo）
    // 之前的实现 -=(0.14+(3-q)*0.06) 是非规范的：lapse 时 EF 不应变化，
    // 只重置 reps。叠加 Ebbinghaus 缩短 interval 已足够惩罚。
    newReps = 0;
    newInterval = 1;
    newEF = previous.easeFactor;
  }

  newEF = Math.max(1.3, Number(newEF.toFixed(2)));

  // === 艾宾浩斯修正 ===
  // 计算当前记忆强度
  const strength = calcMemoryStrength(newEF, newReps, q);
  // 预测在 newInterval 天后的保留率
  const retention = calcRetention(newInterval, strength);
  const forgetRisk = Math.round((1 - retention) * 100) / 100;

  // 如果预测遗忘风险 > 20%，缩短间隔
  // 如果预测遗忘风险 < 5%，可以适当延长
  if (forgetRisk > 0.25) {
    newInterval = Math.max(1, Math.floor(newInterval * 0.75));
  } else if (forgetRisk > 0.15) {
    newInterval = Math.max(1, Math.floor(newInterval * 0.9));
  } else if (forgetRisk < 0.03 && newReps > 2) {
    newInterval = Math.ceil(newInterval * 1.1);
  }

  // 强制上限: 365 天
  newInterval = Math.min(365, newInterval);

  // 计算下次复习时间。之前的实现 setHours(8, 0, 0, 0) 把时间钉死到
  // 服务器本地时区的 08:00。Postgres 存的是绝对时间（UTC），所以不同
  // 时区的学生看到的到期时刻都按服务器来 — 一个 UTC+0 学生在 CST
  // 服务器存的 nextReviewAt 会显示成 16:00（不是 8:00）。
  // 去掉 setHours 改为 `now + N 天的精确时间`。review route 的
  // '今天到期' 判断走 getDaysDelta（按天比较），不受影响。
  const nextReviewAt = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);

  // 映射 masteryLevel: 综合本轮质量 + 间隔长度
  //
  // 之前实现是 `calcRetention(0, strength) * 85 + q * 3`，但
  // calcRetention(0, ...) = e^(-0/strength) = 1.0 恒成立，
  // 所以公式退化成 `85 + q*3` ∈ [85, 100]，
  // 完全忽略学生表现（答对/答错都 ≥ 85%）。
  //
  // 新公式: 质量分 0-60 + 间隔分 0-40
  //   - q=0 (完全忘记) → 0
  //   - q=5 (完美回忆) → 60
  //   - interval=1 天 → 2
  //   - interval≥20 天 → 40
  // 这让 60% 的"通过"门槛能正确反映"本轮答得 + 已记住多久"。
  const qualityScore = q * 12; // 0-60
  const intervalScore = Math.min(40, newInterval * 2); // 1→2, 20→40
  const masteryLevel = Math.min(100, qualityScore + intervalScore);

  return {
    state: {
      repetitions: newReps,
      easeFactor: newEF,
      intervalDays: newInterval,
      lastReviewAt: now,
      nextReviewAt,
      forgetRisk,
      masteryLevel,
    },
    log: {
      quality: q,
      easeFactorBefore: efBefore,
      easeFactorAfter: newEF,
      intervalBefore,
      intervalAfter: newInterval,
      // Pair with the *_Before/*_After fields above. The previous
      // single 'repetitions' field was set to the PRE-review count,
      // which contradicted the ReviewLog.repetitions schema comment
      // ('本次复习时的连续正确次数'). The route handlers used to write
      // this 'before' value into ReviewLog.repetitions, so the logged
      // count was always the count going into the review, not the
      // resulting count. Now store both so the caller can pick.
      repetitionsBefore: previous.repetitions,
      repetitionsAfter: newReps,
      forgetRisk,
    },
  };
}

/**
 * 计算某知识点的当前遗忘风险（不依赖于刚进行的复习）
 */
export function calcCurrentForgetRisk(state: {
  easeFactor: number;
  repetitions: number;
  intervalDays: number;
  lastReviewAt: Date | null;
}): number {
  if (!state.lastReviewAt) return 0;

  const now = new Date();
  const daysSince = Math.max(0, Math.round(
    (now.getTime() - state.lastReviewAt.getTime()) / (1000 * 3600 * 24)
  ));

  const strength = calcMemoryStrength(state.easeFactor, state.repetitions, 4);
  const retention = calcRetention(daysSince, strength);
  return Math.round((1 - retention) * 100) / 100;
}

/**
 * 获取质量评分的文字标签
 */
export function getQualityLabel(q: number): string {
  const labels: Record<number, string> = {
    0: "完全忘记",
    1: "很不熟悉",
    2: "看到答案才想起",
    3: "有困难但正确",
    4: "基本掌握",
    5: "完全掌握",
  };
  return labels[q] || "未评分";
}

// ── Hint Fading System (认知负荷理论 — 引导渐隐) ──────────────────────────

export type HintLevel = 1 | 2 | 3;

export const HINT_LEVEL_LABELS: Record<HintLevel, string> = {
  1: '完全引导',
  2: '部分引导',
  3: '最小引导',
};

export const HINT_LEVEL_DESCRIPTIONS: Record<HintLevel, string> = {
  1: '显示完整的解释和解题结构',
  2: '显示关键概念或第一步提示',
  3: '仅显示学科/领域作为上下文',
};

/**
 * 根据 SM-2 重复次数和掌握度计算提示等级
 *
 * 认知负荷理论：随着学习者掌握度提升，逐步撤除脚手架（guidance fading）
 *
 * - Level 1（完全引导）: 0-1 次正确回忆 — 需要完整示例/解释
 * - Level 2（部分引导）: 2-3 次正确回忆 — 仅给出关键线索
 * - Level 3（最小引导）: 4+ 次正确回忆 — 几乎独立解决
 *
 * @param repetitions - SM-2 连续正确次数
 * @param masteryLevel - 当前掌握度 (0-100)
 */
export function getHintLevel(repetitions: number, masteryLevel: number): HintLevel {
  if (repetitions <= 1 || masteryLevel < 30) return 1;
  if (repetitions <= 3 || masteryLevel < 60) return 2;
  return 3;
}

/**
 * 计算使用提示后的质量扣减
 * 使用提示 → 说明回忆不够独立，质量应适当降低
 *
 * @param baseQuality - 原始质量评分 (0-5)
 * @param hintLevel - 使用的提示等级
 * @returns 调整后的质量评分 (0-5)
 */
export function adjustQualityForHint(baseQuality: number, hintLevel: HintLevel): number {
  // Level 1 (最详细提示) 扣减最大，Level 3 扣减最小
  const deductions: Record<HintLevel, number> = { 1: 1, 2: 0.5, 3: 0 };
  return Math.max(0, Math.min(5, baseQuality - deductions[hintLevel]));
}

/**
 * 获取质量评分的颜色
 */
export function getQualityColor(q: number): string {
  if (q >= 5) return "bg-emerald-500";
  if (q >= 4) return "bg-green-500";
  if (q >= 3) return "bg-amber-500";
  if (q >= 2) return "bg-orange-500";
  return "bg-red-500";
}
