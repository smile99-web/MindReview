import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// GET /api/chapters?subjectId=xxx — 获取章节列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');

    const where: Prisma.ChapterWhereInput = {};
    if (subjectId) where.subjectId = subjectId;

    const chapters = await prisma.chapter.findMany({
      where,
      include: {
        _count: { select: { knowledgeNodes: true } },
        children: true,
        // Expose each knowledge node's gradeLevel so the subjects
        // page can group chapters by 七年级上/下/... (the LLM tags
        // each node when generating the textbook). Pick the most
        // common gradeLevel per chapter for the grouping key.
        knowledgeNodes: {
          select: { gradeLevel: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(chapters);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// POST /api/chapters — 创建章节
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // --- validation ---
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      return NextResponse.json({ error: 'title 是必填字段，必须为非空字符串' }, { status: 400 });
    }
    if (typeof body.subjectId !== 'string' || body.subjectId.trim() === '') {
      return NextResponse.json({ error: 'subjectId 是必填字段，必须为非空字符串' }, { status: 400 });
    }
    if (body.parentId !== undefined && body.parentId !== null && typeof body.parentId !== 'string') {
      return NextResponse.json({ error: 'parentId 必须是字符串' }, { status: 400 });
    }
    if (body.sortOrder !== undefined && body.sortOrder !== null && typeof body.sortOrder !== 'number') {
      return NextResponse.json({ error: 'sortOrder 必须是数字' }, { status: 400 });
    }
    // --- end validation ---

    // parentId 存在性校验：不存在的 parentId 会触发 FK 违例变 500，应返回 400
    if (body.parentId) {
      const parent = await prisma.chapter.findUnique({ where: { id: body.parentId }, select: { id: true } });
      if (!parent) {
        return NextResponse.json({ error: 'parentId 对应的章节不存在' }, { status: 400 });
      }
    }

    // 防止重复创建同名章节
    const existing = await prisma.chapter.findFirst({
      where: {
        subjectId: body.subjectId,
        title: body.title.trim(),
        parentId: body.parentId ?? null,
      },
    });
    if (existing) {
      return NextResponse.json(existing);
    }

    // 显式构造 data：不能把原始 body 传给 create（mass assignment 可注入
    // id/knowledgeNodes 等任意字段）；入库与查重统一用 trim 后的标题
    const chapter = await prisma.chapter.create({
      data: {
        title: body.title.trim(),
        subjectId: body.subjectId,
        parentId: body.parentId ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return NextResponse.json(chapter);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
