import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';

// PATCH /api/mistakes/[id] — 切换错题解决状态
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await resolveUserIdFromRequest(req);
    const body = await req.json();
    const { resolved } = body;

    // 验证错题属于当前用户
    const existing = await prisma.mistake.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '错题不存在' }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: '无权操作此错题' }, { status: 403 });
    }

    const mistake = await prisma.mistake.update({
      where: { id },
      data: { resolved },
    });

    return NextResponse.json(mistake);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/mistakes/[id] — 删除错题
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await resolveUserIdFromRequest(req);

    const existing = await prisma.mistake.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '错题不存在' }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: '无权操作此错题' }, { status: 403 });
    }

    await prisma.mistake.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
