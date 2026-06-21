import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { loadProgressByNodeId } from '@/lib/user-knowledge-progress';
import type { Prisma } from '@prisma/client';

// GET /api/knowledge — 获取知识点列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');
    const chapterId = searchParams.get('chapterId');
    const search = searchParams.get('search');
    // Guard against `?page=abc` / `?limit=abc` — parseInt('abc') is NaN,
    // and Prisma silently ignores skip/take:NaN, returning the entire table.
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;

    const where: Prisma.KnowledgeNodeWhereInput = {};
    if (subjectId) where.subjectId = subjectId;
    if (chapterId) where.chapterId = chapterId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [nodes, total] = await Promise.all([
      prisma.knowledgeNode.findMany({
        where,
        include: {
          chapter: { select: { id: true, title: true } },
          subject: { select: { id: true, name: true } },
          _count: { select: { questions: true, knowledgeCards: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.knowledgeNode.count({ where }),
    ]);

    // 用当前用户真实进度覆盖 KnowledgeNode.masteryLevel（默认 0），否则学过也显示 0%。
    let progressByNodeId: Map<string, { masteryLevel: number }> | undefined;
    try {
      const userId = await resolveUserIdFromRequest(req);
      progressByNodeId = await loadProgressByNodeId(
        userId,
        nodes.map((n) => n.id),
        prisma,
      );
    } catch {
      // 未登录或 resolveUserId 失败：保持原 masteryLevel（默认 0）
    }

    const nodesWithRealMastery = nodes.map((node) => {
      const real = progressByNodeId?.get(node.id)?.masteryLevel;
      return real != null && real > node.masteryLevel
        ? { ...node, masteryLevel: real }
        : node;
    });

    return NextResponse.json({ nodes: nodesWithRealMastery, total, page, limit });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// POST /api/knowledge — 手动创建知识点
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validation: subjectId and title are required
    if (!body.subjectId || typeof body.subjectId !== 'string' || body.subjectId.trim().length === 0) {
      return NextResponse.json({ error: 'subjectId is required and must be a non-empty string' }, { status: 400 });
    }
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json({ error: 'title is required and must be a non-empty string' }, { status: 400 });
    }

    const node = await prisma.knowledgeNode.create({ data: body });
    return NextResponse.json(node);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
