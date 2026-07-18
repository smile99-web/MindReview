import { getErrorMessage } from '@/lib/errors';
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
    // nodeIds 上限：批量检查会按入参规模加载 prerequisite 边，无上限可被放大成资源问题
    if (nodeIds.length > 100 || !nodeIds.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'nodeIds 最多 100 个且必须为字符串' }, { status: 400 });
    }

    const userId = await resolveUserIdFromRequest(req);

    const results = await batchCheckPrerequisites(nodeIds, userId, prisma);

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('[path/prerequisites POST]', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: 500 },
    );
  }
}
