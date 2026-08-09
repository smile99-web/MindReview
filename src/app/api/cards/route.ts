import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getErrorMessage } from '@/lib/errors';

const VALID_CARD_TYPES = ['summary', 'formula', 'diagram', 'timeline', 'template', 'mistake', 'worked_example'] as const;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const knowledgeNodeId = searchParams.get('knowledgeNodeId');
    const cardType = searchParams.get('cardType');
    // parseInt 对非数字输入得 NaN，NaN 的 skip/take 会让 Prisma 忽略分页（全表扫描）
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const page = Math.max(1, Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1);
    const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20));

    const where: Record<string, unknown> = {};
    if (knowledgeNodeId) where.knowledgeNodeId = knowledgeNodeId;
    if (cardType && VALID_CARD_TYPES.includes(cardType as typeof VALID_CARD_TYPES[number])) {
      where.cardType = cardType;
    }

    const [cards, total] = await Promise.all([
      prisma.knowledgeCard.findMany({
        where,
        include: {
          knowledgeNode: {
            select: {
              id: true,
              title: true,
              subject: { select: { id: true, name: true, colorClass: true } },
              chapter: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.knowledgeCard.count({ where }),
    ]);

    return NextResponse.json({ cards, total, page, limit });
  } catch (error: unknown) {
    // getErrorMessage 脱敏：Prisma 错误原文含 schema/SQL 片段，不回给客户端
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { knowledgeNodeId, cardType, title, content, imageUrl, audioUrl, sortOrder } = body;

    if (!knowledgeNodeId || !cardType || !title) {
      return NextResponse.json(
        { error: 'knowledgeNodeId, cardType, title are required' },
        { status: 400 },
      );
    }

    if (!VALID_CARD_TYPES.includes(cardType)) {
      return NextResponse.json(
        { error: `cardType must be one of: ${VALID_CARD_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const node = await prisma.knowledgeNode.findUnique({ where: { id: knowledgeNodeId } });
    if (!node) {
      return NextResponse.json({ error: 'KnowledgeNode not found' }, { status: 404 });
    }

    const card = await prisma.knowledgeCard.create({
      data: {
        knowledgeNodeId,
        cardType,
        title,
        content: content || '',
        imageUrl: imageUrl ?? null,
        audioUrl: audioUrl ?? null,
        sortOrder: sortOrder ?? 0,
      },
      include: {
        knowledgeNode: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(card, { status: 201 });
  } catch (error: unknown) {
    // getErrorMessage 脱敏：Prisma 错误原文含 schema/SQL 片段，不回给客户端
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
