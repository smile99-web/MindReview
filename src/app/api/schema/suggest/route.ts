import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { suggestSchemaNodes } from '@/lib/schema-builder';

// POST /api/schema/suggest
// Body: { seedNodeId: string }
// Returns: { suggestions: [{ nodeIds: string[], rationale: string }] }
//
// Wires up the previously-unused suggestSchemaNodes function in
// src/lib/schema-builder.ts. The /schemas page previously only
// accepted arbitrary user-picked nodes (defeating the 'AI identifies
// the schema' promise). With this route, the UI can offer 'AI 推荐'
// as an alternative starting point.
//
// GET /api/schema/suggest?knowledgeNodeId=xxx
// Returns: { suggestions: [{ id, title, summary, nodesCount }] }
// 卡片页"图式"区用：列出已包含该知识点的现有图式（schema_member 边）。
// 之前卡片页用 GET 调用此路由，路由只有 POST → 405，图式区永远空白。
export async function GET(req: NextRequest) {
  try {
    await resolveUserIdFromRequest(req);

    const nodeId = new URL(req.url).searchParams.get('knowledgeNodeId')?.trim() || '';
    if (!nodeId) {
      return NextResponse.json(
        { error: 'knowledgeNodeId is required' },
        { status: 400 },
      );
    }

    // 找到与该节点相连的所有 schema 节点
    const memberEdges = await prisma.knowledgeEdge.findMany({
      where: {
        relationType: 'schema_member',
        OR: [{ fromId: nodeId }, { toId: nodeId }],
      },
      select: { fromId: true, toId: true },
    });
    const schemaIds = Array.from(new Set(
      memberEdges.map((e) => (e.fromId === nodeId ? e.toId : e.fromId)),
    ));
    if (schemaIds.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const schemaNodes = await prisma.knowledgeNode.findMany({
      where: { id: { in: schemaIds }, representationType: 'schema' },
      select: { id: true, title: true, summary: true },
    });

    // 每个图式的成员数（边方向不敏感）
    const allMemberEdges = await prisma.knowledgeEdge.findMany({
      where: {
        relationType: 'schema_member',
        OR: [{ fromId: { in: schemaNodes.map((s) => s.id) } }, { toId: { in: schemaNodes.map((s) => s.id) } }],
      },
      select: { fromId: true, toId: true },
    });
    const schemaIdSet = new Set(schemaNodes.map((s) => s.id));
    const countById = new Map<string, number>();
    for (const e of allMemberEdges) {
      if (schemaIdSet.has(e.fromId) && e.fromId !== e.toId) {
        countById.set(e.fromId, (countById.get(e.fromId) || 0) + 1);
      } else if (schemaIdSet.has(e.toId)) {
        countById.set(e.toId, (countById.get(e.toId) || 0) + 1);
      }
    }

    return NextResponse.json({
      suggestions: schemaNodes.map((s) => ({
        id: s.id,
        title: s.title,
        summary: s.summary,
        nodesCount: countById.get(s.id) || 0,
      })),
    });
  } catch (error: unknown) {
    console.error('[schema/suggest] GET Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Auth gate — this route is read-only but still behind auth.
    await resolveUserIdFromRequest(req);

    const body = (await req.json()) as { seedNodeId?: unknown };
    const seedNodeId = typeof body.seedNodeId === 'string' ? body.seedNodeId.trim() : '';
    if (!seedNodeId) {
      return NextResponse.json(
        { error: 'seedNodeId is required' },
        { status: 400 },
      );
    }

    const suggestions = await suggestSchemaNodes(seedNodeId, prisma);
    return NextResponse.json({ suggestions });
  } catch (error: unknown) {
    console.error('[schema/suggest] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
