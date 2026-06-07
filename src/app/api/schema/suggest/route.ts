import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { suggestSchemaNodes } from '@/lib/schema-builder';

// GET /api/schema/suggest?knowledgeNodeId=xxx
// Returns schema suggestions for nodes related to the given knowledge node.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const knowledgeNodeId = searchParams.get('knowledgeNodeId');

    if (!knowledgeNodeId) {
      return NextResponse.json(
        { error: '缺少参数 knowledgeNodeId' },
        { status: 400 },
      );
    }

    // Verify the node exists
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: knowledgeNodeId },
      select: { id: true, title: true },
    });

    if (!node) {
      return NextResponse.json(
        { error: `知识点 ${knowledgeNodeId} 不存在` },
        { status: 404 },
      );
    }

    const suggestions = await suggestSchemaNodes(knowledgeNodeId, prisma);

    return NextResponse.json({ suggestions });
  } catch (error: unknown) {
    console.error('[Schema Suggest API] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
