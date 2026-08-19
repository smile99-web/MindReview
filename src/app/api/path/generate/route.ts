import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePath, batchCheckPrerequisites, type PrerequisiteCheck } from '@/lib/learning-path';
import { resolveUserIdFromRequest } from '@/lib/user-context';

/**
 * POST /api/path/generate
 *
 * Generates an optimal learning path for a user within a subject.
 *
 * Body: { subjectId: string, maxSteps?: number }
 * The userId is resolved from the JWT Authorization header.
 *
 * The path respects prerequisite chains (topological sort), sorts by
 * difficulty and mastery level, and assigns appropriate ICAP levels.
 *
 * Nodes whose prerequisites have masteryLevel < 60 are marked as locked
 * and listed in blockedNodes.
 *
 * Response:
 * {
 *   path: {
 *     pathId: string,
 *     steps: [{ nodeId, title, icapLevel, estimatedMinutes, masteryLevel, difficulty, summary, locked?: boolean }],
 *     totalSteps: number,
 *     totalEstimatedMinutes: number,
 *     subjectId: string,
 *     createdAt: string
 *   },
 *   blockedNodes: [{ nodeId, title, blockedBy: [{ nodeId, title, masteryLevel, requiredLevel }] }]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const { subjectId, maxSteps } = body;

    // --- Resolve userId from JWT token (with DB fallback) ---
    const userId = await resolveUserIdFromRequest(req);

    // --- Validation ---
    if (!subjectId) {
      return NextResponse.json(
        { error: 'subjectId is required' },
        { status: 400 },
      );
    }

    // Validate subject exists
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true },
    });

    if (!subject) {
      return NextResponse.json(
        { error: `Subject "${subjectId}" not found` },
        { status: 404 },
      );
    }

    // --- Generate path ---
    // maxSteps 上限 50：防止异常大值生成过长路径、放大后续查询压力
    const effectiveMaxSteps = maxSteps && maxSteps > 0 ? Math.min(maxSteps, 50) : 20;

    const path = await generatePath(
      userId,
      subjectId,
      prisma,
      effectiveMaxSteps,
    );

    // --- Prerequisite gating: 批量检查（一次取边 + 内存 BFS，避免逐步查询的 N+1） ---
    const blockedNodes: {
      nodeId: string;
      title: string;
      blockedBy: PrerequisiteCheck['blockedBy'];
    }[] = [];

    // scope 限定为路径涉及的节点，只加载相关 prerequisite 边
    const stepNodeIds = path.steps.map((step) => step.nodeId);
    const checks = await batchCheckPrerequisites(stepNodeIds, userId, prisma, 60, stepNodeIds);

    const stepsWithLocks = path.steps.map((step) => {
      const check = checks[step.nodeId];
      if (!check.canAccess) {
        blockedNodes.push({
          nodeId: step.nodeId,
          title: step.title,
          blockedBy: check.blockedBy,
        });
        return { ...step, locked: true };
      }
      return { ...step, locked: false };
    });

    const gatedPath = {
      ...path,
      steps: stepsWithLocks,
    };

    return NextResponse.json({ path: gatedPath, blockedNodes });
  } catch (error: unknown) {
    console.error('[path/generate POST]', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: getErrorStatus(error) },
    );
  }
}
