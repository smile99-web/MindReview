import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

const nonSchemaNodeConditions: Prisma.KnowledgeNodeWhereInput[] = [
  { representationType: null },
  { representationType: { not: 'schema' } },
];

// GET /api/mindmap?subjectId=xxx&chapterId=xxx — 获取思维导图数据
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');
    const chapterId = searchParams.get('chapterId');
    const rootId = searchParams.get('rootId');
    const includeSchemas = searchParams.get('includeSchemas') === 'true';

    const baseWhere: Prisma.KnowledgeNodeWhereInput = {};
    if (subjectId) baseWhere.subjectId = subjectId;
    if (chapterId) baseWhere.chapterId = chapterId;
    if (rootId) baseWhere.parentId = rootId;

    // Build the where clause with proper schema filtering.
    // 注意：schema 节点创建时就带 subjectId（schema-builder.ts），所以 baseWhere
    // 本身就包含本学科的 schema。之前 includeSchemas=true 会额外追加一个
    // 无学科限定的 OR 分支，把全库其他学科的 schema 也混进思维导图。
    const hasScope = Boolean(subjectId || chapterId || rootId);
    let where: Prisma.KnowledgeNodeWhereInput;
    if (hasScope) {
      where = includeSchemas
        ? { ...baseWhere }
        : { ...baseWhere, OR: nonSchemaNodeConditions };
    } else {
      where = includeSchemas
        ? { representationType: 'schema' }
        : { OR: nonSchemaNodeConditions };
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
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// POST /api/mindmap/edge — 创建关系
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'generate-relations') {
      const subjectId = typeof body.subjectId === 'string' ? body.subjectId.trim() : '';
      const chapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';

      if (!subjectId && !chapterId) {
        return NextResponse.json({ error: 'subjectId 或 chapterId 至少需要一个' }, { status: 400 });
      }

      const where: Prisma.KnowledgeNodeWhereInput = {
        OR: nonSchemaNodeConditions,
      };
      if (subjectId) where.subjectId = subjectId;
      if (chapterId) where.chapterId = chapterId;

      const nodes = await prisma.knowledgeNode.findMany({
        where,
        select: {
          id: true,
          title: true,
          chapterId: true,
          createdAt: true,
        },
        orderBy: [
          { chapterId: 'asc' },
          { createdAt: 'asc' },
        ],
      });

      const byChapter = new Map<string, typeof nodes>();
      for (const node of nodes) {
        const key = node.chapterId || 'uncategorized';
        byChapter.set(key, [...(byChapter.get(key) || []), node]);
      }

      let created = 0;
      for (const chapterNodes of byChapter.values()) {
        for (let index = 0; index < chapterNodes.length - 1; index += 1) {
          const fromNode = chapterNodes[index];
          const toNode = chapterNodes[index + 1];
          const existing = await prisma.knowledgeEdge.findFirst({
            where: {
              fromId: fromNode.id,
              toId: toNode.id,
              relationType: 'prerequisite',
            },
          });

          if (!existing) {
            await prisma.knowledgeEdge.create({
              data: {
                fromId: fromNode.id,
                toId: toNode.id,
                relationType: 'prerequisite',
                label: `${fromNode.title} → ${toNode.title}`,
              },
            });
            created += 1;
          }
        }
      }

      return NextResponse.json({
        success: true,
        created,
        nodeCount: nodes.length,
      });
    }

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
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
