import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import type { Prisma } from '@prisma/client';

const nonSchemaNodeConditions: Prisma.KnowledgeNodeWhereInput[] = [
  { representationType: null },
  { representationType: { not: 'schema' } },
];

// GET /api/knowledge/[id] — 获取单个知识点详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await resolveUserIdFromRequest(req);
    const node = await prisma.knowledgeNode.findUnique({
      where: { id },
      include: {
        subject: true,
        chapter: true,
        parent: true,
        children: true,
        knowledgeCards: { orderBy: { sortOrder: 'asc' } },
        questions: true,
        outgoingEdges: { include: { to: true } },
        incomingEdges: { include: { from: true } },
        mistakes: { where: { userId } },
      },
    });

    if (!node) {
      return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
    }

    // 取出当前用户对该知识点的学习完成度（可能不存在）
    const progress = await prisma.userKnowledgeProgress.findUnique({
      where: { userId_knowledgeNodeId: { userId, knowledgeNodeId: id } },
      select: {
        readCompletedAt: true,
        practicedCompletedAt: true,
        constructiveCompletedAt: true,
        interactiveCompletedAt: true,
      },
    });

    const siblingWhere: Prisma.KnowledgeNodeWhereInput = {
      subjectId: node.subjectId,
      OR: nonSchemaNodeConditions,
    };
    if (node.chapterId) {
      siblingWhere.chapterId = node.chapterId;
    }

    const siblings = await prisma.knowledgeNode.findMany({
      where: siblingWhere,
      select: {
        id: true,
        title: true,
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    const currentIndex = siblings.findIndex((item) => item.id === node.id);
    const scopeLabel = node.chapter?.title || node.subject?.name || '当前知识范围';
    const navigation = currentIndex >= 0
      ? {
          previous: currentIndex > 0 ? siblings[currentIndex - 1] : null,
          next: currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null,
          index: currentIndex + 1,
          total: siblings.length,
          scopeLabel,
        }
      : {
          previous: null,
          next: null,
          index: 0,
          total: siblings.length,
          scopeLabel,
        };

    // Resolve prerequisite titles to node IDs so the frontend can
    // render clickable links instead of just text.
    let prerequisiteNodes: { id: string; title: string }[] = [];
    if (node.prerequisites.length > 0) {
      const prerow = await prisma.knowledgeNode.findMany({
        where: { title: { in: node.prerequisites } },
        select: { id: true, title: true },
        take: 20,
      });
      prerequisiteNodes = prerow;
    }

    return NextResponse.json({
      ...node,
      navigation,
      prerequisiteNodes,
      readCompletedAt: progress?.readCompletedAt ?? null,
      practicedCompletedAt: progress?.practicedCompletedAt ?? null,
      constructiveCompletedAt: progress?.constructiveCompletedAt ?? null,
      interactiveCompletedAt: progress?.interactiveCompletedAt ?? null,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}

// PATCH /api/knowledge/[id] — 更新知识点
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await resolveUserIdFromRequest(req);
    const body = await req.json();

    // --- input validation ---
    const requiredStrings = ['title', 'subjectId', 'icapLevel'];
    const optionalStrings = ['summary', 'chapterId', 'parentId', 'representationType'];
    const arrayFields = ['keywords', 'prerequisites', 'commonMistakes', 'typicalQuestions'];
    const numberFields = ['difficulty', 'cognitiveLoad', 'masteryLevel', 'repetitions', 'easeFactor', 'intervalDays', 'forgetRisk'];
    const dateFields = ['nextReviewAt', 'lastReviewAt'];
    const jsonFields = ['representationData'];

    for (const [key, value] of Object.entries(body)) {
      if (requiredStrings.includes(key)) {
        if (typeof value !== 'string' || value.trim() === '') {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是非空字符串` },
            { status: 400 },
          );
        }
      } else if (optionalStrings.includes(key)) {
        if (value !== null && value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是字符串` },
            { status: 400 },
          );
        }
      } else if (arrayFields.includes(key)) {
        if (!Array.isArray(value)) {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是数组` },
            { status: 400 },
          );
        }
      } else if (numberFields.includes(key)) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是数字` },
            { status: 400 },
          );
        }
      } else if (dateFields.includes(key)) {
        if (value !== null && value !== undefined && typeof value !== 'string') {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是日期字符串` },
            { status: 400 },
          );
        }
      } else if (jsonFields.includes(key)) {
        if (value !== null && value !== undefined && (typeof value !== 'object' || Array.isArray(value))) {
          return NextResponse.json(
            { error: `字段 "${key}" 必须是 JSON 对象` },
            { status: 400 },
          );
        }
      }
    }
    // --- end validation ---

    const node = await prisma.knowledgeNode.update({
      where: { id },
      data: body,
    });

    return NextResponse.json(node);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}

// DELETE /api/knowledge/[id] — 删除知识点
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await resolveUserIdFromRequest(req);
    await prisma.knowledgeNode.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}
