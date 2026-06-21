import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildSchema } from '@/lib/schema-builder';
import { resolveUserIdFromRequest } from '@/lib/user-context';

// POST /api/schema/build
// Body: { nodeIds[], userId?, name? }
// Creates a schema KnowledgeNode with representationType='schema'
// and KnowledgeEdges with relationType='schema_member' to each member node.
export async function POST(req: NextRequest) {
  try {
    const currentUserId = await resolveUserIdFromRequest(req);
    const body = await req.json();
    const { name } = body;
    const nodeIds = Array.isArray(body.nodeIds)
      ? body.nodeIds
      : Array.isArray(body.knowledgeNodeIds)
        ? body.knowledgeNodeIds
        : [];

    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 2) {
      return NextResponse.json(
        { error: '至少需要2个知识点ID（nodeIds数组）' },
        { status: 400 },
      );
    }

    // Cap nodeIds to bound the per-node findUnique lookups inside buildSchema.
    // Without this, a client could send 10,000 ids and degrade the route.
    if (nodeIds.length > 50) {
      return NextResponse.json(
        { error: 'nodeIds 最多 50 个' },
        { status: 400 },
      );
    }

    const result = await buildSchema(nodeIds, null, prisma, currentUserId, name);

    return NextResponse.json({ schema: result });
  } catch (error: unknown) {
    console.error('[Schema Build API] Error:', error);
    const message = getErrorMessage(error);
    return NextResponse.json(
      { error: message },
      { status: message === 'Authentication required' ? 401 : 500 },
    );
  }
}
