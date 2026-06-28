import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await resolveUserIdFromRequest(_req);
    const { id } = await params;
    const doc = await prisma.docUpload.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        fileName: true,
        subjectName: true,
        content: true,
        knowledgePoints: true,
        practiceQuestions: true,
        userNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!doc) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (doc.userId !== (await resolveUserIdFromRequest(_req))) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }
    return NextResponse.json(doc);
  } catch (error: unknown) {
    console.error('[doc/get] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const { id } = await params;
    const doc = await prisma.docUpload.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!doc) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (doc.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      userNotes?: unknown;
    };
    const data: { userNotes?: string } = {};
    if (typeof body.userNotes === 'string') {
      data.userNotes = body.userNotes;
    }

    const updated = await prisma.docUpload.update({
      where: { id },
      data,
      select: { id: true, userNotes: true, updatedAt: true },
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[doc/patch] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

// DELETE /api/doc/[id]
// Removes the user's doc upload + parses text + analysis +
// practice questions. Same idempotent-marker pattern as exam
// delete: unlinks any KnowledgeNode that was created from this doc.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id } = await params;
    const doc = await prisma.docUpload.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!doc) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (doc.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const linkedNodes = await prisma.knowledgeNode.findMany({
      where: { keywords: { has: `doc:${id}` } },
      select: { id: true, keywords: true },
    });
    for (const node of linkedNodes) {
      const next = node.keywords.filter((k) => k !== `doc:${id}`);
      await prisma.knowledgeNode.update({
        where: { id: node.id },
        data: { keywords: next },
      });
    }

    await prisma.docUpload.delete({ where: { id } });
    return NextResponse.json({ success: true, unlinkedNodes: linkedNodes.length });
  } catch (error: unknown) {
    console.error('[doc/delete] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
