import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// GET /api/exam/list
// Returns the user's recent exam uploads, newest first. The
// dashboard's "历史" (history) tab uses this to show prior
// 拍照讲题 sessions so the user can re-open and re-attempt them.
// imageData is excluded — it's already saved and re-downloading
// the bytes is unnecessary for the history list.
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const exams = await prisma.examUpload.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        subjectName: true,
        ocrText: true,
        knowledgePoints: true,
        practiceQuestions: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ exams });
  } catch (error: unknown) {
    console.error('[exam/list] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
