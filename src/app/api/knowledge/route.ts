import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// GET /api/knowledge — 获取知识点列表
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get('subjectId');
    const chapterId = searchParams.get('chapterId');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

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

    return NextResponse.json({ nodes, total, page, limit });
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
