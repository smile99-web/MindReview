import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserId } from '@/lib/server-auth';

// GET /api/chat/[id] — 拉取单个会话的完整消息
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: '缺少会话 id' }, { status: 400 });
  }

  try {
    const conversation = await prisma.chatConversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            imageUrl: true,
            imagePrompt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    }
    if (conversation.userId !== userId) {
      return NextResponse.json({ error: '无权访问该会话' }, { status: 403 });
    }

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      knowledgeNodeId: conversation.knowledgeNodeId,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        imageUrl: m.imageUrl,
        imagePrompt: m.imagePrompt,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: `加载会话失败: ${getErrorMessage(err)}` }, { status: 500 });
  }
}

// DELETE /api/chat/[id] — 删除会话
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: '未登录或会话已过期' }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: '缺少会话 id' }, { status: 400 });
  }

  try {
    const existing = await prisma.chatConversation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: '无权访问该会话' }, { status: 403 });
    }

    await prisma.chatConversation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: `删除会话失败: ${getErrorMessage(err)}` }, { status: 500 });
  }
}