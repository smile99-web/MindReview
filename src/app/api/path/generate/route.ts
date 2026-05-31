import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePath, checkPrerequisites, type PrerequisiteCheck } from '@/lib/learning-path';
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
    const body = await req.json();
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
    const effectiveMaxSteps = maxSteps && maxSteps > 0 ? maxSteps : 20;

    const path = await generatePath(
      userId,
      subjectId,
      effectiveMaxSteps,
      prisma,
    );

    // --- Prerequisite gating: check each step ---
    const blockedNodes: {
      nodeId: string;
      title: string;
      blockedBy: PrerequisiteCheck['blockedBy'];
    }[] = [];

    const stepsWithLocks = await Promise.all(
      path.steps.map(async (step) => {
        const check = await checkPrerequisites(step.nodeId, userId, prisma, 60);
        if (!check.canAccess) {
          blockedNodes.push({
            nodeId: step.nodeId,
            title: step.title,
            blockedBy: check.blockedBy,
          });
          return { ...step, locked: true };
        }
        return { ...step, locked: false };
      }),
    );

    const gatedPath = {
      ...path,
      steps: stepsWithLocks,
    };

    return NextResponse.json({ path: gatedPath, blockedNodes });
  } catch (error: any) {
    console.error('[path/generate POST]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
