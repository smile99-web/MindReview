import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adaptPath, type LearningPath, type PerformanceEntry } from '@/lib/learning-path';
import { resolveUserIdFromRequest } from '@/lib/user-context';

// 入参上限：每个 accuracy<0.2 的 step 都会触发一次 DB 查询（learning-path
// adaptPath），无上限时一个构造的请求可放大成上万次串行 DB 往返
const MAX_ADAPT_STEPS = 200;
const MAX_ADAPT_PERFORMANCE = 200;

/**
 * POST /api/path/adapt
 *
 * Adapts an existing learning path based on recent performance data.
 * Adjusts ICAP levels, inserts remedial steps, and logs all changes.
 *
 * Body:
 * {
 *   currentPath: LearningPath,         // the existing path to adapt
 *   performance: PerformanceEntry[],   // recent performance results
 * }
 *
 * Response:
 * {
 *   adaptedPath: LearningPath,
 *   changes: [
 *     { nodeId, changeType, fromLevel?, toLevel?, reason }
 *   ]
 * }
 *
 * Change types:
 * - level_up:    ICAP level increased due to strong performance
 * - level_down:  ICAP level decreased due to weak performance
 * - insert_remedial: prerequisite node inserted for review
 * - maintain:    no change needed
 */
export async function POST(req: NextRequest) {
  try {
    await resolveUserIdFromRequest(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const { currentPath, performance } = body;

    // --- Validation ---
    if (!currentPath) {
      return NextResponse.json(
        { error: 'currentPath is required' },
        { status: 400 },
      );
    }

    if (!currentPath.steps || !Array.isArray(currentPath.steps)) {
      return NextResponse.json(
        { error: 'currentPath.steps must be a non-empty array' },
        { status: 400 },
      );
    }

    if (currentPath.steps.length > MAX_ADAPT_STEPS) {
      return NextResponse.json(
        { error: `currentPath.steps 过长（上限 ${MAX_ADAPT_STEPS}）` },
        { status: 400 },
      );
    }

    if (!performance || !Array.isArray(performance)) {
      return NextResponse.json(
        { error: 'performance must be an array of PerformanceEntry objects' },
        { status: 400 },
      );
    }

    if (performance.length > MAX_ADAPT_PERFORMANCE) {
      return NextResponse.json(
        { error: `performance 过长（上限 ${MAX_ADAPT_PERFORMANCE}）` },
        { status: 400 },
      );
    }

    // --- Validate performance entries ---
    for (const entry of performance) {
      if (!entry.nodeId) {
        return NextResponse.json(
          { error: 'Each performance entry must have a nodeId' },
          { status: 400 },
        );
      }
      // NaN 会穿透 typeof/range 三重检查（NaN<0、NaN>1 均为 false），
      // 下游 estimateMinutes 产出 NaN 污染 totalEstimatedMinutes
      if (typeof entry.accuracy !== 'number' || !Number.isFinite(entry.accuracy) || entry.accuracy < 0 || entry.accuracy > 1) {
        return NextResponse.json(
          { error: `Invalid accuracy for node ${entry.nodeId}: must be 0-1` },
          { status: 400 },
        );
      }
      if (typeof entry.quality !== 'number' || !Number.isFinite(entry.quality) || entry.quality < 0 || entry.quality > 5) {
        return NextResponse.json(
          { error: `Invalid quality for node ${entry.nodeId}: must be 0-5` },
          { status: 400 },
        );
      }
    }

    // --- Adapt the path ---
    const castPath = currentPath as LearningPath;
    const castPerf = performance as PerformanceEntry[];

    const result = await adaptPath(castPath, castPerf, prisma);

    // --- Log adaptation for analysis ---
    const significantChanges = result.changes.filter(
      (c) => c.changeType !== 'maintain',
    );

    if (significantChanges.length > 0) {
      console.log(
        `[path/adapt] ${significantChanges.length} significant changes applied:`,
        significantChanges.map((c) => `${c.nodeId}: ${c.changeType} (${c.reason})`),
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[path/adapt POST]', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: getErrorStatus(error) },
    );
  }
}
