import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// GET /api/exam/[id]
// Returns the full upload record (no imageData — too large for the
// dashboard). Used by the exam detail page to render OCR text,
// knowledge points, and the saved practice questions.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id } = await params;

    const exam = await prisma.examUpload.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        subjectName: true,
        ocrText: true,
        knowledgePoints: true,
        practiceQuestions: true,
        userNotes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!exam) {
      return NextResponse.json({ error: '试卷不存在' }, { status: 404 });
    }
    if (exam.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    return NextResponse.json(exam);
  } catch (error: unknown) {
    console.error('[exam/get] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

// PATCH /api/exam/[id]
// Body: { userNotes?: string }
// Persist the user's own notes for the exam (free-form text, e.g.
// their own worked solution). Currently the only mutable field
// besides the auto-managed knowledge points / practice questions.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      userNotes?: unknown;
    };

    const exam = await prisma.examUpload.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!exam) {
      return NextResponse.json({ error: '试卷不存在' }, { status: 404 });
    }
    if (exam.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const data: { userNotes?: string } = {};
    if (typeof body.userNotes === 'string') {
      data.userNotes = body.userNotes;
    }

    const updated = await prisma.examUpload.update({
      where: { id },
      data,
      select: { id: true, userNotes: true, updatedAt: true },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[exam/patch] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

// DELETE /api/exam/[id]
// Removes the user's exam-photo upload (the stored image bytea +
// OCR text + analysis + practice questions). Cascades to the
// KnowledgeNode marker if any was created via /create-node.
//
// Used by the dashboard history list to clean up old entries.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id } = await params;
    const exam = await prisma.examUpload.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!exam) {
      return NextResponse.json({ error: '试卷不存在' }, { status: 404 });
    }
    if (exam.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // Also unlink any KnowledgeNode that was created from this exam
    // (the create-node route stores 'exam:<examId>' in the node's
    // keywords array so we can find it). We remove the marker but
    // keep the node itself — the user can re-link it via ICAP
    // training if they want, or delete it manually later.
    const linkedNodes = await prisma.knowledgeNode.findMany({
      where: { keywords: { has: `exam:${id}` } },
      select: { id: true, keywords: true },
    });
    for (const node of linkedNodes) {
      const next = node.keywords.filter((k) => k !== `exam:${id}`);
      await prisma.knowledgeNode.update({
        where: { id: node.id },
        data: { keywords: next },
      });
    }

    await prisma.examUpload.delete({ where: { id } });
    return NextResponse.json({ success: true, unlinkedNodes: linkedNodes.length });
  } catch (error: unknown) {
    console.error('[exam/delete] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
