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

    const chapter = await prisma.chapter.create({ data: body });
    return NextResponse.json(chapter);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
