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

    // Build the where clause with proper schema filtering
    const conditions: any[] = [];
    if (subjectId || chapterId || rootId) {
      conditions.push({ ...baseWhere });
    }
    if (includeSchemas) {
      conditions.push({ representationType: 'schema' });
    }

    let where: any;
    if (conditions.length === 0) {
      where = includeSchemas
        ? { representationType: 'schema' }
        : { representationType: { not: 'schema' } };
    } else if (conditions.length === 1) {
      where = conditions[0];
      // If we have subjectId/chapterId/rootId but not includeSchemas, exclude schemas
      if (!includeSchemas) {
        where = { ...where, representationType: { not: 'schema' } };
      }
    } else {
      where = { OR: conditions };
    }

    const nodes = await prisma.knowledgeNode.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true } },
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

    // Validate required fields
    if (typeof body.fromId !== 'string' || body.fromId.trim() === '') {
      return NextResponse.json({ error: 'fromId 必须是非空字符串' }, { status: 400 });
    }
    if (typeof body.toId !== 'string' || body.toId.trim() === '') {
      return NextResponse.json({ error: 'toId 必须是非空字符串' }, { status: 400 });
    }
    if (typeof body.relationType !== 'string' || body.relationType.trim() === '') {
      return NextResponse.json({ error: 'relationType 必须是非空字符串' }, { status: 400 });
    }
    // Validate optional field type if present
    if (body.label !== undefined && body.label !== null && typeof body.label !== 'string') {
      return NextResponse.json({ error: 'label 必须是字符串' }, { status: 400 });
    }

    const edge = await prisma.knowledgeEdge.create({ data: body });
    return NextResponse.json(edge);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
