/**
 * Cognitive load management utilities.
 *
 * Tracks student performance during a session and dynamically adjusts
 * question difficulty, batch sizes, and mode recommendations.
 */

export interface PerformanceEntry {
  isCorrect: boolean;
  difficulty: number;
  responseTimeMs: number;
  timestamp: number;
}

/**
 * Assess current cognitive load based on recent performance.
 * Returns a value 1-5 where 1 = very low load and 5 = very high load.
 */
export function assessCurrentLoad(
  recentPerformance: PerformanceEntry[],
  currentDifficulty: number,
): number {
  if (recentPerformance.length === 0) return currentDifficulty;

  const recent = recentPerformance.slice(-5);
  const errorCount = recent.filter(p => !p.isCorrect).length;
  const errorRate = errorCount / recent.length;

  // Long response times indicate high cognitive load
  const avgResponseTime = recent.reduce((sum, p) => sum + p.responseTimeMs, 0) / recent.length;
  const timeFactor = avgResponseTime > 30000 ? 1.5 : avgResponseTime > 15000 ? 1 : 0.5;

  // Consecutive errors amplify load
  let consecutiveErrors = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (!recent[i].isCorrect) consecutiveErrors++;
    else break;
  }
  const consecutivePenalty = Math.min(2, consecutiveErrors * 0.5);

  const load = Math.round(
    Math.min(5, Math.max(1, currentDifficulty * (0.5 + errorRate) * timeFactor + consecutivePenalty)),
  );

  return load;
}

/**
 * Suggest a review mode based on recent performance.
 */
export function suggestMode(
  consecutiveErrors: number,
  averageMastery: number,
): 'basic' | 'standard' | 'challenge' {
  if (consecutiveErrors >= 3 || averageMastery < 30) return 'basic';
  if (consecutiveErrors >= 1 || averageMastery < 60) return 'standard';
  return 'challenge';
}

/**
 * Determine whether to suggest taking a break.
 */
export function shouldTakeBreak(
  sessionDurationMinutes: number,
  consecutiveErrors: number,
): boolean {
  if (consecutiveErrors >= 4) return true;
  if (sessionDurationMinutes >= 45) return true;
  if (sessionDurationMinutes >= 25 && consecutiveErrors >= 2) return true;
  return false;
}

/**
 * Get optimal batch size for the current cognitive load and mode.
 */
export function getOptimalBatchSize(cognitiveLoad: number, mode: string): number {
  switch (mode) {
    case 'basic':
      return cognitiveLoad >= 4 ? 3 : 5;
    case 'standard':
      return cognitiveLoad >= 4 ? 5 : 8;
    case 'challenge':
      return cognitiveLoad >= 4 ? 6 : 10;
    default:
      return 5;
  }
}

/**
 * Get a human-readable label for cognitive load level.
 */
export function getCognitiveLoadLabel(level: number): string {
  if (level <= 1) return '轻松';
  if (level <= 2) return '适中';
  if (level <= 3) return '中等';
  if (level <= 4) return '较难';
  return '困难';
}

/**
 * Get color class for cognitive load level.
 */
export function getCognitiveLoadColor(level: number): string {
  if (level <= 1) return 'bg-emerald-500';
  if (level <= 2) return 'bg-green-500';
  if (level <= 3) return 'bg-amber-500';
  if (level <= 4) return 'bg-orange-500';
  return 'bg-red-500';
}
