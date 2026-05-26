import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/cards/[id] — 获取单个卡片（含知识点详情）
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const card = await prisma.knowledgeCard.findUnique({
      where: { id },
      include: {
        knowledgeNode: {
          include: {
            subject: true,
            chapter: true,
            knowledgeCards: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!card) {
      return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/cards/[id] — 更新卡片
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // 检查卡片是否存在
    const existing = await prisma.knowledgeCard.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
    }

    // 如果更新 cardType，验证合法值
    if (body.cardType) {
      const validCardTypes = ['summary', 'formula', 'diagram', 'timeline', 'template', 'mistake'];
      if (!validCardTypes.includes(body.cardType)) {
        return NextResponse.json(
          { error: `cardType 必须为以下值之一: ${validCardTypes.join(', ')}` },
          { status: 400 },
        );
      }
    }

    // 如果更新 knowledgeNodeId，验证知识点存在
    if (body.knowledgeNodeId) {
      const knowledgeNode = await prisma.knowledgeNode.findUnique({
        where: { id: body.knowledgeNodeId },
      });
      if (!knowledgeNode) {
        return NextResponse.json(
          { error: '关联的知识点不存在' },
          { status: 400 },
        );
      }
    }

    // 构建更新数据，只包含允许的字段
    const data: any = {};
    if (body.knowledgeNodeId !== undefined) data.knowledgeNodeId = body.knowledgeNodeId;
    if (body.cardType !== undefined) data.cardType = body.cardType;
    if (body.title !== undefined) data.title = body.title;
    if (body.content !== undefined) data.content = body.content;
    if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
    if (body.audioUrl !== undefined) data.audioUrl = body.audioUrl;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    const card = await prisma.knowledgeCard.update({
      where: { id },
      data,
      include: {
        knowledgeNode: {
          select: { id: true, title: true },
        },
      },
    });

    return NextResponse.json(card);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/cards/[id] — 删除卡片
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const existing = await prisma.knowledgeCard.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
    }

    await prisma.knowledgeCard.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
