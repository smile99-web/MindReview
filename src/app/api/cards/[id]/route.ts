import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/cards/[id] — 获取单个卡片（含知识点详情）
//
// KnowledgeCard 是 shared knowledge graph 的一部分，无 userId 字段。
// 任何登录用户都能读（卡片内容是教学素材，不是私人数据）。
//
// PATCH / DELETE handler 之前是死代码（无前端调用）且无 ownership
// check（IDOR 风险）。已经删除；如需恢复编辑功能，先给 KnowledgeCard
// 加 createdBy 字段 + migration，再加 auth + ownership 校验。
export async function GET(
  _req: NextRequest,
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
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
