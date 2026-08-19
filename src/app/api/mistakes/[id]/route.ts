import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';

// GET /api/mistakes/[id]
// Returns the full Mistake row (with subject + knowledgeNode joined)
// so the /mistakes/[id]/review page can render the question +
// correct/wrong answer + AI analysis without re-fetching.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(_req);
    const { id } = await params;
    const mistake = await prisma.mistake.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true, icon: true } },
        knowledgeNode: { select: { id: true, title: true } },
      },
    });
    if (!mistake) {
      return NextResponse.json({ error: 'Mistake not found' }, { status: 404 });
    }
    if (mistake.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }
    return NextResponse.json(mistake);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await resolveUserIdFromRequest(req);
    const body = await req.json();
    const resolved = body?.resolved;

    if (typeof resolved !== 'boolean') {
      return NextResponse.json({ error: 'resolved must be a boolean' }, { status: 400 });
    }

    const updated = await prisma.mistake.updateMany({
      where: { id, userId },
      data: { resolved },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Mistake not found' }, { status: 404 });
    }

    const mistake = await prisma.mistake.findUnique({ where: { id } });
    return NextResponse.json(mistake);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await resolveUserIdFromRequest(req);

    const deleted = await prisma.mistake.deleteMany({
      where: { id, userId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Mistake not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: getErrorStatus(error) });
  }
}
