import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/chapters?subjectId=xxx — 获取章节列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');

    const where: any = {};
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/chapters — 创建章节
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const chapter = await prisma.chapter.create({ data: body });
    return NextResponse.json(chapter);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
