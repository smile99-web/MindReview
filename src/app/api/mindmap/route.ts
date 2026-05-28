import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/mindmap?subjectId=xxx&chapterId=xxx — 获取思维导图数据
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');
    const chapterId = searchParams.get('chapterId');
    const rootId = searchParams.get('rootId');
    const includeSchemas = searchParams.get('includeSchemas') === 'true';

    const baseWhere: any = {};
    if (subjectId) baseWhere.subjectId = subjectId;
    if (chapterId) baseWhere.chapterId = chapterId;
    if (rootId) baseWhere.parentId = rootId;

    // When includeSchemas is true, also include schema nodes
    const nodeFilters = Object.keys(baseWhere).length > 0
      ? [{ ...baseWhere }]
      : [];
    if (includeSchemas) {
      nodeFilters.push({ representationType: 'schema' });
    }
    const where = nodeFilters.length > 1
      ? { OR: nodeFilters }
      : (nodeFilters.length === 1 ? nodeFilters[0] : {});

    const nodes = await prisma.knowledgeNode.findMany({
      where,
      include: {
        chapter: { select: { id: true, title: true } },
        children: { select: { id: true } },
      },
    });

    // 获取所有边
    const nodeIds = nodes.map((n: { id: string }) => n.id);
    const edges = await prisma.knowledgeEdge.findMany({
      where: {
        OR: [
          { fromId: { in: nodeIds } },
          { toId: { in: nodeIds } },
        ],
      },
    });

    return NextResponse.json({ nodes, edges });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/mindmap/edge — 创建关系
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const edge = await prisma.knowledgeEdge.create({ data: body });
    return NextResponse.json(edge);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
