import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id } = await params;
    const tb = await prisma.textbookUpload.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        fileName: true,
        fileType: true,
        content: true,
        subjectId: true,
        decomposedChapters: true,
        chapterImports: true,
        createdAt: true,
        updatedAt: true,
        subject: { select: { id: true, name: true, icon: true } },
      },
    });
    if (!tb) {
      return NextResponse.json({ error: '教材不存在' }, { status: 404 });
    }
    if (tb.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }
    return NextResponse.json(tb);
  } catch (error: unknown) {
    console.error('[textbook/get] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id } = await params;
    const tb = await prisma.textbookUpload.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!tb) {
      return NextResponse.json({ error: '教材不存在' }, { status: 404 });
    }
    if (tb.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }
    await prisma.textbookUpload.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[textbook/delete] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
