import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';
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
    // Use OR of contains queries — exact match (title: {in: [...]})
    // misses nodes generated from exam photos where the title has
    // extra context like '[物理] 热量' vs just '热量'.
    let prerequisiteNodes: { id: string; title: string }[] = [];
    if (node.prerequisites.length > 0) {
      const ors = node.prerequisites
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((p) => ({
          title: { contains: p, mode: 'insensitive' as const },
        }));
      // 限定同学科内匹配：contains 匹配会跨学科误链（如语文的"热量"）
      const prerow = ors.length > 0 ? await prisma.knowledgeNode.findMany({
        where: { OR: ors, subjectId: node.subjectId },
        select: { id: true, title: true },
        take: 20,
      }) : [];
      // Deduplicate and pick the best match per prerequisite:
      // 精确匹配优先，其次才是双向包含；空标题不参与匹配
      for (const pre of node.prerequisites) {
        const p = pre.trim();
        if (!p) continue;
        const match =
          prerow.find((r) => r.title === p) ??
          prerow.find(
            (r) =>
              r.title.trim().length > 0 &&
              (r.title.includes(p) || p.includes(r.title)),
          );
        if (match && !prerequisiteNodes.find((n) => n.id === match.id)) {
          prerequisiteNodes.push(match);
        }
      }
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

// PATCH /api/knowledge/[id] — 更新知识点（管理员）
// 知识点是全站共享内容（见 DELETE 注释）。此前 PATCH 只要求登录：
// 任意用户可篡改全站知识图谱的 title/subjectId/parentId 等结构字段——
// 与 DELETE 必须管理员的策略不对称，同文件补齐。
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const adminDenied = await requireAdmin(req);
    if (adminDenied) return adminDenied;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }

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

    // 字段白名单：body 原样传入会让未知字段触发 Prisma 校验错误（500），
    // 也可能写入调用方本不该控制的列
    const allowedKeys = [
      ...requiredStrings, ...optionalStrings, ...arrayFields,
      ...numberFields, ...dateFields, ...jsonFields,
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        data[key] = body[key];
      }
    }

    // 数值范围钳制：POST 路由专门钳过（注释点名 '★'.repeat(difficulty) 会
    // RangeError），PATCH 此前不钳，-1 / 1e9 入库后下游页面全站崩溃。
    const clampNum = (v: unknown, min: number, max: number) =>
      Math.min(max, Math.max(min, v as number));
    if ('difficulty' in data) data.difficulty = clampNum(data.difficulty, 1, 5);
    if ('cognitiveLoad' in data) data.cognitiveLoad = clampNum(data.cognitiveLoad, 1, 5);
    if ('masteryLevel' in data) data.masteryLevel = clampNum(data.masteryLevel, 0, 100);
    if ('repetitions' in data) data.repetitions = Math.max(0, Math.round(data.repetitions as number));
    if ('easeFactor' in data) data.easeFactor = clampNum(data.easeFactor, 1.3, 5);
    if ('intervalDays' in data) data.intervalDays = clampNum(data.intervalDays, 0, 365);
    if ('forgetRisk' in data) data.forgetRisk = clampNum(data.forgetRisk, 0, 1);

    // 日期字符串合法性：非法日期 Prisma 会抛验证错误（500），提前 400
    for (const key of dateFields) {
      const v = data[key];
      if (v !== undefined && v !== null && Number.isNaN(new Date(v as string).getTime())) {
        return NextResponse.json({ error: `字段 "${key}" 不是合法日期` }, { status: 400 });
      }
    }

    try {
      const node = await prisma.knowledgeNode.update({
        where: { id },
        data: data as Prisma.KnowledgeNodeUpdateInput,
      });
      return NextResponse.json(node);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2025') {
        return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
      }
      if (code === 'P2003') {
        return NextResponse.json({ error: '关联的学科/章节/父节点不存在' }, { status: 400 });
      }
      throw error;
    }
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}

// DELETE /api/knowledge/[id] — 删除知识点（管理员）
// 知识点是全站共享内容：删除会经 onDelete: Cascade 级联删掉所有用户的
// UserKnowledgeProgress / ReviewTask / Mistake 关联，必须要求管理员。
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const adminDenied = await requireAdmin(req);
    if (adminDenied) return adminDenied;
    await prisma.knowledgeNode.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}
