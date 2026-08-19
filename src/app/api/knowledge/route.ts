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
      // 用户进度存在时一律采用（含下降）：max 合并会让遗忘后的
      // 掌握度永远停在历史峰值，显示失真
      return real != null ? { ...node, masteryLevel: real } : node;
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

    // 字段白名单：body 原样传给 create 可注入嵌套关系写——children.connect
    // 会改写共享知识图谱中任意节点的 parentId，outgoingEdges.create 可注入
    // 边（PATCH 路由已有白名单，POST 漏修）。只允许内容型标量列。
    const data: Record<string, unknown> = {
      subjectId: body.subjectId.trim(),
      title: body.title.trim(),
    };
    const optionalStrings = ['summary', 'chapterId', 'parentId', 'gradeLevel', 'icapLevel', 'representationType'];
    for (const key of optionalStrings) {
      if (typeof body[key] === 'string') data[key] = body[key];
    }
    const arrayFields = ['keywords', 'prerequisites', 'commonMistakes', 'typicalQuestions'];
    for (const key of arrayFields) {
      if (Array.isArray(body[key])) {
        data[key] = body[key].filter((v: unknown) => typeof v === 'string');
      }
    }
    // 数值字段逐字段钳制到合法区间——仅验 Number.isFinite 会让 -1 / 1e9
    // 入库，chapters 页 '★'.repeat(difficulty) 直接崩溃
    if (typeof body.difficulty === 'number' && Number.isFinite(body.difficulty)) {
      data.difficulty = Math.max(1, Math.min(5, Math.round(body.difficulty)));
    }
    if (typeof body.cognitiveLoad === 'number' && Number.isFinite(body.cognitiveLoad)) {
      data.cognitiveLoad = Math.max(1, Math.min(5, Math.round(body.cognitiveLoad)));
    }
    if (typeof body.masteryLevel === 'number' && Number.isFinite(body.masteryLevel)) {
      data.masteryLevel = Math.max(0, Math.min(100, Math.round(body.masteryLevel)));
    }
    if (typeof body.repetitions === 'number' && Number.isFinite(body.repetitions)) {
      data.repetitions = Math.max(0, Math.round(body.repetitions));
    }
    if (typeof body.intervalDays === 'number' && Number.isFinite(body.intervalDays)) {
      data.intervalDays = Math.max(0, Math.round(body.intervalDays));
    }
    if (typeof body.easeFactor === 'number' && Number.isFinite(body.easeFactor)) {
      data.easeFactor = Math.max(1.3, Math.min(3.0, body.easeFactor));
    }
    if (
      body.representationData &&
      typeof body.representationData === 'object' &&
      !Array.isArray(body.representationData)
    ) {
      data.representationData = body.representationData;
    }

    // key 均在上方白名单内，断言为 Unchecked 标量输入是安全的
    const node = await prisma.knowledgeNode.create({
      data: data as Prisma.KnowledgeNodeUncheckedCreateInput,
    });
    return NextResponse.json(node);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
