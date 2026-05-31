import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { batchCheckPrerequisites } from '@/lib/learning-path';
import { resolveUserIdFromRequest } from '@/lib/user-context';

/**
 * POST /api/path/prerequisites
 *
 * Batch prerequisite check for multiple knowledge nodes.
 *
 * Body: { nodeIds: string[] }
 *
 * Returns a map of nodeId -> PrerequisiteCheck.
 *
 * Response:
 * {
 *   results: {
 *     "<nodeId>": {
 *       canAccess: boolean,
 *       blockedBy: [{ nodeId, title, masteryLevel, requiredLevel }]
 *     }
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeIds } = body;

    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      return NextResponse.json({ results: {} });
    }

    const userId = await resolveUserIdFromRequest(req);

    const results = await batchCheckPrerequisites(nodeIds, userId, prisma);

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('[path/prerequisites POST]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
