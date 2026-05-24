import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/knowledge/[id] — 获取单个知识点详情
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
        mistakes: true,
      },
    });

    if (!node) {
      return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
    }

    return NextResponse.json(node);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/knowledge/[id] — 更新知识点
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const node = await prisma.knowledgeNode.update({
      where: { id },
      data: body,
    });

    return NextResponse.json(node);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/knowledge/[id] — 删除知识点
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.knowledgeNode.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
