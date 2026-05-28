import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePath } from '@/lib/learning-path';
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
 * Response:
 * {
 *   path: {
 *     pathId: string,
 *     steps: [{ nodeId, title, icapLevel, estimatedMinutes, masteryLevel, difficulty, summary }],
 *     totalSteps: number,
 *     totalEstimatedMinutes: number,
 *     subjectId: string,
 *     createdAt: string
 *   }
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

    return NextResponse.json({ path });
  } catch (error: any) {
    console.error('[path/generate POST]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
