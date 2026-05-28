import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildSchema } from '@/lib/schema-builder';

// POST /api/schema/build
// Body: { nodeIds[], userId?, name? }
// Creates a schema KnowledgeNode with representationType='schema'
// and KnowledgeEdges with relationType='schema_member' to each member node.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeIds, userId, name } = body;

    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length < 2) {
      return NextResponse.json(
        { error: '至少需要2个知识点ID（nodeIds数组）' },
        { status: 400 },
      );
    }

    const result = await buildSchema(nodeIds, null, prisma, userId, name);

    return NextResponse.json({ schema: result });
  } catch (error: any) {
    console.error('[Schema Build API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
