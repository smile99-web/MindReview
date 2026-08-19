import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/require-admin';

// GET /api/chapters/[id] — 获取单个章节详情
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      include: {
        _count: { select: { knowledgeNodes: true, children: true } },
      },
    });

    if (!chapter) {
      return NextResponse.json({ error: '章节不存在' }, { status: 404 });
    }

    return NextResponse.json(chapter);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // 章节是全站共享内容，删除会改写所有节点归属，必须管理员
    const adminDenied = await requireAdmin(req);
    if (adminDenied) return adminDenied;

    const chapter = await prisma.chapter.findUnique({ where: { id } });
    if (!chapter) {
      return NextResponse.json({ error: '章节不存在' }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.knowledgeNode.updateMany({ where: { chapterId: id }, data: { chapterId: null } }),
      prisma.chapter.updateMany({ where: { parentId: id }, data: { parentId: null } }),
      prisma.chapter.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: message === 'Authentication required' ? 401 : 500 });
  }
}
